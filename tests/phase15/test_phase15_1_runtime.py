"""
Phase 15.1 Real Runtime Integration Tests:
1-Channel TIFF Handling, HTTP Delivery, Metadata Consistency & Fail-Closed Inference Gate.
"""

import os
import sys
import io
import hashlib
import numpy as np
import pytest
from PIL import Image
import rasterio

# Ensure ml-python service is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../services/ml-python")))

from fastapi.testclient import TestClient
from app.main import app
from app.models.optical_model_registry import (
    OPTICAL_REGISTRY,
    compute_file_sha256,
    SourceType,
    OpticalInputDescriptor,
    AmbiguousModalityError,
)
from app.inference.optical_router import (
    OpticalRouter,
    UnsupportedInputError,
    OperationalOpticalEngine,
)
from app.preprocessing.tiff_preview import (
    inspect_tiff_metadata,
    generate_tiff_visual_preview,
)

client = TestClient(app)

REGRESSION_612_259_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "../../data/uploads/manual/1786da21-7a3c-49e8-b893-1fd6126d5c76/source_image.jpg"
    )
)


def create_test_tiff(filepath: str, channels: int = 1, width: int = 64, height: int = 64, dtype: str = "uint8"):
    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": channels,
        "dtype": dtype,
    }
    with rasterio.open(filepath, "w", **profile) as dst:
        for c in range(1, channels + 1):
            data = np.random.randint(10, 240, (height, width), dtype=np.uint8)
            dst.write(data, c)


class TestPhase15_1Runtime:
    """Phase 15.1 Integration Test Suite."""

    def test_1_channel_tiff_metadata_consistency_no_rgb_fabrication(self, tmp_path):
        """Verify 1-channel TIFF is never assigned RGB bands."""
        tif_path = str(tmp_path / "single_chan.tif")
        create_test_tiff(tif_path, channels=1, width=32, height=32)

        meta = inspect_tiff_metadata(tif_path)
        assert meta["channels"] == 1
        assert meta["isSingleChannelUnsupported"] is True
        assert meta["isDualChannelUnsupported"] is False
        assert meta["isInferenceUnsupported"] is True

        # Router descriptor inference must NOT fabricate ['R', 'G', 'B']
        router = OpticalRouter()
        desc = router.infer_descriptor(image_path=tif_path, user_selected_type="DRONE")
        assert desc.channel_count == 1
        assert desc.bands == ["Gray"]  # NOT ['R', 'G', 'B']
        assert desc.is_single_channel_unsupported is True

    def test_1_channel_tiff_preview_generation_and_valid_png(self, tmp_path):
        """Verify preview generates clean grayscale PNG with valid MIME and bytes."""
        tif_path = str(tmp_path / "single_chan.tif")
        create_test_tiff(tif_path, channels=1, width=48, height=48)

        preview_info = generate_tiff_visual_preview(tif_path, output_dir=str(tmp_path))
        assert preview_info["previewPurpose"] == "VISUALIZATION_ONLY"
        assert preview_info["previewSource"] == "ORIGINAL_TIFF"
        assert preview_info["previewComposition"] == "GRAYSCALE"
        assert preview_info["previewPath"] is not None
        assert os.path.exists(preview_info["previewPath"])

        # Check image validity
        with Image.open(preview_info["previewPath"]) as img:
            assert img.format == "PNG"
            assert img.mode in ("L", "RGB")

    def test_1_channel_tiff_inference_rejection_router(self, tmp_path):
        """Verify optical router route() raises UnsupportedInputError for 1-channel TIFF."""
        tif_path = str(tmp_path / "single_chan.tif")
        create_test_tiff(tif_path, channels=1, width=32, height=32)

        router = OpticalRouter()
        desc = router.infer_descriptor(image_path=tif_path, user_selected_type="DRONE")
        with pytest.raises(UnsupportedInputError) as exc_info:
            router.route(desc)
        assert "UNSUPPORTED INPUT: This TIFF contains 1 grayscale channel" in str(exc_info.value)
        assert "AI inference is not executed" in str(exc_info.value)

    def test_1_channel_tiff_inference_rejection_fastapi_400(self, tmp_path):
        """Verify FastAPI /api/v1/detection/optical/infer returns HTTP 400 for 1-channel TIFF."""
        tif_path = str(tmp_path / "single_chan.tif")
        create_test_tiff(tif_path, channels=1, width=32, height=32)

        payload = {
            "image_path": tif_path,
            "source_type": "DRONE",
        }
        resp = client.post("/api/v1/detection/optical/infer", json=payload)
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "UNSUPPORTED INPUT" in detail
        assert "1 grayscale channel" in detail

    def test_fastapi_inspect_tiff_includes_preview_paths(self, tmp_path):
        """Verify /api/v1/detection/tiff/inspect returns previewPath without stripping."""
        tif_path = str(tmp_path / "single_chan.tif")
        create_test_tiff(tif_path, channels=1, width=32, height=32)

        payload = {
            "image_path": tif_path,
            "output_dir": str(tmp_path),
        }
        resp = client.post("/api/v1/detection/tiff/inspect", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["metadata"]["channels"] == 1
        assert data["metadata"]["isSingleChannelUnsupported"] is True
        assert data["previewPath"] is not None
        assert os.path.exists(data["previewPath"])

    def test_3_channel_rgb_tiff_end_to_end_routing(self, tmp_path):
        """Verify 3-channel RGB TIFF routes cleanly to Drone RGB model without error."""
        tif_path = str(tmp_path / "drone_rgb.tif")
        create_test_tiff(tif_path, channels=3, width=64, height=64)

        router = OpticalRouter()
        desc = router.infer_descriptor(image_path=tif_path, user_selected_type="DRONE")
        assert desc.channel_count == 3
        assert desc.bands == ["R", "G", "B"]
        assert desc.is_single_channel_unsupported is False
        assert desc.is_dual_channel_unsupported is False

        decision = router.route(desc)
        assert decision.model_spec.model_id == "kerf-resnet34-focaldice-v1"

    def test_3_channel_satellite_rgb_tiff_routing(self, tmp_path):
        """Verify 3-channel RGB TIFF with RGB_SATELLITE routes cleanly to MADOS RGB model."""
        tif_path = str(tmp_path / "sat_rgb.tif")
        create_test_tiff(tif_path, channels=3, width=64, height=64)

        router = OpticalRouter()
        desc = router.infer_descriptor(image_path=tif_path, user_selected_type="RGB_SATELLITE")
        assert desc.channel_count == 3
        assert desc.bands == ["R", "G", "B"]

        decision = router.route(desc)
        assert decision.model_spec.model_id == "mados-resnet34-rgb-v1"

    def test_2_channel_tiff_fail_closed_preserved(self, tmp_path):
        """Verify 2-channel TIFF fail-closed rejection is strictly preserved."""
        tif_path = str(tmp_path / "dual_chan.tif")
        create_test_tiff(tif_path, channels=2, width=32, height=32)

        router = OpticalRouter()
        desc = router.infer_descriptor(image_path=tif_path, user_selected_type="DRONE")
        assert desc.channel_count == 2
        assert desc.bands == ["Channel_1", "Channel_2"]
        assert desc.is_dual_channel_unsupported is True

        with pytest.raises(UnsupportedInputError) as exc_info:
            router.route(desc)
        assert "This TIFF contains 2 channels" in str(exc_info.value)

    def test_6_band_sentinel2_routing_preserved(self, tmp_path):
        """Verify 6-band Sentinel-2 routes cleanly to MADOS 6-band model."""
        tif_path = str(tmp_path / "sentinel2_6b.tif")
        create_test_tiff(tif_path, channels=6, width=32, height=32)

        router = OpticalRouter()
        desc = router.infer_descriptor(image_path=tif_path, user_selected_type="SENTINEL_2")
        assert desc.channel_count == 6
        assert desc.bands == ["B4", "B3", "B2", "B8", "B11", "B12"]

        decision = router.route(desc)
        assert decision.model_spec.model_id == "mados-resnet34-rgbnir-swir-v1"

    def test_kerf_regression_exact_preservation(self):
        """Preserve exact KERF benchmark: 16,516 px (10.42%), 2 components."""
        assert os.path.exists(REGRESSION_612_259_PATH)
        engine = OperationalOpticalEngine()
        res = engine.run_inference(image_path=REGRESSION_612_259_PATH, user_selected_type="DRONE")
        assert res["model"]["modelId"] == "kerf-resnet34-focaldice-v1"
        assert res["segmentation"]["foreground_pixels"] == 16516
        assert abs(res["segmentation"]["foreground_fraction"] - 0.1042) < 0.001
        assert res["segmentation"]["connected_component_count"] == 2

    def test_mados_regression_exact_preservation(self):
        """Preserve exact MADOS benchmark: 0 px (0.00%), 0 components."""
        assert os.path.exists(REGRESSION_612_259_PATH)
        engine = OperationalOpticalEngine()
        res = engine.run_inference(image_path=REGRESSION_612_259_PATH, user_selected_type="RGB_SATELLITE")
        assert res["model"]["modelId"] == "mados-resnet34-rgb-v1"
        assert res["segmentation"]["foreground_pixels"] == 0
        assert res["segmentation"]["foreground_fraction"] == 0.0
        assert res["segmentation"]["connected_component_count"] == 0
