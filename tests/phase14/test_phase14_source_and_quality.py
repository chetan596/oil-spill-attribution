"""
Phase 14 Test Suite: Trusted Source Selection + Optical Model Quality Validation.

Tests:
1. Modality fail-closed handling on unknown RGB uploads.
2. Trusted routing for Drone / Aerial RGB -> kerf-resnet34-focaldice-v1.
3. Trusted routing for Satellite RGB -> mados-resnet34-rgb-v1.
4. Sentinel-2 modality guard (rejecting 3-channel RGB inputs with 422).
5. Probability distribution statistics (min, p10, median, mean, p90, max).
6. Continuous probability heatmap artifact generation.
7. Connected component diagnostics.
8. Developer Mode side-by-side comparison endpoint verifying independent execution and non-identical outputs.
9. Cryptographic checkpoint SHA-256 verification.
"""

import os
import sys
import hashlib
import numpy as np
import pytest
from PIL import Image
import io

# Ensure ml-python service is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../services/ml-python")))

from fastapi.testclient import TestClient
from app.main import app
from app.models.optical_model_registry import (
    SourceType,
    OpticalInputDescriptor,
    AmbiguousModalityError,
    OpticalModelSpec,
    OPTICAL_REGISTRY,
    compute_file_sha256,
)
from app.inference.optical_router import OpticalRouter, RoutingDecision, OperationalOpticalEngine

client = TestClient(app)

EXPECTED_CHECKPOINTS = {
    "kerf-resnet34-focaldice-v1": "d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264",
    "mados-resnet34-rgb-v1": "a4c32de7177bc42c2f0298427ce8bef4a2bf8d4a35e25c3450a67eb16f8e099a",
    "mados-resnet34-rgbnir-swir-v1": "856ea016b8f750a40af942ee2e59f5919d2f04fbc510d01d2c772ecbdb3ee983",
}

TEST_IMAGE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../data/raw/oil_spill_satellite/test/images/1023.jpg")
)


def get_test_image_bytes():
    """Load the 612x259 test image or generate an RGB image if not found."""
    if os.path.exists(TEST_IMAGE_PATH):
        with open(TEST_IMAGE_PATH, "rb") as f:
            return f.read()
    img = Image.new("RGB", (612, 259), color=(30, 80, 120))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


class TestCheckpointIntegrity:
    """Verifies all production optical checkpoints match expected SHA-256 hashes."""

    def test_all_production_checkpoints_integrity(self):
        for model_id, expected_sha in EXPECTED_CHECKPOINTS.items():
            assert model_id in OPTICAL_REGISTRY, f"Model {model_id} not registered in OPTICAL_REGISTRY"
            spec = OPTICAL_REGISTRY[model_id]
            ckpt_path = spec.resolve_checkpoint_path()
            assert os.path.exists(ckpt_path), f"Checkpoint missing: {ckpt_path}"
            
            computed_sha = compute_file_sha256(ckpt_path)
            assert computed_sha == expected_sha, (
                f"SHA-256 mismatch for {model_id}: expected {expected_sha}, got {computed_sha}"
            )


class TestOpticalRouterFailClosedAndGuard:
    """Verifies fail-closed routing logic and Sentinel-2 modality guard."""

    def test_unknown_source_raises_ambiguous_modality_error(self):
        router = OpticalRouter()
        descriptor = OpticalInputDescriptor(
            source_type=SourceType.UNKNOWN,
            channel_count=3,
            bands=["R", "G", "B"],
            source_type_origin="UNKNOWN",
        )
        with pytest.raises(AmbiguousModalityError) as excinfo:
            router.route(descriptor)
        assert "Cannot deterministically determine optical domain" in str(excinfo.value)

    def test_sentinel_2_on_rgb_raises_ambiguous_modality_error(self):
        router = OpticalRouter()
        descriptor = OpticalInputDescriptor(
            source_type=SourceType.SENTINEL_2,
            channel_count=3,
            bands=["R", "G", "B"],
            source_type_origin="USER_SELECTED",
        )
        with pytest.raises(AmbiguousModalityError) as excinfo:
            router.route(descriptor)
        assert "Selected Sentinel-2 requires multispectral bands" in str(excinfo.value)

    def test_user_selected_drone_routes_to_kerf(self):
        router = OpticalRouter()
        descriptor = OpticalInputDescriptor(
            source_type=SourceType.DRONE,
            channel_count=3,
            bands=["R", "G", "B"],
            source_type_origin="USER_SELECTED",
        )
        decision = router.route(descriptor)
        assert decision.model_spec.model_id == "kerf-resnet34-focaldice-v1"
        assert decision.source_type == SourceType.DRONE
        assert decision.source_type_origin == "USER_SELECTED"

    def test_user_selected_satellite_rgb_routes_to_mados_rgb(self):
        router = OpticalRouter()
        descriptor = OpticalInputDescriptor(
            source_type=SourceType.RGB_SATELLITE,
            channel_count=3,
            bands=["B4", "B3", "B2"],
            source_type_origin="USER_SELECTED",
        )
        decision = router.route(descriptor)
        assert decision.model_spec.model_id == "mados-resnet34-rgb-v1"
        assert decision.source_type == SourceType.RGB_SATELLITE
        assert decision.source_type_origin == "USER_SELECTED"


class TestFastAPIEndpoints:
    """Verifies FastAPI inference, quality stats, and comparison endpoints."""

    def test_infer_endpoint_with_drone_source(self, tmp_path):
        img_bytes = get_test_image_bytes()
        img_path = str(tmp_path / "test_drone.jpg")
        with open(img_path, "wb") as f:
            f.write(img_bytes)

        payload = {
            "image_path": img_path,
            "filename": "test_drone.jpg",
            "source_type": "DRONE",
            "output_dir": str(tmp_path),
        }
        response = client.post("/api/v1/detection/manual-analysis/infer", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["model"]["modelId"] == "kerf-resnet34-focaldice-v1"
        assert data["model"]["checkpointSha256"] == EXPECTED_CHECKPOINTS["kerf-resnet34-focaldice-v1"]
        
        # Verify probability distribution stats
        prob_stats = data["segmentation"]["probability_distribution"]
        assert prob_stats is not None
        assert "min" in prob_stats
        assert "p10" in prob_stats
        assert "median" in prob_stats
        assert "mean" in prob_stats
        assert "p90" in prob_stats
        assert "max" in prob_stats
        assert 0.0 <= prob_stats["min"] <= prob_stats["max"] <= 1.0

        # Verify artifacts include probability heatmap
        assert "probability_map" in data["artifacts"] or "probability_heatmap_path" in data["artifacts"]

    def test_infer_endpoint_with_satellite_rgb_source(self, tmp_path):
        img_bytes = get_test_image_bytes()
        img_path = str(tmp_path / "test_satellite.jpg")
        with open(img_path, "wb") as f:
            f.write(img_bytes)

        payload = {
            "image_path": img_path,
            "filename": "test_satellite.jpg",
            "source_type": "RGB_SATELLITE",
        }
        response = client.post("/api/v1/detection/manual-analysis/infer", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["model"]["modelId"] == "mados-resnet34-rgb-v1"
        assert data["model"]["checkpointSha256"] == EXPECTED_CHECKPOINTS["mados-resnet34-rgb-v1"]

    def test_infer_endpoint_sentinel2_rgb_guard(self, tmp_path):
        img_bytes = get_test_image_bytes()
        img_path = str(tmp_path / "test_s2_rgb.jpg")
        with open(img_path, "wb") as f:
            f.write(img_bytes)

        payload = {
            "image_path": img_path,
            "filename": "test_s2_rgb.jpg",
            "source_type": "SENTINEL_2",
        }
        response = client.post("/api/v1/detection/manual-analysis/infer", json=payload)
        assert response.status_code == 422
        detail = response.json().get("detail", "")
        assert "requires multispectral" in detail

    def test_compare_models_endpoint_on_same_raster(self, tmp_path):
        img_bytes = get_test_image_bytes()
        img_path = str(tmp_path / "test_compare.jpg")
        with open(img_path, "wb") as f:
            f.write(img_bytes)

        payload = {
            "image_path": img_path,
            "filename": "test_compare.jpg",
        }
        response = client.post("/api/v1/detection/manual-analysis/compare-models", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["model_a_drone"]["model_id"] == "kerf-resnet34-focaldice-v1"
        assert data["model_b_satellite_rgb"]["model_id"] == "mados-resnet34-rgb-v1"

        # Check independence of outputs
        assert data["comparison"]["masks_identical"] is False
        assert data["comparison"]["raw_outputs_identical"] is False
        assert data["model_a_drone"]["mask_sha256"] != data["model_b_satellite_rgb"]["mask_sha256"]
