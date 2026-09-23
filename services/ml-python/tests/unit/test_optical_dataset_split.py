"""
Unit tests for Part 0.14B.2 — Optical Dataset Split, Event Isolation, and Leakage Audit
"""

import json
from pathlib import Path
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[4]
METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed" / "optical_real"


def test_manifest_files_exist():
    required_manifests = [
        "split_manifest.json",
        "train_manifest.json",
        "validation_manifest.json",
        "internal_test_manifest.json",
        "external_test_manifest.json",
        "leakage_audit.json",
        "group_audit.json",
        "label_mapping_audit.json",
        "image_manifest.json"
    ]
    for mf in required_manifests:
        p = METADATA_DIR / mf
        assert p.exists(), f"Missing required manifest: {mf}"


def test_split_exclusivity_and_zero_sha_overlap():
    with open(METADATA_DIR / "train_manifest.json") as f:
        train_data = json.load(f)
    with open(METADATA_DIR / "validation_manifest.json") as f:
        val_data = json.load(f)
    with open(METADATA_DIR / "internal_test_manifest.json") as f:
        test_data = json.load(f)
    with open(METADATA_DIR / "external_test_manifest.json") as f:
        ext_data = json.load(f)
        ext_images = ext_data["images"] if isinstance(ext_data, dict) else ext_data

    train_sha = set(r["sha256"] for r in train_data)
    val_sha = set(r["sha256"] for r in val_data)
    test_sha = set(r["sha256"] for r in test_data)
    ext_sha = set(r["sha256"] for r in ext_images)

    assert len(train_sha & val_sha) == 0, "SHA-256 collision between train and validation!"
    assert len(train_sha & test_sha) == 0, "SHA-256 collision between train and internal test!"
    assert len(val_sha & test_sha) == 0, "SHA-256 collision between validation and internal test!"
    assert len(train_sha & ext_sha) == 0, "SHA-256 collision between train and external test!"
    assert len(val_sha & ext_sha) == 0, "SHA-256 collision between validation and external test!"
    assert len(test_sha & ext_sha) == 0, "SHA-256 collision between internal test and external test!"


def test_scene_and_group_isolation():
    with open(METADATA_DIR / "train_manifest.json") as f:
        train_data = json.load(f)
    with open(METADATA_DIR / "validation_manifest.json") as f:
        val_data = json.load(f)
    with open(METADATA_DIR / "internal_test_manifest.json") as f:
        test_data = json.load(f)
    with open(METADATA_DIR / "external_test_manifest.json") as f:
        ext_data = json.load(f)
        ext_images = ext_data["images"] if isinstance(ext_data, dict) else ext_data

    def get_scenes(dataset):
        return set(f"{r['source_dataset']}_{r['scene_id']}" for r in dataset)

    def get_groups(dataset):
        return set(r["group_id"] for r in dataset)

    train_scenes = get_scenes(train_data)
    val_scenes = get_scenes(val_data)
    test_scenes = get_scenes(test_data)
    ext_scenes = get_scenes(ext_images)

    assert len(train_scenes & val_scenes) == 0, "Scene leakage between train and val!"
    assert len(train_scenes & test_scenes) == 0, "Scene leakage between train and internal test!"
    assert len(val_scenes & test_scenes) == 0, "Scene leakage between val and internal test!"
    assert len(train_scenes & ext_scenes) == 0, "Scene leakage between train and external test!"
    assert len(val_scenes & ext_scenes) == 0, "Scene leakage between val and external test!"
    assert len(test_scenes & ext_scenes) == 0, "Scene leakage between internal test and external test!"

    train_groups = get_groups(train_data)
    val_groups = get_groups(val_data)
    test_groups = get_groups(test_data)
    ext_groups = get_groups(ext_images)

    assert len(train_groups & val_groups) == 0, "Group leakage between train and val!"
    assert len(train_groups & test_groups) == 0, "Group leakage between train and internal test!"
    assert len(val_groups & test_groups) == 0, "Group leakage between val and internal test!"
    assert len(train_groups & ext_groups) == 0, "Group leakage between train and external test!"
    assert len(val_groups & ext_groups) == 0, "Group leakage between val and external test!"
    assert len(test_groups & ext_groups) == 0, "Group leakage between internal test and external test!"


def test_external_test_is_sealed():
    with open(METADATA_DIR / "external_test_manifest.json") as f:
        ext_manifest = json.load(f)
    assert ext_manifest.get("status") == "SEALED", "External test manifest is not marked SEALED!"
    assert len(ext_manifest["images"]) == 130, f"Expected 130 external test images, got {len(ext_manifest['images'])}"


def test_no_sar_or_synthetic_in_optical_dataset():
    with open(METADATA_DIR / "image_manifest.json") as f:
        records = json.load(f)
    for r in records:
        assert r["source_type"] in ["OPTICAL_DRONE", "OPTICAL_SATELLITE", "OPTICAL_AERIAL"], f"Non-optical source_type: {r['source_type']}"
        assert "SAR" not in r["source_type"], "SAR image detected in optical dataset!"
        assert r["quality_status"] == "QUALITY_OK", f"Non-passing quality status: {r['quality_status']}"


def test_processed_directory_structure_exists():
    for split in ["train", "validation", "internal_test", "external_test"]:
        for cat in ["oil_spill", "clean_ocean", "look_alike"]:
            d = PROCESSED_DIR / split / cat
            assert d.exists(), f"Processed directory missing: {d}"
            files = list(d.glob("*"))
            assert len(files) > 0, f"Processed directory empty: {d}"
