import io
import json
import os
import shutil
import subprocess
import sys
import py7zr

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


class CachedZenodoStream(io.RawIOBase):
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
                sys.stdout.write(f"    Warning: block {chunk_idx} fetch attempt {attempt} failed. Retrying in 5s...\n")
                sys.stdout.flush()
                time.sleep(5)
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


def expand_part1_oil(total_target: int = 15):
    print(f"\n==========================================")
    print(f"Expanding Part I — Oil Spill to {total_target} scenes")
    print(f"==========================================")
    dest_img_dir = os.path.join(DATA_REAL_DIR, "part1_oil", "images")
    dest_mask_dir = os.path.join(DATA_REAL_DIR, "part1_oil", "masks")
    os.makedirs(dest_img_dir, exist_ok=True)
    os.makedirs(dest_mask_dir, exist_ok=True)

    existing_imgs = set(os.listdir(dest_img_dir))
    print(f"Existing Part I images ({len(existing_imgs)}): {sorted(list(existing_imgs))}")

    stream = CachedZenodoStream(PART1_IMAGE_URL, PART1_IMAGE_SIZE, "part1_oil_images")
    with py7zr.SevenZipFile(stream, mode="r") as z:
        all_names = [n for n in z.getnames() if n.endswith(".tif")]
        # Pick images that are not yet downloaded
        target_imgs = []
        for n in all_names:
            fname = os.path.basename(n)
            if fname not in existing_imgs:
                target_imgs.append(n)
            if len(existing_imgs) + len(target_imgs) >= total_target:
                break

        print(f"New target image files to fetch ({len(target_imgs)}): {target_imgs}")
        if target_imgs:
            temp_extract = os.path.join(SCRATCH_DIR, "temp_part1_expand_img")
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

        print(f"Extracting {len(target_masks)} corresponding masks...")
        if target_masks:
            temp_extract_mask = os.path.join(SCRATCH_DIR, "temp_part1_expand_mask")
            os.makedirs(temp_extract_mask, exist_ok=True)
            z.extract(path=temp_extract_mask, targets=target_masks)

            for mask_rel in target_masks:
                src_path = os.path.join(temp_extract_mask, mask_rel)
                fname = os.path.basename(mask_rel)
                dst_path = os.path.join(dest_mask_dir, fname)
                shutil.move(src_path, dst_path)
                print(f"  Moved mask  -> {dst_path}")


def expand_part2_no_oil(total_target: int = 10):
    print(f"\n==========================================")
    print(f"Expanding Part II — No Oil to {total_target} scenes")
    print(f"==========================================")
    dest_img_dir = os.path.join(DATA_REAL_DIR, "part2_no_oil", "images")
    dest_mask_dir = os.path.join(DATA_REAL_DIR, "part2_no_oil", "masks")
    os.makedirs(dest_img_dir, exist_ok=True)
    os.makedirs(dest_mask_dir, exist_ok=True)

    existing_imgs = set(os.listdir(dest_img_dir))
    print(f"Existing Part II No-Oil images ({len(existing_imgs)}): {sorted(list(existing_imgs))}")

    stream = CachedZenodoStream(PART2_NO_OIL_URL, PART2_NO_OIL_SIZE, "part2_no_oil_images")
    with py7zr.SevenZipFile(stream, mode="r") as z:
        all_names = [n for n in z.getnames() if n.endswith(".tif")]
        target_imgs = []
        for n in all_names:
            fname = os.path.basename(n)
            if fname not in existing_imgs:
                target_imgs.append(n)
            if len(existing_imgs) + len(target_imgs) >= total_target:
                break

        print(f"New target image files to fetch ({len(target_imgs)}): {target_imgs}")
        if target_imgs:
            temp_extract = os.path.join(SCRATCH_DIR, "temp_part2_no_oil_expand_img")
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

        print(f"Extracting {len(target_masks)} corresponding masks...")
        if target_masks:
            temp_extract_mask = os.path.join(SCRATCH_DIR, "temp_part2_no_oil_expand_mask")
            os.makedirs(temp_extract_mask, exist_ok=True)
            z.extract(path=temp_extract_mask, targets=target_masks)

            for mask_rel in target_masks:
                src_path = os.path.join(temp_extract_mask, mask_rel)
                fname = os.path.basename(mask_rel)
                dst_path = os.path.join(dest_mask_dir, fname)
                shutil.move(src_path, dst_path)
                print(f"  Moved mask  -> {dst_path}")


def expand_part2_lookalike(total_target: int = 10):
    print(f"\n==========================================")
    print(f"Expanding Part II — Lookalike to {total_target} scenes")
    print(f"==========================================")
    dest_img_dir = os.path.join(DATA_REAL_DIR, "part2_lookalike", "images")
    dest_mask_dir = os.path.join(DATA_REAL_DIR, "part2_lookalike", "masks")
    os.makedirs(dest_img_dir, exist_ok=True)
    os.makedirs(dest_mask_dir, exist_ok=True)

    existing_imgs = set(os.listdir(dest_img_dir))
    print(f"Existing Part II Lookalike images ({len(existing_imgs)}): {sorted(list(existing_imgs))}")

    stream = CachedZenodoStream(PART2_LOOKALIKE_URL, PART2_LOOKALIKE_SIZE, "part2_lookalike_images")
    with py7zr.SevenZipFile(stream, mode="r") as z:
        all_names = [n for n in z.getnames() if n.endswith(".tif")]
        target_imgs = []
        for n in all_names:
            fname = os.path.basename(n)
            if fname not in existing_imgs:
                target_imgs.append(n)
            if len(existing_imgs) + len(target_imgs) >= total_target:
                break

        print(f"New target image files to fetch ({len(target_imgs)}): {target_imgs}")
        if target_imgs:
            temp_extract = os.path.join(SCRATCH_DIR, "temp_part2_lookalike_expand_img")
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

        print(f"Extracting {len(target_masks)} corresponding masks...")
        if target_masks:
            temp_extract_mask = os.path.join(SCRATCH_DIR, "temp_part2_lookalike_expand_mask")
            os.makedirs(temp_extract_mask, exist_ok=True)
            z.extract(path=temp_extract_mask, targets=target_masks)

            for mask_rel in target_masks:
                src_path = os.path.join(temp_extract_mask, mask_rel)
                fname = os.path.basename(mask_rel)
                dst_path = os.path.join(dest_mask_dir, fname)
                shutil.move(src_path, dst_path)
                print(f"  Moved mask  -> {dst_path}")


def main():
    print("Starting Dataset Expansion for Phase 3D-4...")
    expand_part1_oil(15)
    expand_part2_no_oil(10)
    expand_part2_lookalike(10)
    print("\nDataset expansion completed successfully!")


if __name__ == "__main__":
    main()
