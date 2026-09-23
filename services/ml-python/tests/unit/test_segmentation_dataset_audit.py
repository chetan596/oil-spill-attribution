"""
Unit tests for Real Optical Oil-Spill Segmentation Dataset Audit (Part 0.14C.1)
Verifies image-mask pairing, mask dimensions, split isolation, zero leakage, and manifest integrity.
"""

import json
from pathlib import Path
import pytest
from PIL import Image
import numpy as np
import rasterio

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
SEG_METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "segmentation"
EXTERNAL_MANIFEST_PATH = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "external_test_manifest.json"


@pytest.fixture
def segmentation_manifests():
    with open(SEG_METADATA_DIR / "segmentation_image_manifest.json", "r", encoding="utf-8") as f:
        master = json.load(f)
    with open(SEG_METADATA_DIR / "segmentation_train_manifest.json", "r", encoding="utf-8") as f:
        train = json.load(f)
    with open(SEG_METADATA_DIR / "segmentation_validation_manifest.json", "r", encoding="utf-8") as f:
        val = json.load(f)
    with open(SEG_METADATA_DIR / "segmentation_internal_test_manifest.json", "r", encoding="utf-8") as f:
        internal_test = json.load(f)
    with open(SEG_METADATA_DIR / "mask_statistics.json", "r", encoding="utf-8") as f:
        stats = json.load(f)
    return {
        "master": master,
        "train": train,
        "val": val,
        "internal_test": internal_test,
        "stats": stats
    }


def test_segmentation_manifest_counts_and_completeness(segmentation_manifests):
    master = segmentation_manifests["master"]
    train = segmentation_manifests["train"]
    val = segmentation_manifests["val"]
    internal_test = segmentation_manifests["internal_test"]
    stats = segmentation_manifests["stats"]

    assert len(master) == 3529
    assert len(train) == 1961
    assert len(val) == 730
    assert len(internal_test) == 708
    assert stats["splits"]["external_test_count"] == 130
    assert len(train) + len(val) + len(internal_test) + 130 == 3529


def test_image_mask_pairing_and_dimensions_on_disk(segmentation_manifests):
    master = segmentation_manifests["master"]
    sample_items = master[:20] + master[1000:1020] + master[3000:3020]

    for item in sample_items:
        img_p = PROJECT_ROOT / item["image_path"]
        mask_p = PROJECT_ROOT / item["mask_path"]

        assert img_p.exists(), f"Missing image: {img_p}"
        assert mask_p.exists(), f"Missing mask: {mask_p}"

        with Image.open(img_p) as im:
            iw, ih = im.size

        if item["source_dataset"] == "MADOS_Sentinel2":
            with rasterio.open(mask_p) as src:
                mh, mw = src.shape
            assert (iw, ih) == (mw, mh), f"Dimension mismatch in {item['image_id']}"
        else:
            with Image.open(mask_p) as m:
                mw, mh = m.size
            assert (iw, ih) == (mw, mh), f"Dimension mismatch in {item['image_id']}"


def test_oil_class_mapping_semantics(segmentation_manifests):
    master = segmentation_manifests["master"]
    oil_samples = [r for r in master if r["is_oil_positive"]][:10]

    for sample in oil_samples:
        mask_p = PROJECT_ROOT / sample["mask_path"]
        if sample["source_dataset"] == "MADOS_Sentinel2":
            with rasterio.open(mask_p) as src:
                arr = src.read(1)
            assert 6 in arr, f"Expected Class 6 in MADOS oil mask {sample['image_id']}"
            assert np.sum(arr == 6) == sample["oil_pixel_count"]
        else:
            with Image.open(mask_p) as m:
                m_arr = np.array(m)
            if m_arr.ndim == 3:
                is_oil = (m_arr[:, :, 0] > 200) & (m_arr[:, :, 1] < 50) & (m_arr[:, :, 2] > 100)
            else:
                is_oil = (m_arr == 1)
            assert np.sum(is_oil) == sample["oil_pixel_count"]


def test_split_isolation_and_zero_leakage(segmentation_manifests):
    train = segmentation_manifests["train"]
    val = segmentation_manifests["val"]
    internal_test = segmentation_manifests["internal_test"]

    train_shas = {r["sha256_image"] for r in train}
    val_shas = {r["sha256_image"] for r in val}
    test_shas = {r["sha256_image"] for r in internal_test}

    assert len(train_shas & val_shas) == 0, "SHA overlap between Train and Val"
    assert len(train_shas & test_shas) == 0, "SHA overlap between Train and Test"
    assert len(val_shas & test_shas) == 0, "SHA overlap between Val and Test"

    train_scenes = {r["scene_id"] for r in train if r["scene_id"] != "UNKNOWN"}
    val_scenes = {r["scene_id"] for r in val if r["scene_id"] != "UNKNOWN"}
    test_scenes = {r["scene_id"] for r in internal_test if r["scene_id"] != "UNKNOWN"}

    assert len(train_scenes & val_scenes) == 0, "Scene overlap between Train and Val"
    assert len(train_scenes & test_scenes) == 0, "Scene overlap between Train and Test"
    assert len(val_scenes & test_scenes) == 0, "Scene overlap between Val and Test"


def test_external_test_isolation():
    with open(EXTERNAL_MANIFEST_PATH, "r", encoding="utf-8") as f:
        ext_data = json.load(f)
    ext_records = ext_data["images"]

    with open(SEG_METADATA_DIR / "segmentation_train_manifest.json", "r", encoding="utf-8") as f:
        train = json.load(f)
    with open(SEG_METADATA_DIR / "segmentation_validation_manifest.json", "r", encoding="utf-8") as f:
        val = json.load(f)
    with open(SEG_METADATA_DIR / "segmentation_internal_test_manifest.json", "r", encoding="utf-8") as f:
        internal_test = json.load(f)

    ext_shas = {r["sha256"] for r in ext_records}
    train_shas = {r["sha256_image"] for r in train}
    val_shas = {r["sha256_image"] for r in val}
    test_shas = {r["sha256_image"] for r in internal_test}

    assert len(ext_shas & train_shas) == 0, "External test leaked into Train"
    assert len(ext_shas & val_shas) == 0, "External test leaked into Validation"
    assert len(ext_shas & test_shas) == 0, "External test leaked into Internal Test"


def test_mask_quality_audit_stats(segmentation_manifests):
    stats = segmentation_manifests["stats"]
    assert stats["quality_distribution"]["INVALID"] == 0
    assert stats["total_paired_images"] == 3529
    assert stats["total_oil_positive_images"] == 923
    assert stats["total_oil_negative_images"] == 2606
    assert stats["sources"]["MADOS_Sentinel2"]["total_pairs"] == 2734
    assert stats["sources"]["Kerf_Drone_Oil_Spill"]["total_pairs"] == 795
