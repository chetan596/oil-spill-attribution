"""
Phase 13 Final System-Wide End-to-End Validation Suite
Tests domain routing, model integrity, full inference pipeline, geometry extraction,
and API security & robustness.
"""

import os
import sys
import json
import hashlib
import tempfile
import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.abspath("services/ml-python"))

from app.models.optical_model_registry import (
    OpticalModelRegistry,
    OpticalInputDescriptor,
    SourceType,
    OpticalModelSpec,
    AmbiguousModalityError,
    ModelVerificationError,
    optical_registry,
    MODEL_A_SENTINEL2_MS,
    MODEL_B_DRONE_RGB,
    MODEL_C_SATELLITE_RGB,
    compute_file_sha256
)
from app.inference.optical_router import (
    OpticalRouter,
    OperationalOpticalEngine,
    operational_optical_engine,
)
from fastapi.testclient import TestClient
from app.main import app


def test_checkpoint_immutability():
    """Verify all production model checkpoints have immutable SHA-256 digests."""
    checkpoints = {
        "Phase 7B Drone ResNet-34": (
            "ml/training/runs/resnet34_balanced_focaldice_pilot/checkpoints/best_val_iou.pt",
            "d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264"
        ),
        "Phase 11 Satellite RGB Control": (
            "ml/training/runs/phase11_rgb_control/checkpoints/best_val_iou.pt",
            "a4c32de7177bc42c2f0298427ce8bef4a2bf8d4a35e25c3450a67eb16f8e099a"
        ),
        "Phase 11 Sentinel-2 6-Band": (
            "ml/training/runs/mados_rgbnir_swir_resnet34/checkpoints/best_val_iou.pt",
            "856ea016b8f750a40af942ee2e59f5919d2f04fbc510d01d2c772ecbdb3ee983"
        ),
        "Phase 11 Satellite RGB+NIR": (
            "ml/training/runs/mados_rgbnir_resnet34/checkpoints/best_val_iou.pt",
            "5137660ee14dd5c385053d3400cef11852d010ed941fad709dfcbca9b2d53442"
        ),
        "Original V2 Checkpoint": (
            "services/ml-python/app/models/optical_oil_segmentation_v2/optical_oil_segmentation_v2.pth",
            "e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398"
        ),
        "Original ResNet-34 Baseline": (
            "ml/external_models/optical/unet_resnet34_oil/model.pth",
            "9aab3f6de981ad73810d3b909603d430aafd94e35f143a2d3e80aa7336521576"
        )
    }
    
    for name, (path, expected_sha) in checkpoints.items():
        assert os.path.exists(path), f"Checkpoint missing: {path}"
        actual_sha = compute_file_sha256(path)
        assert actual_sha == expected_sha, f"SHA mismatch for {name}: expected {expected_sha}, got {actual_sha}"


def test_deterministic_domain_routing():
    """Verify routing decisions are completely deterministic across repeat queries."""
    router = OpticalRouter()
    
    s2_desc = OpticalInputDescriptor(
        source_type=SourceType.SENTINEL_2,
        sensor="Sentinel-2 MSI",
        bands=["B2", "B3", "B4", "B8", "B11", "B12"],
        channel_count=6,
        spatial_resolution_m=10.0,
        width=240,
        height=240,
        metadata_trusted=True
    )
    drone_desc = OpticalInputDescriptor(
        source_type=SourceType.DRONE,
        sensor="DJI Aerial RGB",
        bands=["R", "G", "B"],
        channel_count=3,
        spatial_resolution_m=0.05,
        width=1920,
        height=1080,
        metadata_trusted=True
    )
    sat_rgb_desc = OpticalInputDescriptor(
        source_type=SourceType.RGB_SATELLITE,
        sensor="Satellite RGB",
        bands=["B2", "B3", "B4"],
        channel_count=3,
        spatial_resolution_m=10.0,
        width=240,
        height=240,
        metadata_trusted=True
    )
    
    for _ in range(5):
        assert router.route(s2_desc).model_spec.model_id == "mados-resnet34-rgbnir-swir-v1"
        assert router.route(drone_desc).model_spec.model_id == "kerf-resnet34-focaldice-v1"
        assert router.route(sat_rgb_desc).model_spec.model_id == "mados-resnet34-rgb-v1"


def test_fail_closed_unknown_modality():
    """Verify unknown input descriptor safely raises AmbiguousModalityError."""
    router = OpticalRouter()
    unknown_desc = OpticalInputDescriptor(
        source_type=SourceType.UNKNOWN,
        sensor=None,
        bands=None,
        channel_count=3,
        metadata_trusted=False
    )
    with pytest.raises(AmbiguousModalityError):
        router.route(unknown_desc)


def test_end_to_end_sentinel2_inference():
    """Verify complete operational inference for Sentinel-2 6-band input."""
    engine = OperationalOpticalEngine()
    with tempfile.TemporaryDirectory() as temp_dir:
        bands_dict = {}
        for b in ["B4", "B3", "B2", "B8"]:
            arr = np.random.uniform(500, 2000, (240, 240)).astype(np.float32)
            p = os.path.join(temp_dir, f"{b}.png")
            Image.fromarray((arr / 20.0).astype(np.uint8)).save(p)
            bands_dict[b] = p
        for b in ["B11", "B12"]:
            arr = np.random.uniform(200, 1500, (120, 120)).astype(np.float32)
            p = os.path.join(temp_dir, f"{b}.png")
            Image.fromarray((arr / 15.0).astype(np.uint8)).save(p)
            bands_dict[b] = p
            
        desc = OpticalInputDescriptor(
            source_type=SourceType.SENTINEL_2,
            bands=["B4", "B3", "B2", "B8", "B11", "B12"],
            channel_count=6,
            spatial_resolution_m=10.0,
            width=240,
            height=240,
            band_paths=bands_dict,
            metadata_trusted=True
        )
        res = engine.run_inference(descriptor=desc, output_dir=temp_dir, prefix="s2_test")
        assert res["status"] == "COMPLETED"
        assert res["model"]["modelId"] == "mados-resnet34-rgbnir-swir-v1"
        assert len(res["model"]["bandsUsed"]) == 6
        assert "original_image" in res["artifacts"]
        assert "mask_image" in res["artifacts"]
        assert "annotated_image" in res["artifacts"]


def test_end_to_end_drone_inference():
    """Verify complete operational inference for high-res Drone RGB image."""
    engine = OperationalOpticalEngine()
    with tempfile.TemporaryDirectory() as temp_dir:
        drone_path = os.path.join(temp_dir, "drone.jpg")
        Image.fromarray(np.random.randint(0, 255, (1080, 1920, 3), dtype=np.uint8)).save(drone_path)
        
        desc = OpticalInputDescriptor(
            source_type=SourceType.DRONE,
            bands=["R", "G", "B"],
            channel_count=3,
            spatial_resolution_m=0.05,
            width=1920,
            height=1080,
            metadata_trusted=True
        )
        res = engine.run_inference(image_path=drone_path, descriptor=desc, output_dir=temp_dir, prefix="drone_test")
        assert res["status"] == "COMPLETED"
        assert res["model"]["modelId"] == "kerf-resnet34-focaldice-v1"
        assert res["classification"]["probability_label"] == "MODEL_PROBABILITY"


def test_fastapi_optical_endpoints_and_security():
    """Verify FastAPI routes handle health, validation, and safe error responses."""
    client = TestClient(app)
    
    # 1. Health
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    
    # 2. Malformed request body (invalid threshold type)
    resp = client.post("/api/v1/detection/optical/infer", json={"threshold": "invalid_string_not_float"})
    assert resp.status_code == 422
    
    # 3. Non-existent file path
    resp = client.post("/api/v1/detection/optical/infer", json={"image_path": "non_existent_file_path_123.jpg"})
    assert resp.status_code == 400
    
    # 4. Unknown source type
    resp = client.post("/api/v1/detection/optical/infer", json={"source_type": "UNKNOWN", "image_path": "some_dummy.jpg"})
    assert resp.status_code in [400, 422]


def test_manual_analysis_no_legacy_v2_regression():
    """
    Regression Test: Ensure manual-analysis inference endpoint routes through Phase 12
    Operational Optical Router and never returns legacy V2 models.
    """
    client = TestClient(app)
    with tempfile.TemporaryDirectory() as temp_dir:
        sample_path = os.path.join(temp_dir, "test_rgb.jpg")
        Image.fromarray(np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)).save(sample_path)

        # Test Drone domain
        resp_drone = client.post(
            "/api/v1/detection/manual-analysis/infer",
            json={
                "image_path": sample_path,
                "source_type": "DRONE",
                "output_dir": temp_dir,
                "prefix": "manual_drone"
            }
        )
        assert resp_drone.status_code == 200, resp_drone.text
        data_drone = resp_drone.json()
        assert data_drone["model"]["modelId"] == "kerf-resnet34-focaldice-v1"
        assert data_drone["model"]["modelId"] != "optical-oil-seg-unet-resnet18-v2"
        assert data_drone["model"]["modelId"] != "rgb-oil-classifier-resnet18-v2"
        assert data_drone["model"]["checkpointSha256"] == "d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264"

        # Test Satellite RGB domain
        resp_sat = client.post(
            "/api/v1/detection/manual-analysis/infer",
            json={
                "image_path": sample_path,
                "source_type": "RGB_SATELLITE",
                "output_dir": temp_dir,
                "prefix": "manual_sat"
            }
        )
        assert resp_sat.status_code == 200, resp_sat.text
        data_sat = resp_sat.json()
        assert data_sat["model"]["modelId"] == "mados-resnet34-rgb-v1"
        assert data_sat["model"]["modelId"] != "optical-oil-seg-unet-resnet18-v2"
        assert data_sat["model"]["modelId"] != "rgb-oil-classifier-resnet18-v2"
        assert data_sat["model"]["checkpointSha256"] == "a4c32de7177bc42c2f0298427ce8bef4a2bf8d4a35e25c3450a67eb16f8e099a"


def test_model_cache_isolation_and_fingerprint():
    """
    Verify model cache uses compound key (model_id, sha256, channels) and
    produces distinct output fingerprints for different models.
    """
    registry = OpticalModelRegistry()
    
    # 1. Load Kerf Drone Model
    m1, spec1 = registry.load_model(MODEL_B_DRONE_RGB.model_id)
    key1 = f"{spec1.model_id}:{spec1.expected_sha256}:{spec1.in_channels}"
    assert key1 in registry._loaded_models

    # 2. Load MADOS Satellite RGB Model
    m2, spec2 = registry.load_model(MODEL_C_SATELLITE_RGB.model_id)
    key2 = f"{spec2.model_id}:{spec2.expected_sha256}:{spec2.in_channels}"
    assert key2 in registry._loaded_models

    # Verify keys and models are distinct
    assert key1 != key2
    assert len(registry._loaded_models) == 2

    # 3. Verify output fingerprint in inference
    engine = OperationalOpticalEngine()
    with tempfile.TemporaryDirectory() as temp_dir:
        sample_path = os.path.join(temp_dir, "test_fingerprint.jpg")
        Image.fromarray(np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)).save(sample_path)

        res1 = engine.run_inference(image_path=sample_path, user_selected_type="DRONE")
        res2 = engine.run_inference(image_path=sample_path, user_selected_type="RGB_SATELLITE")

        assert "output_fingerprint" in res1
        assert "output_fingerprint" in res2
        assert res1["output_fingerprint"]["raw_output_sha256"] != res2["output_fingerprint"]["raw_output_sha256"]
        assert res1["output_fingerprint"]["binary_mask_sha256"] is not None
        assert res2["output_fingerprint"]["binary_mask_sha256"] is not None


