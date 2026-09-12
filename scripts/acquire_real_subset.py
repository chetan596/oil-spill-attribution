#!/usr/bin/env python3
"""
acquire_real_subset.py — Phase 3D-1 Real Sentinel-1 SAR Dataset Acquisition
===========================================================================

Acquires a small representative real-data sample (~5 samples per category)
from the official Zenodo Sentinel-1 SAR Oil Spill dataset without downloading
the full ~96 GB dataset.

Uses HTTP range requests with local block caching to stream only the archive
index and the first few target scenes from:
  - Part I (zenodo.8346860): Oil spill scenes
  - Part II (zenodo.8253899): No-oil and Look-alike scenes
  - Part III (zenodo.13761290): Test set scenes

Extracts directly to:
  data/raw/satellite/real/
    part1_oil/
      images/
      masks/
    part2_no_oil/
      images/
      masks/
    part2_lookalike/
      images/
      masks/
    part3_test/
      images/
      masks/
"""

import io
import json
import os
import shutil
import subprocess
import sys
import py7zr

# Configuration
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_REAL_DIR = os.path.join(BASE_DIR, "data", "raw", "satellite", "real")
SCRATCH_DIR = r"C:\Users\cheta\.gemini\antigravity-ide\brain\c148ac0e-0e5c-4653-9e17-e600631cf18c\scratch"
CACHE_DIR = os.path.join(SCRATCH_DIR, "zenodo_chunk_cache")
MASKS_DIR = os.path.join(SCRATCH_DIR, "zenodo_masks")

PART1_IMAGE_URL = "https://zenodo.org/api/records/8346860/files/01_Train_Val_Oil_Spill_images.7z/content"
PART1_IMAGE_SIZE = 40712942245

PART2_NO_OIL_URL = "https://zenodo.org/api/records/8253899/files/01_Train_Val_No_Oil_Images.7z/content"
PART2_NO_OIL_SIZE = 22931223979

PART2_LOOKALIKE_URL = "https://zenodo.org/api/records/8253899/files/01_Train_Val_Lookalike_images.7z/content"
PART2_LOOKALIKE_SIZE = 22993852696

PART3_TEST_URL = "https://zenodo.org/api/records/13761290/files/02_Test_images_and_ground_truth.7z/content"
PART3_TEST_SIZE = 9859650011


class CachedZenodoStream(io.RawIOBase):
    """
    Virtual seekable stream over a remote Zenodo .7z file, caching 8 MB blocks locally.
    """
    def __init__(self, url: str, total_size: int, cache_subdir: str, chunk_size: int = 8 * 1024 * 1024):
        self.url = url
        self.total_size = total_size
        self.cache_dir = os.path.join(CACHE_DIR, cache_subdir)
        self.chunk_size = chunk_size
        self.pos = 0
        os.makedirs(self.cache_dir, exist_ok=True)

    def seekable(self) -> bool:
        return True

    def readable(self) -> bool:
        return True

    def seek(self, offset: int, whence: int = 0) -> int:
        if whence == 0:
            self.pos = offset
        elif whence == 1:
            self.pos += offset
        elif whence == 2:
            self.pos = self.total_size + offset
        if self.pos < 0:
            self.pos = 0
        return self.pos

    def tell(self) -> int:
        return self.pos

    def _get_chunk(self, chunk_idx: int) -> bytes:
        chunk_file = os.path.join(self.cache_dir, f"chunk_{chunk_idx:06d}.bin")
        if os.path.exists(chunk_file) and os.path.getsize(chunk_file) > 0:
            with open(chunk_file, "rb") as f:
                return f.read()

        start = chunk_idx * self.chunk_size
        end = min(self.total_size - 1, start + self.chunk_size - 1)
        expected_len = end - start + 1
        sys.stdout.write(f"  [HTTP RANGE] Fetching block {chunk_idx:04d} (bytes {start}..{end})...\n")
        sys.stdout.flush()

        import time
        max_attempts = 10
        for attempt in range(1, max_attempts + 1):
            cmd = ["curl.exe", "-s", "--connect-timeout", "30", "--max-time", "300", "-r", f"{start}-{end}", self.url]
            res = subprocess.run(cmd, capture_output=True)
            if res.returncode == 0 and len(res.stdout) == expected_len:
                data = res.stdout
                with open(chunk_file, "wb") as f:
                    f.write(data)
                return data
            else:
                sys.stdout.write(f"    Warning: block {chunk_idx} fetch attempt {attempt} failed (rc={res.returncode}, got {len(res.stdout)} bytes). Backing off 15s...\n")
                sys.stdout.flush()
                time.sleep(15)
        raise RuntimeError(f"Failed to fetch block {chunk_idx} after {max_attempts} attempts.")

    def readinto(self, b) -> int:
        if self.pos >= self.total_size:
            return 0
        l = min(len(b), self.total_size - self.pos)
        chunk_idx = self.pos // self.chunk_size
        offset_in_chunk = self.pos % self.chunk_size

        chunk_data = self._get_chunk(chunk_idx)
        available = len(chunk_data) - offset_in_chunk
        to_copy = min(l, available)
        b[:to_copy] = chunk_data[offset_in_chunk:offset_in_chunk + to_copy]
        self.pos += to_copy
        return to_copy


def acquire_part1_oil(num_samples: int = 5):
    print(f"\n==========================================")
    print(f"Acquiring Part I — Oil Spill ({num_samples} samples)")
    print(f"==========================================")
    dest_img_dir = os.path.join(DATA_REAL_DIR, "part1_oil", "images")
    dest_mask_dir = os.path.join(DATA_REAL_DIR, "part1_oil", "masks")
    os.makedirs(dest_img_dir, exist_ok=True)
    os.makedirs(dest_mask_dir, exist_ok=True)

    stream = CachedZenodoStream(PART1_IMAGE_URL, PART1_IMAGE_SIZE, "part1_oil_images")
    print("Reading Part I image archive directory...")
    with py7zr.SevenZipFile(stream, mode="r") as z:
        names = [n for n in z.getnames() if n.endswith(".tif")]
        target_imgs = names[:num_samples]
        print(f"Target image files: {target_imgs}")

        temp_extract = os.path.join(SCRATCH_DIR, "temp_part1_img")
        os.makedirs(temp_extract, exist_ok=True)
        z.extract(path=temp_extract, targets=target_imgs)

        for img_rel in target_imgs:
            src_path = os.path.join(temp_extract, img_rel)
            fname = os.path.basename(img_rel)
            dst_path = os.path.join(dest_img_dir, fname)
            shutil.move(src_path, dst_path)
            print(f"  Moved image -> {dst_path}")

    # Extract corresponding masks from local archive
    mask_archive = os.path.join(MASKS_DIR, "01_Train_Val_Oil_Spill_mask.7z")
    with py7zr.SevenZipFile(mask_archive, mode="r") as z:
        all_mask_names = z.getnames()
        target_masks = []
        for img_rel in target_imgs:
            fname = os.path.basename(img_rel)
            matching = [m for m in all_mask_names if os.path.basename(m) == fname]
            if matching:
                target_masks.append(matching[0])

        print(f"Target mask files: {target_masks}")
        temp_extract_mask = os.path.join(SCRATCH_DIR, "temp_part1_mask")
        os.makedirs(temp_extract_mask, exist_ok=True)
        z.extract(path=temp_extract_mask, targets=target_masks)

        for mask_rel in target_masks:
            src_path = os.path.join(temp_extract_mask, mask_rel)
            fname = os.path.basename(mask_rel)
            dst_path = os.path.join(dest_mask_dir, fname)
            shutil.move(src_path, dst_path)
            print(f"  Moved mask  -> {dst_path}")


def acquire_part2_no_oil(num_samples: int = 5):
    print(f"\n==========================================")
    print(f"Acquiring Part II — No-Oil ({num_samples} samples)")
    print(f"==========================================")
    dest_img_dir = os.path.join(DATA_REAL_DIR, "part2_no_oil", "images")
    dest_mask_dir = os.path.join(DATA_REAL_DIR, "part2_no_oil", "masks")
    os.makedirs(dest_img_dir, exist_ok=True)
    os.makedirs(dest_mask_dir, exist_ok=True)

    stream = CachedZenodoStream(PART2_NO_OIL_URL, PART2_NO_OIL_SIZE, "part2_no_oil_images")
    print("Reading Part II No-Oil archive directory...")
    with py7zr.SevenZipFile(stream, mode="r") as z:
        names = [n for n in z.getnames() if n.endswith(".tif")]
        target_imgs = names[:num_samples]
        print(f"Target image files: {target_imgs}")

        temp_extract = os.path.join(SCRATCH_DIR, "temp_part2_no_oil_img")
        os.makedirs(temp_extract, exist_ok=True)
        z.extract(path=temp_extract, targets=target_imgs)

        for img_rel in target_imgs:
            src_path = os.path.join(temp_extract, img_rel)
            fname = os.path.basename(img_rel)
            dst_path = os.path.join(dest_img_dir, fname)
            shutil.move(src_path, dst_path)
            print(f"  Moved image -> {dst_path}")

    # Masks from local archive
    mask_archive = os.path.join(MASKS_DIR, "01_Train_Val_No_Oil_mask.7z")
    with py7zr.SevenZipFile(mask_archive, mode="r") as z:
        all_mask_names = z.getnames()
        target_masks = []
        for img_rel in target_imgs:
            fname = os.path.basename(img_rel)
            matching = [m for m in all_mask_names if os.path.basename(m) == fname]
            if matching:
                target_masks.append(matching[0])

        print(f"Target mask files: {target_masks}")
        temp_extract_mask = os.path.join(SCRATCH_DIR, "temp_part2_no_oil_mask")
        os.makedirs(temp_extract_mask, exist_ok=True)
        z.extract(path=temp_extract_mask, targets=target_masks)

        for mask_rel in target_masks:
            src_path = os.path.join(temp_extract_mask, mask_rel)
            fname = os.path.basename(mask_rel)
            dst_path = os.path.join(dest_mask_dir, fname)
            shutil.move(src_path, dst_path)
            print(f"  Moved mask  -> {dst_path}")


def acquire_part2_lookalike(num_samples: int = 5):
    print(f"\n==========================================")
    print(f"Acquiring Part II — Lookalike ({num_samples} samples)")
    print(f"==========================================")
    dest_img_dir = os.path.join(DATA_REAL_DIR, "part2_lookalike", "images")
    dest_mask_dir = os.path.join(DATA_REAL_DIR, "part2_lookalike", "masks")
    os.makedirs(dest_img_dir, exist_ok=True)
    os.makedirs(dest_mask_dir, exist_ok=True)

    stream = CachedZenodoStream(PART2_LOOKALIKE_URL, PART2_LOOKALIKE_SIZE, "part2_lookalike_images")
    print("Reading Part II Lookalike archive directory...")
    with py7zr.SevenZipFile(stream, mode="r") as z:
        names = [n for n in z.getnames() if n.endswith(".tif")]
        target_imgs = names[:num_samples]
        print(f"Target image files: {target_imgs}")

        temp_extract = os.path.join(SCRATCH_DIR, "temp_part2_lookalike_img")
        os.makedirs(temp_extract, exist_ok=True)
        z.extract(path=temp_extract, targets=target_imgs)

        for img_rel in target_imgs:
            src_path = os.path.join(temp_extract, img_rel)
            fname = os.path.basename(img_rel)
            dst_path = os.path.join(dest_img_dir, fname)
            shutil.move(src_path, dst_path)
            print(f"  Moved image -> {dst_path}")

    # Masks from local archive
    mask_archive = os.path.join(MASKS_DIR, "01_Train_Val_Lookalike_mask.7z")
    with py7zr.SevenZipFile(mask_archive, mode="r") as z:
        all_mask_names = z.getnames()
        target_masks = []
        for img_rel in target_imgs:
            fname = os.path.basename(img_rel)
            matching = [m for m in all_mask_names if os.path.basename(m) == fname]
            if matching:
                target_masks.append(matching[0])

        print(f"Target mask files: {target_masks}")
        temp_extract_mask = os.path.join(SCRATCH_DIR, "temp_part2_lookalike_mask")
        os.makedirs(temp_extract_mask, exist_ok=True)
        z.extract(path=temp_extract_mask, targets=target_masks)

        for mask_rel in target_masks:
            src_path = os.path.join(temp_extract_mask, mask_rel)
            fname = os.path.basename(mask_rel)
            dst_path = os.path.join(dest_mask_dir, fname)
            shutil.move(src_path, dst_path)
            print(f"  Moved mask  -> {dst_path}")


def acquire_part3_test(num_samples: int = 5):
    print(f"\n==========================================")
    print(f"Acquiring Part III — Test Set ({num_samples} samples)")
    print(f"==========================================")
    dest_img_dir = os.path.join(DATA_REAL_DIR, "part3_test", "images")
    dest_mask_dir = os.path.join(DATA_REAL_DIR, "part3_test", "masks")
    os.makedirs(dest_img_dir, exist_ok=True)
    os.makedirs(dest_mask_dir, exist_ok=True)

    stream = CachedZenodoStream(PART3_TEST_URL, PART3_TEST_SIZE, "part3_test_archive")
    print("Reading Part III archive directory...")
    with py7zr.SevenZipFile(stream, mode="r") as z:
        all_names = z.getnames()
        # Find images in Part III
        img_names = [n for n in all_names if n.startswith("Images/") and n.endswith(".tif")]
        target_imgs = img_names[:num_samples]
        print(f"Target test images: {target_imgs}")

        # Find matching masks in Part III
        # Mask naming in Part III: Mask/{Cat}/{num}_segmentation.tif or Mask/{Cat}/{num}.tif
        target_masks = []
        for img_rel in target_imgs:
            parts = img_rel.split("/")
            cat = parts[1] if len(parts) > 2 else ""
            base_no_ext = os.path.splitext(os.path.basename(img_rel))[0]
            prefix = f"Mask/{cat}/" if cat else "Mask/"
            matching = [m for m in all_names if m.startswith(prefix) and base_no_ext in m and m.endswith(".tif")]
            if matching:
                target_masks.append(matching[0])

        print(f"Target test masks: {target_masks}")

        temp_extract = os.path.join(SCRATCH_DIR, "temp_part3")
        os.makedirs(temp_extract, exist_ok=True)
        z.extract(path=temp_extract, targets=target_imgs + target_masks)

        for img_rel in target_imgs:
            src_path = os.path.join(temp_extract, img_rel)
            fname = os.path.basename(img_rel)
            dst_path = os.path.join(dest_img_dir, fname)
            shutil.move(src_path, dst_path)
            print(f"  Moved test image -> {dst_path}")

        for mask_rel in target_masks:
            src_path = os.path.join(temp_extract, mask_rel)
            fname = os.path.basename(mask_rel)
            clean_fname = fname.replace("_segmentation", "") if "_segmentation" in fname else fname
            dst_path = os.path.join(dest_mask_dir, clean_fname)
            shutil.move(src_path, dst_path)
            print(f"  Moved test mask  -> {dst_path}")


def main():
    print("Starting Phase 3D-1 Real Dataset Acquisition...")
    acquire_part1_oil(5)
    acquire_part2_no_oil(5)
    acquire_part2_lookalike(5)
    acquire_part3_test(5)
    print("\nAll 4 real dataset subsets acquired successfully!")


if __name__ == "__main__":
    main()
