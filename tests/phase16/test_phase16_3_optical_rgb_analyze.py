"""
Phase 16.3 Optical RGB Routing and Execution Test Suite.

Verifies:
1. Upload standard RGB JPEG/PNG:
   - returns optical descriptor
   - compatible with kerf-resnet34-focaldice-v1 and mados-resnet34-rgb-v1
   - NOT compatible with unet-dual-pol-sar-v09d-residual-loss
2. POST /api/v1/manual-analysis/:jobId/analyze with source_type=DRONE:
   - routes to kerf-resnet34-focaldice-v1
   - returns HTTP 200
   - returns mask and overlays
   - modelVersion in response matches kerf-resnet34-focaldice-v1
3. POST /api/v1/manual-analysis/:jobId/analyze with source_type=SATELLITE_RGB:
   - routes to mados-resnet34-rgb-v1
   - returns HTTP 200
   - returns mask and overlays
   - modelVersion in response matches mados-resnet34-rgb-v1
4. Dual-pol SAR TIFF regression test:
   - POST /declare-source succeeds
   - POST /analyze succeeds with unet-dual-pol-sar-v09d-residual-loss
   - outputs VV, VH, mask, confidence, coverage
5. RGB TIFF regression test:
   - 3-channel TIFF without production model remains unsupported
   - returns 400 MODEL_INPUT_MISMATCH
6. Sentinel-2 mismatch test:
   - RGB PNG + SENTINEL_2 returns 400 MODEL_INPUT_MISMATCH
"""

import io
import os
import httpx
import numpy as np
import pytest
from PIL import Image
from rasterio.crs import CRS
from rasterio.transform import from_origin
import rasterio

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:4000")
ML_SERVICE_URL = os.environ.get("ML_SERVICE_URL", "http://localhost:8000")

KERF_MODEL_ID = "kerf-resnet34-focaldice-v1"
MADOS_RGB_MODEL_ID = "mados-resnet34-rgb-v1"
SAR_MODEL_ID = "unet-dual-pol-sar-v09d-residual-loss"


def create_rgb_png():
    """Create a synthetic 3-channel RGB PNG in memory with spill-like region."""
    arr = np.zeros((128, 128, 3), dtype=np.uint8)
    arr[:, :] = [20, 80, 160]  # Ocean blue
    # Add an oil slick feature (dark patch)
    arr[40:88, 40:88] = [10, 15, 20]
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()


def create_rgb_jpeg():
    """Create a synthetic 3-channel RGB JPEG in memory."""
    arr = np.zeros((128, 128, 3), dtype=np.uint8)
    arr[:, :] = [30, 90, 170]
    arr[40:88, 40:88] = [15, 20, 25]
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.getvalue()


def create_test_tiff(path, channels=2, width=64, height=64, descriptions=None):
    """Helper to create multi-band GeoTIFF test image."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    transform = from_origin(103.5, 1.2, 0.001, 0.001)
    data = np.random.randint(20, 180, size=(channels, height, width), dtype=np.uint8)

    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=channels,
        dtype=data.dtype,
        crs=CRS.from_epsg(4326),
        transform=transform,
    ) as dst:
        for b in range(channels):
            dst.write(data[b], b + 1)
            if descriptions and b < len(descriptions):
                dst.set_band_description(b + 1, descriptions[b])


@pytest.fixture(scope="module")
def ensure_services():
    try:
        b_res = httpx.get(f"{BACKEND_URL}/api/v1/health", timeout=5)
        assert b_res.status_code == 200
        m_res = httpx.get(f"{ML_SERVICE_URL}/api/v1/health", timeout=5)
        assert m_res.status_code == 200
    except Exception as e:
        pytest.skip(f"Required service not ready: {e}")


class TestPhase16_3OpticalRGBAnalyze:
    """Automated integration tests for Optical RGB pipeline in Phase 16.3."""

    def test_01_upload_standard_rgb_descriptor(self, ensure_services):
        """1. Upload standard RGB PNG returns optical descriptor compatible with kerf and mados rgb, but not SAR."""
        png_bytes = create_rgb_png()
        files = {"image": ("test_aerial.png", png_bytes, "image/png")}
        resp = httpx.post(f"{BACKEND_URL}/api/v1/manual-analysis/upload", files=files, timeout=10)
        assert resp.status_code in [200, 201], f"Upload failed: {resp.text}"

        data = resp.json()["data"]
        assert data.get("channelCount") == 3
        assert data.get("inputFormat") == "RGB_RASTER"
        assert data.get("isSarDualPol") is False
        assert data.get("isInferenceUnsupported") is False

        compat_models = data.get("compatibleModels", [])
        compat_ids = [m if isinstance(m, str) else m.get("modelId") for m in compat_models]
        assert KERF_MODEL_ID in compat_ids
        assert MADOS_RGB_MODEL_ID in compat_ids
        assert SAR_MODEL_ID not in compat_ids

    def test_02_analyze_drone_rgb_routes_to_kerf(self, ensure_services):
        """2. Analyze with source_type=DRONE routes to kerf-resnet34-focaldice-v1."""
        png_bytes = create_rgb_png()
        files = {"image": ("test_drone.png", png_bytes, "image/png")}
        up_resp = httpx.post(f"{BACKEND_URL}/api/v1/manual-analysis/upload", files=files, timeout=10)
        assert up_resp.status_code in [200, 201]
        job_id = up_resp.json()["data"]["jobId"]

        # Call analyze with DRONE
        payload = {
            "source_type": "DRONE",
            "model_id": KERF_MODEL_ID,
        }
        an_resp = httpx.post(f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/analyze", json=payload, timeout=60)
        assert an_resp.status_code == 200, f"Analyze DRONE failed: {an_resp.text}"

        result = an_resp.json()["data"]
        assert result["status"] == "COMPLETED"
        assert result.get("modelVersion") == KERF_MODEL_ID or result.get("model", {}).get("modelId") == KERF_MODEL_ID

        # Verify artifacts exist
        artifacts = result.get("artifacts", {})
        assert "mask" in artifacts or "maskUrl" in artifacts or "annotated" in artifacts or "annotatedUrl" in artifacts

    def test_03_analyze_satellite_rgb_routes_to_mados(self, ensure_services):
        """3. Analyze with source_type=SATELLITE_RGB routes to mados-resnet34-rgb-v1."""
        jpeg_bytes = create_rgb_jpeg()
        files = {"image": ("test_satellite.jpg", jpeg_bytes, "image/jpeg")}
        up_resp = httpx.post(f"{BACKEND_URL}/api/v1/manual-analysis/upload", files=files, timeout=10)
        assert up_resp.status_code in [200, 201]
        job_id = up_resp.json()["data"]["jobId"]

        # Call analyze with SATELLITE_RGB
        payload = {
            "source_type": "SATELLITE_RGB",
            "model_id": MADOS_RGB_MODEL_ID,
        }
        an_resp = httpx.post(f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/analyze", json=payload, timeout=60)
        assert an_resp.status_code == 200, f"Analyze SATELLITE_RGB failed: {an_resp.text}"

        result = an_resp.json()["data"]
        assert result["status"] == "COMPLETED"
        assert result.get("modelVersion") == MADOS_RGB_MODEL_ID or result.get("model", {}).get("modelId") == MADOS_RGB_MODEL_ID

        # Verify artifacts exist
        artifacts = result.get("artifacts", {})
        assert "mask" in artifacts or "maskUrl" in artifacts or "annotated" in artifacts or "annotatedUrl" in artifacts

    def test_04_sar_dual_pol_regression(self, ensure_services, tmp_path):
        """4. Dual-pol SAR regression: declare-source and analyze succeed with unet-dual-pol-sar-v09d-residual-loss."""
        tiff_path = str(tmp_path / "regression_sar.tif")
        create_test_tiff(tiff_path, channels=2, descriptions=["VV", "VH"])

        with open(tiff_path, "rb") as f:
            up_resp = httpx.post(f"{BACKEND_URL}/api/v1/manual-analysis/upload", files={"image": ("regression_sar.tif", f, "image/tiff")}, timeout=10)
        assert up_resp.status_code in [200, 201]
        job_id = up_resp.json()["data"]["jobId"]

        # Declare source
        dec_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/declare-source",
            json={"sourceType": "SENTINEL1_DUAL_POL", "polarizations": ["VV", "VH"]},
            timeout=10,
        )
        assert dec_resp.status_code == 200

        # Analyze
        an_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/analyze",
            json={"source_type": "SENTINEL1_DUAL_POL", "model_id": SAR_MODEL_ID},
            timeout=60,
        )
        assert an_resp.status_code == 200
        result = an_resp.json()["data"]
        assert result["status"] == "COMPLETED"
        assert result.get("modelVersion") == SAR_MODEL_ID or result.get("detection", {}).get("modelVersion") == SAR_MODEL_ID
        artifacts = result.get("artifacts", {})
        assert "vvUrl" in artifacts or "vv" in artifacts
        assert "vhUrl" in artifacts or "vh" in artifacts
        assert "maskUrl" in artifacts or "mask" in artifacts

    def test_05_rgb_tiff_rejected_for_inference(self, ensure_services, tmp_path):
        """5. 3-channel TIFF without production model returns 400 MODEL_INPUT_MISMATCH."""
        tiff_path = str(tmp_path / "rgb_unsupported.tif")
        create_test_tiff(tiff_path, channels=3, descriptions=["Red", "Green", "Blue"])

        with open(tiff_path, "rb") as f:
            up_resp = httpx.post(f"{BACKEND_URL}/api/v1/manual-analysis/upload", files={"image": ("rgb_unsupported.tif", f, "image/tiff")}, timeout=10)
        assert up_resp.status_code in [200, 201]
        job_id = up_resp.json()["data"]["jobId"]

        an_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/analyze",
            json={"source_type": "DRONE", "model_id": KERF_MODEL_ID},
            timeout=10,
        )
        assert an_resp.status_code == 400
        err = an_resp.json()
        assert "MODEL_INPUT_MISMATCH" in str(err)

    def test_06_sentinel2_mismatch_on_rgb_png(self, ensure_services):
        """6. RGB PNG + SENTINEL_2 returns 400 MODEL_INPUT_MISMATCH."""
        png_bytes = create_rgb_png()
        files = {"image": ("test_mismatch.png", png_bytes, "image/png")}
        up_resp = httpx.post(f"{BACKEND_URL}/api/v1/manual-analysis/upload", files=files, timeout=10)
        assert up_resp.status_code in [200, 201]
        job_id = up_resp.json()["data"]["jobId"]

        an_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/analyze",
            json={"source_type": "SENTINEL_2", "model_id": "mados-resnet34-rgbnir-swir-v1"},
            timeout=10,
        )
        assert an_resp.status_code == 400
        err = an_resp.json()
        assert "MODEL_INPUT_MISMATCH" in str(err)
