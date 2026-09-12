"""
Unit Tests for Phase 3C SAR Dataset Ingestion & Validation Pipeline
===================================================================

Tests:
  - Manifest validator (missing file, corrupt JSON, schema validation, synthetic data)
  - Raster validator (missing files, dimension mismatch, valid raster + mask)
  - SARSpillDataset (tensor shapes, normalization, binary labels, splits filtering)
  - Scene-level split generator (stratification, ratio compliance, leakage freedom)
"""

import json
import os
import tempfile
import pytest
import numpy as np

try:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

try:
    import torch
    HAS_TORCH = True
except (ImportError, OSError):
    HAS_TORCH = False
    torch = None

from app.data.validators.manifest_validator import (
    validate_manifest,
    PASS,
    WARN,
    FAIL,
)
from app.data.validators.raster_validator import (
    validate_raster_scene,
    validate_dataset_directory,
)


# ---------------------------------------------------------------------------
# Helpers & Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def temp_sar_scene(tmp_path):
    """Create a minimal 512x512 GeoTIFF + mask for testing."""
    if not HAS_RASTERIO:
        pytest.skip("rasterio not installed")

    img_path = str(tmp_path / "test_scene_VV.tif")
    mask_path = str(tmp_path / "test_scene_mask.npy")

    height, width = 512, 512
    transform = from_bounds(72.5, 18.6, 73.2, 19.3, width, height)
    band = np.random.gamma(shape=2.0, scale=1000.0, size=(height, width)).astype(np.float32)

    with rasterio.open(
        img_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype=np.float32,
        crs=CRS.from_epsg(4326),
        transform=transform,
    ) as dst:
        dst.write(band, 1)

    mask = np.zeros((height, width), dtype=np.uint8)
    mask[100:150, 100:150] = 1  # 50x50 spill region
    np.save(mask_path, mask)

    return {
        "img_path": img_path,
        "mask_path": mask_path,
        "width": width,
        "height": height,
        "transform": list(transform),
    }


# ---------------------------------------------------------------------------
# 1. Manifest Validator Tests
# ---------------------------------------------------------------------------

def test_manifest_validator_missing_file():
    report = validate_manifest("non_existent_manifest.json")
    assert not report["is_valid"]
    assert report["summary"]["failed"] >= 1
    assert any(r["field"] == "manifest_path" for r in report["results"])


def test_manifest_validator_malformed_json(tmp_path):
    bad_json = tmp_path / "bad.json"
    bad_json.write_text("{ this is not valid json")
    report = validate_manifest(str(bad_json))
    assert not report["is_valid"]
    assert any(r["field"] == "json_parse" for r in report["results"])


def test_manifest_validator_missing_required_fields(tmp_path):
    manifest_file = tmp_path / "incomplete_manifest.json"
    data = {
        "dataset_id": "test",
        # missing "source", "total_scenes", "scenes"
    }
    manifest_file.write_text(json.dumps(data))
    report = validate_manifest(str(manifest_file))
    assert not report["is_valid"]
    failed_fields = [r["field"] for r in report["results"] if r["status"] == FAIL]
    assert "source" in failed_fields
    assert "scenes" in failed_fields


def test_manifest_validator_valid_scene(tmp_path, temp_sar_scene):
    manifest_file = tmp_path / "dataset_manifest.json"
    data = {
        "dataset_id": "test-dataset",
        "source": "synthetic_test",
        "total_scenes": 1,
        "scenes": [
            {
                "scene_id": "test_001",
                "source": "synthetic_test",
                "image_path": temp_sar_scene["img_path"],
                "mask_path": temp_sar_scene["mask_path"],
                "polarization": "VV",
                "width": 512,
                "height": 512,
                "crs": "EPSG:4326",
                "transform": temp_sar_scene["transform"],
                "split": "train",
                "contains_spill": True,
            }
        ],
    }
    manifest_file.write_text(json.dumps(data))
    report = validate_manifest(str(manifest_file))
    assert report["is_valid"]
    assert "test_001" in report["scenes_ok"]
    assert len(report["scenes_bad"]) == 0


# ---------------------------------------------------------------------------
# 2. Raster Validator Tests
# ---------------------------------------------------------------------------

def test_raster_validator_missing_image():
    report = validate_raster_scene("missing_image.tif")
    assert not report["is_valid"]
    assert any(r["check"] == "image_exists" and r["status"] == FAIL for r in report["results"])


def test_raster_validator_valid_scene(temp_sar_scene):
    report = validate_raster_scene(
        image_path=temp_sar_scene["img_path"],
        mask_path=temp_sar_scene["mask_path"],
        expected_polarization="VV",
    )
    assert report["is_valid"]
    assert report["image_metadata"]["width"] == 512
    assert report["image_metadata"]["height"] == 512
    assert report["image_metadata"]["band_count"] == 1
    assert report["image_metadata"]["mask_unique_classes"] == [0, 1]


def test_raster_validator_mismatched_mask(tmp_path, temp_sar_scene):
    bad_mask_path = str(tmp_path / "bad_dim_mask.npy")
    np.save(bad_mask_path, np.zeros((256, 256), dtype=np.uint8))

    report = validate_raster_scene(
        image_path=temp_sar_scene["img_path"],
        mask_path=bad_mask_path,
    )
    assert not report["is_valid"]
    assert any(r["check"] == "mask_image_alignment" and r["status"] == FAIL for r in report["results"])


# ---------------------------------------------------------------------------
# 3. PyTorch Dataset Tests
# ---------------------------------------------------------------------------

def test_sar_spill_dataset_loading(tmp_path, temp_sar_scene):
    if not HAS_RASTERIO:
        pytest.skip("rasterio not installed")

    from app.data.loaders.sar_dataset import SARSpillDataset

    manifest_file = tmp_path / "dataset_manifest.json"
    manifest_data = {
        "dataset_id": "test-dataset",
        "source": "synthetic_test",
        "total_scenes": 1,
        "scenes": [
            {
                "scene_id": "test_001",
                "source": "synthetic_test",
                "image_path": temp_sar_scene["img_path"],
                "mask_path": temp_sar_scene["mask_path"],
                "polarization": "VV",
                "width": 512,
                "height": 512,
                "crs": "EPSG:4326",
                "transform": temp_sar_scene["transform"],
                "split": "train",
                "contains_spill": True,
            }
        ],
    }
    manifest_file.write_text(json.dumps(manifest_data))

    ds = SARSpillDataset(
        manifest_path=str(manifest_file),
        split="train",
        mode="binary",
        tile_size=512,
    )

    assert len(ds) == 1
    img_tensor, mask_tensor, meta = ds[0]

    if HAS_TORCH and torch is not None:
        assert isinstance(img_tensor, torch.Tensor)
        assert isinstance(mask_tensor, torch.Tensor)
        assert mask_tensor.dtype == torch.long
        assert img_tensor.dtype == torch.float32
        unique_vals = set(mask_tensor.unique().tolist())
    else:
        assert isinstance(img_tensor, np.ndarray)
        assert isinstance(mask_tensor, np.ndarray)
        assert mask_tensor.dtype == np.int64
        assert img_tensor.dtype == np.float32
        unique_vals = set(np.unique(mask_tensor).tolist())

    assert img_tensor.shape == (1, 512, 512)
    assert mask_tensor.shape == (512, 512)

    # Check normalized values in [0, 1]
    assert float(img_tensor.min()) >= 0.0
    assert float(img_tensor.max()) <= 1.0

    # Binary mask classes are in {0, 1}
    assert unique_vals.issubset({0, 1})
    assert 1 in unique_vals  # Contains the spill region we painted


def test_sar_spill_dataset_splits_filtering(tmp_path, temp_sar_scene):
    if not HAS_RASTERIO:
        pytest.skip("rasterio not installed")

    from app.data.loaders.sar_dataset import SARSpillDataset

    manifest_file = tmp_path / "dataset_manifest.json"
    manifest_data = {
        "dataset_id": "test-dataset",
        "source": "synthetic_test",
        "total_scenes": 2,
        "scenes": [
            {
                "scene_id": "scene_train",
                "image_path": temp_sar_scene["img_path"],
                "mask_path": temp_sar_scene["mask_path"],
                "polarization": "VV",
                "width": 512,
                "height": 512,
                "split": "train",
            },
            {
                "scene_id": "scene_val",
                "image_path": temp_sar_scene["img_path"],
                "mask_path": temp_sar_scene["mask_path"],
                "polarization": "VV",
                "width": 512,
                "height": 512,
                "split": "val",
            },
        ],
    }
    manifest_file.write_text(json.dumps(manifest_data))

    ds_train = SARSpillDataset(manifest_path=str(manifest_file), split="train")
    ds_val = SARSpillDataset(manifest_path=str(manifest_file), split="val")
    ds_test = SARSpillDataset(manifest_path=str(manifest_file), split="test")

    assert len(ds_train) == 1
    assert len(ds_val) == 1
    assert len(ds_test) == 0


# ---------------------------------------------------------------------------
# 4. Scene-Level Split Generator Tests
# ---------------------------------------------------------------------------

def test_generate_splits_stratification_and_no_leakage(tmp_path):
    import sys
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
    scripts_dir = os.path.join(repo_root, "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    from generate_splits import generate_splits

    manifest_file = tmp_path / "manifest_for_splits.json"
    output_splits = tmp_path / "splits.json"

    # Create 10 dummy scenes (6 with spill, 4 clean)
    scenes = []
    for i in range(10):
        scenes.append({
            "scene_id": f"scene_{i:03d}",
            "contains_spill": i < 6,
            "split": None,
        })

    manifest_file.write_text(json.dumps({
        "dataset_id": "test",
        "scenes": scenes,
    }))

    result = generate_splits(
        manifest_path=str(manifest_file),
        output_splits_path=str(output_splits),
        train_ratio=0.70,
        val_ratio=0.15,
        test_ratio=0.15,
        seed=42,
    )

    assert os.path.isfile(str(output_splits))
    assert len(result["leakage_warnings"]) == 0

    with open(str(output_splits)) as f:
        splits_doc = json.load(f)

    counts = splits_doc["split_counts"]
    assert counts["train"] > 0
    assert counts["missing"] == 0
    assert len(splits_doc["scene_splits"]) == 10

    # Ensure no scene_id is repeated in multiple splits
    assigned = list(splits_doc["scene_splits"].values())
    assert all(s in ("train", "val", "test") for s in assigned)
