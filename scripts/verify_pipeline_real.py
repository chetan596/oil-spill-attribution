"""
Pipeline Verification on Real Sentinel-1 SAR Dataset — Phase 3D-1
==================================================================
Runs the verified real dataset through:
  GeoTIFF → raster validator → SAR preprocessing → normalization → tiling → mask loading → alignment → Dataset
"""

import sys
import os
from pathlib import Path
import numpy as np

# Add services/ml-python to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "services" / "ml-python"))

from app.data.loaders.sar_dataset import SARSpillDataset, HAS_TORCH
from app.data.validators.manifest_validator import validate_manifest
from app.data.validators.raster_validator import validate_dataset_directory

MANIFEST_PATH = str(BASE_DIR / "data" / "raw" / "satellite" / "dataset_manifest.json")


def run_pipeline_verification():
    print("=" * 80)
    print("PHASE 3D-1: REAL SENTINEL-1 SAR PIPELINE VERIFICATION")
    print("=" * 80)

    # 1. Manifest Validation
    print("\n[STEP 1] Validating Manifest...")
    manifest_report = validate_manifest(MANIFEST_PATH)
    print(f"  Manifest valid: {manifest_report['is_valid']}")
    print(f"  Passed checks: {manifest_report['summary']['passed']}")
    print(f"  Failed checks: {manifest_report['summary']['failed']}")
    assert manifest_report["is_valid"], "Manifest validation failed"

    # 2. Raster Validation
    print("\n[STEP 2] Validating Rasters & Masks...")
    raster_reports = validate_dataset_directory(MANIFEST_PATH, verbose=False)
    passed = sum(1 for r in raster_reports if r.get("is_valid", False))
    failed = sum(1 for r in raster_reports if not r.get("is_valid", False))
    print(f"  Total scenes: {len(raster_reports)}")
    print(f"  Passed scenes: {passed}")
    print(f"  Failed scenes: {failed}")
    assert failed == 0, "Raster validation failed"

    # 3. Dataset & Split Validation
    print("\n[STEP 3] Validating Dataset Across Splits...")
    for split in ["train", "val", "test"]:
        ds = SARSpillDataset(
            manifest_path=MANIFEST_PATH,
            split=split,
            mode="binary",
            tile_size=512,
            polarization="VV+VH",
            augment=(split == "train"),
        )
        print(f"  Split: {split:5s} | Scenes: {len(ds._scenes):2d} | 512x512 Tiles: {len(ds):3d}")
        img_tile, mask_tile, meta = ds[0]
        print(f"    Sample tile shape: image={list(img_tile.shape)}, mask={list(mask_tile.shape)}")
        print(f"    Image range: [{img_tile.min():.4f}, {img_tile.max():.4f}] (dtype={img_tile.dtype})")
        print(f"    Mask unique values: {np.unique(mask_tile).tolist()} (dtype={mask_tile.dtype})")
        assert list(img_tile.shape) == [2, 512, 512], f"Expected image [2, 512, 512], got {img_tile.shape}"
        assert list(mask_tile.shape) == [512, 512], f"Expected mask [512, 512], got {mask_tile.shape}"
        assert img_tile.min() >= 0.0 and img_tile.max() <= 1.0, "Image normalization outside [0, 1]"

    # 4. Full dataset single tile confirmation
    print("\n[STEP 4] Single Tile Shape & Alignment Confirmation...")
    ds_full = SARSpillDataset(
        manifest_path=MANIFEST_PATH,
        split=None,
        mode="binary",
        tile_size=512,
        polarization="VV+VH",
        augment=False,
    )
    img_sample, mask_sample, meta = ds_full[0]
    print(f"  image tensor = {list(img_sample.shape)}")
    print(f"  mask tensor  = {list(mask_sample.shape)}")
    print(f"  scene_id     = {meta['scene_id']}")
    print(f"  source       = {meta['source']}")
    print(f"  polarization = {meta['polarization']}")
    print(f"  crs          = {meta['crs']}")

    assert list(img_sample.shape) == [2, 512, 512]
    assert list(mask_sample.shape) == [512, 512]

    # Verify tile extraction on oil scene
    oil_tiles_with_positive = 0
    for i in range(min(len(ds_full), 64)):
        _, m, _ = ds_full[i]
        if np.any(m == 1):
            oil_tiles_with_positive += 1
    print(f"  Positive oil spill tiles detected in first 64 tiles: {oil_tiles_with_positive}")

    print("\n" + "=" * 80)
    print("PIPELINE CONFIRMED:")
    print("  image tensor = [2, 512, 512]")
    print("  mask tensor  = [512, 512]")
    print("=" * 80)


if __name__ == "__main__":
    run_pipeline_verification()
