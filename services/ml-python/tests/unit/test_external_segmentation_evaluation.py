"""
Unit tests for Final Sealed External Optical Segmentation Evaluation (Part 0.14C.4).

Verifies:
1. External evaluation artifacts exist and are consistent
2. Checkpoint hashes match immutable record
3. Manifest integrity and 130-item evaluation count
4. Zero leakage between external test and training/validation/internal-test splits
5. Metric ranges and confusion matrix consistency
"""

import json
from pathlib import Path
import pytest
import hashlib

PROJECT_ROOT = Path(__file__).resolve().parents[4]
METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "segmentation"
RESULTS_DIR = PROJECT_ROOT / "ml" / "experiments" / "results" / "optical_oil_segmentation_v2"
MODEL_V2_PATH = PROJECT_ROOT / "services" / "ml-python" / "app" / "models" / "optical_oil_segmentation_v2" / "optical_oil_segmentation_v2.pth"


class TestExternalSegmentationEvaluationIntegrity:
    """Verifies external segmentation evaluation outputs and constraints."""

    def test_artifacts_exist(self):
        """Ensure all required JSON artifacts exist."""
        required_files = [
            "external_predictions.json",
            "external_metrics.json",
            "external_image_level_metrics.json",
            "external_source_breakdown.json",
            "external_size_breakdown.json",
            "external_confusion_matrix.json",
            "external_error_analysis.json",
            "external_evaluation_manifest_hash.json"
        ]
        for fname in required_files:
            fpath = RESULTS_DIR / fname
            assert fpath.exists(), f"Missing artifact: {fpath}"

    def test_external_evaluation_counts_and_metrics(self):
        """Verify 130 pairs evaluated with valid metrics."""
        with open(RESULTS_DIR / "external_image_level_metrics.json", "r") as f:
            img_m = json.load(f)
        with open(RESULTS_DIR / "external_metrics.json", "r") as f:
            px_m = json.load(f)

        assert img_m["total_images"] == 130
        assert img_m["tp_images"] + img_m["fn_images"] == 86  # 86 oil-positive
        assert img_m["tn_images"] + img_m["fp_images"] == 44  # 44 oil-negative
        assert img_m["accuracy"] > 0.90
        assert px_m["dice"] > 0.90
        assert px_m["foreground_iou"] > 0.85

    def test_checkpoint_hash_integrity(self):
        """Ensure checkpoint SHA-256 matches evaluation record."""
        assert MODEL_V2_PATH.exists()
        with open(MODEL_V2_PATH, "rb") as f:
            curr_sha = hashlib.sha256(f.read()).hexdigest()

        with open(RESULTS_DIR / "external_evaluation_manifest_hash.json", "r") as f:
            hash_data = json.load(f)

        assert curr_sha == hash_data["v2_checkpoint_sha256"]

    def test_zero_leakage_between_external_and_dev_splits(self):
        """Ensure zero sample overlap between external test and dev manifests."""
        with open(METADATA_DIR / "segmentation_train_manifest.json", "r") as f:
            train = json.load(f)
        with open(METADATA_DIR / "segmentation_validation_manifest.json", "r") as f:
            val = json.load(f)
        with open(METADATA_DIR / "segmentation_internal_test_manifest.json", "r") as f:
            test = json.load(f)
        with open(METADATA_DIR / "segmentation_external_test_manifest.json", "r") as f:
            ext = json.load(f)

        train_shas = {r["sha256_image"] for r in train}
        val_shas = {r["sha256_image"] for r in val}
        test_shas = {r["sha256_image"] for r in test}
        ext_shas = {r["sha256_image"] for r in ext}

        assert len(ext_shas & train_shas) == 0
        assert len(ext_shas & val_shas) == 0
        assert len(ext_shas & test_shas) == 0
