"""
Unit Tests for Benchmark Framework, Model Adapters, Metrics, and Metadata Verification (Phases 2D - 2J).
"""

import os
import tempfile
import pytest
import numpy as np
from PIL import Image

from ml.benchmark.adapter import (
    ModelAdapter,
    BenchmarkPrediction,
    OpticalUNetV2Adapter,
    OpticalClassifierV2Adapter,
    SarUNetResidualAdapter,
)
from ml.benchmark.metrics import (
    calculate_segmentation_metrics,
    calculate_unlabeled_metrics,
    compute_model_agreement,
)
from ml.benchmark.model_size_verifier import ModelMetadataVerifier, ModelMetadata
from ml.benchmark.storage import BenchmarkStorageManager
from ml.benchmark.reporter import BenchmarkReporter
from ml.benchmark.dataset_registry import BenchmarkDatasetRegistry, BenchmarkSample


class TestBenchmarkMetrics:
    """Tests for Phase 2F segmentation and telemetry metrics."""

    def test_perfect_segmentation_match(self):
        """Verify perfect IoU, Dice, Precision, and Recall on identical masks."""
        pred = np.zeros((100, 100), dtype=np.uint8)
        pred[20:50, 20:50] = 1
        gt = pred.copy()

        metrics = calculate_segmentation_metrics(pred_mask=pred, gt_mask=gt)

        assert metrics["iou"] == 1.0
        assert metrics["dice"] == 1.0
        assert metrics["precision"] == 1.0
        assert metrics["recall"] == 1.0
        assert metrics["false_positive_area"] == 0
        assert metrics["false_negative_area"] == 0
        assert metrics["ground_truth_available"] is True
        assert metrics["validated_accuracy_established"] is True

    def test_partial_overlap_metrics(self):
        """Verify metrics on partial false positives and false negatives."""
        # GT: 100 pixels (10x10)
        gt = np.zeros((50, 50), dtype=np.uint8)
        gt[10:20, 10:20] = 1

        # Pred: 100 pixels, shifted 5px -> 50 TP, 50 FP, 50 FN
        pred = np.zeros((50, 50), dtype=np.uint8)
        pred[10:20, 15:25] = 1

        metrics = calculate_segmentation_metrics(pred_mask=pred, gt_mask=gt)

        # TP=50, FP=50, FN=50, Union=150 -> IoU = 50/150 = 0.333333, Dice = 100/200 = 0.50
        assert abs(metrics["iou"] - (1.0 / 3.0)) < 1e-4
        assert abs(metrics["dice"] - 0.50) < 1e-4
        assert abs(metrics["precision"] - 0.50) < 1e-4
        assert abs(metrics["recall"] - 0.50) < 1e-4
        assert metrics["false_positive_area"] == 50
        assert metrics["false_negative_area"] == 50

    def test_unlabeled_metrics_never_fabricates_accuracy(self):
        """Verify unlabeled images produce confidence & spatial coverage, but null accuracy."""
        pred = np.zeros((100, 100), dtype=np.uint8)
        pred[10:30, 10:30] = 1  # 400 pixels
        pred[60:70, 60:70] = 1  # 100 pixels
        prob_map = np.full((100, 100), 0.85, dtype=np.float32)

        res = calculate_unlabeled_metrics(pred_mask=pred, probability_map=prob_map)

        assert res["ground_truth_available"] is False
        assert res["validated_accuracy_established"] is False
        assert res["iou"] is None
        assert res["dice"] is None
        assert res["precision"] is None
        assert res["recall"] is None
        assert res["mask_area_pixels"] == 500
        assert res["mask_coverage_fraction"] == 0.05
        assert res["connected_components_count"] == 2
        assert res["mean_prediction_confidence"] == 0.85

    def test_model_agreement(self):
        """Verify consensus Jaccard agreement calculation."""
        mask_a = np.zeros((50, 50), dtype=np.uint8)
        mask_a[10:30, 10:30] = 1
        mask_b = mask_a.copy()

        agreement = compute_model_agreement(mask_a, mask_b)
        assert agreement == 1.0


class TestModelMetadataVerifier:
    """Tests for Phase 2I model metadata and exact size verification."""

    def test_exact_size_and_sha256(self):
        """Verify SHA-256 and byte size computation on dummy file."""
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pth") as f:
            f.write(b"OceanGuardAI_ModelCheckpoint_BinaryData_1234567890")
            temp_path = f.name

        try:
            meta = ModelMetadataVerifier.verify_checkpoint(
                filepath=temp_path,
                model_name="test-model",
                architecture="TestUNet",
                modality="optical",
                version="1.0.0"
            )
            assert meta.exact_size_bytes == len(b"OceanGuardAI_ModelCheckpoint_BinaryData_1234567890")
            assert meta.size_mb > 0.0
            assert len(meta.sha256) == 64
            assert meta.model_name == "test-model"
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)


class TestBenchmarkStorageAndReporter:
    """Tests for Phase 2G & 2H storage manager and report generation."""

    def test_storage_and_reporting_lifecycle(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            storage = BenchmarkStorageManager(base_dir=tmpdir)
            run_id = storage.create_run_session(run_id="test_run_01")

            assert os.path.exists(os.path.join(tmpdir, "results", "test_run_01"))
            assert os.path.exists(os.path.join(tmpdir, "reports", "test_run_01"))

            # Save sample artifacts
            img = Image.new("RGB", (100, 100), color=(20, 40, 60))
            mask = np.zeros((100, 100), dtype=np.uint8)
            mask[30:70, 30:70] = 1

            artifacts = storage.save_sample_artifacts(
                run_id=run_id,
                model_name="optical-unet-v2",
                sample_id="sample_001",
                source_image=img,
                binary_mask=mask
            )

            assert os.path.exists(artifacts["mask_path"])
            assert os.path.exists(artifacts["overlay_path"])

            # Save metrics
            storage.save_model_metrics(
                run_id=run_id,
                model_name="optical-unet-v2",
                sample_metrics=[{"sample_id": "sample_001", "iou": 0.88}],
                summary_metrics={"model_name": "optical-unet-v2", "mean_iou": 0.88}
            )

            # Generate reports
            reporter = BenchmarkReporter(storage_base_dir=tmpdir)
            reports = reporter.generate_reports(
                run_id=run_id,
                dataset_name="test_dataset",
                models_summary=[{
                    "model_name": "optical-unet-v2",
                    "modality": "optical",
                    "metrics": {"ground_truth_available": True, "iou": 0.88, "dice": 0.93, "precision": 0.91, "recall": 0.95},
                    "performance": {"mean_inference_ms": 12.5, "parameter_count": 15903058, "model_size_bytes": 63743491}
                }]
            )

            assert os.path.exists(reports["report_json"])
            assert os.path.exists(reports["report_md"])

            with open(reports["report_md"], "r", encoding="utf-8") as f:
                md_text = f.read()
            assert "Ocean Guard AI — Model Benchmark Evaluation Report" in md_text
            assert "optical-unet-v2" in md_text


class TestBenchmarkDatasetRegistry:
    """Tests for Phase 2E dataset registry."""

    def test_registry_lists_datasets(self):
        registry = BenchmarkDatasetRegistry()
        datasets = registry.list_datasets()
        assert "representative_failure" in datasets
        assert "mados_hard_cases" in datasets
        assert "kerf_hard_cases" in datasets
        assert "lados_hard_cases" in datasets
        assert "sealed_external_test" in datasets
        assert "sar_test_imagery" in datasets
