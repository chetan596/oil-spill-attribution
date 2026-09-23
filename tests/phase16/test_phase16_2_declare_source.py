"""
Phase 16.2 Part 1 Test Suite:
Backend Declare-Source Route Contract Verification.

Tests the authoritative backend contract for POST /api/v1/manual-analysis/:jobId/declare-source.
"""

import os
import httpx
import rasterio
from rasterio.crs import CRS
from rasterio.transform import from_origin
import numpy as np
import pytest

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:4000")


def create_test_tiff(path, channels=2, width=64, height=64, descriptions=None):
    """Helper to create a valid multi-band GeoTIFF test image."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    transform = from_origin(103.5, 1.2, 0.001, 0.001)
    data = np.random.randint(10, 200, size=(channels, height, width), dtype=np.uint8)

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
def ensure_backend_running():
    try:
        resp = httpx.get(f"{BACKEND_URL}/api/v1/health", timeout=5)
        assert resp.status_code in [200, 404]  # server is up
    except Exception as e:
        pytest.skip(f"Backend service not reachable at {BACKEND_URL}: {e}")


def test_01_route_exists_and_method_contract(ensure_backend_running):
    # GET is rejected (404 route not found)
    get_resp = httpx.get(f"{BACKEND_URL}/api/v1/manual-analysis/nonexistent-id/declare-source")
    assert get_resp.status_code == 404

    # POST route is mounted and handled
    post_resp = httpx.post(
        f"{BACKEND_URL}/api/v1/manual-analysis/nonexistent-id/declare-source",
        json={"sourceType": "SENTINEL1_DUAL_POL", "polarizations": ["VV", "VH"]},
    )
    assert post_resp.status_code == 404
    data = post_resp.json()
    assert data["success"] is False
    assert "not found" in data["error"]["message"].lower()


def test_02_missing_job_fails(ensure_backend_running):
    resp = httpx.post(
        f"{BACKEND_URL}/api/v1/manual-analysis/00000000-0000-0000-0000-000000000000/declare-source",
        json={"sourceType": "SENTINEL1_DUAL_POL", "polarizations": ["VV", "VH"]},
    )
    assert resp.status_code == 404
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"


def test_03_one_channel_declaration_fails(ensure_backend_running, tmp_path):
    # 1. Create a 1-channel TIFF
    tiff_path = str(tmp_path / "test_1channel.tif")
    create_test_tiff(tiff_path, channels=1)

    # 2. Upload to backend
    with open(tiff_path, "rb") as f:
        upload_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/upload",
            files={"image": ("test_1channel.tif", f, "image/tiff")},
        )
    assert upload_resp.status_code == 201
    job_id = upload_resp.json()["data"]["jobId"]

    # 3. Attempt to declare as Sentinel-1 Dual-Pol
    resp = httpx.post(
        f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/declare-source",
        json={"sourceType": "SENTINEL1_DUAL_POL", "polarizations": ["VV", "VH"]},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_CHANNEL_COUNT"


def test_04_three_channel_declaration_fails(ensure_backend_running, tmp_path):
    # 1. Create a 3-channel TIFF
    tiff_path = str(tmp_path / "test_3channel.tif")
    create_test_tiff(tiff_path, channels=3)

    # 2. Upload to backend
    with open(tiff_path, "rb") as f:
        upload_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/upload",
            files={"image": ("test_3channel.tif", f, "image/tiff")},
        )
    assert upload_resp.status_code == 201
    job_id = upload_resp.json()["data"]["jobId"]

    # 3. Attempt to declare as Sentinel-1 Dual-Pol
    resp = httpx.post(
        f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/declare-source",
        json={"sourceType": "SENTINEL1_DUAL_POL", "polarizations": ["VV", "VH"]},
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_CHANNEL_COUNT"


def test_05_invalid_polarization_fails(ensure_backend_running, tmp_path):
    # 1. Create a 2-channel TIFF
    tiff_path = str(tmp_path / "test_2channel_unclassified.tif")
    create_test_tiff(tiff_path, channels=2)

    # 2. Upload to backend
    with open(tiff_path, "rb") as f:
        upload_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/upload",
            files={"image": ("test_2channel_unclassified.tif", f, "image/tiff")},
        )
    assert upload_resp.status_code == 201
    job_id = upload_resp.json()["data"]["jobId"]

    # 3. Invalid polarizations
    resp = httpx.post(
        f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/declare-source",
        json={"sourceType": "SENTINEL1_DUAL_POL", "polarizations": ["HH", "HV"]},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_POLARIZATIONS"

    # Single polarization
    resp2 = httpx.post(
        f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/declare-source",
        json={"sourceType": "SENTINEL1_DUAL_POL", "polarizations": ["VV"]},
    )
    assert resp2.status_code == 400
    assert resp2.json()["error"]["code"] == "INVALID_POLARIZATIONS"


def test_06_invalid_source_declaration_fails(ensure_backend_running, tmp_path):
    tiff_path = str(tmp_path / "test_2channel.tif")
    create_test_tiff(tiff_path, channels=2)

    with open(tiff_path, "rb") as f:
        upload_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/upload",
            files={"image": ("test_2channel.tif", f, "image/tiff")},
        )
    job_id = upload_resp.json()["data"]["jobId"]

    resp = httpx.post(
        f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/declare-source",
        json={"sourceType": "INVALID_SOURCE", "polarizations": ["VV", "VH"]},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_SOURCE_DECLARATION"


def test_07_valid_declaration_succeeds_and_returns_authoritative_descriptor(ensure_backend_running, tmp_path):
    tiff_path = str(tmp_path / "valid_sentinel1_2ch.tif")
    create_test_tiff(tiff_path, channels=2)

    with open(tiff_path, "rb") as f:
        upload_resp = httpx.post(
            f"{BACKEND_URL}/api/v1/manual-analysis/upload",
            files={"image": ("valid_sentinel1_2ch.tif", f, "image/tiff")},
        )
    assert upload_resp.status_code == 201
    job_id = upload_resp.json()["data"]["jobId"]

    # Declare Sentinel-1 dual-pol
    resp = httpx.post(
        f"{BACKEND_URL}/api/v1/manual-analysis/{job_id}/declare-source",
        json={"sourceType": "SENTINEL1_DUAL_POL", "polarizations": ["VV", "VH"]},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["success"] is True
    assert payload["error"] is None

    descriptor = payload["data"]
    assert descriptor["jobId"] == job_id
    assert descriptor["channelCount"] == 2
    assert descriptor["modality"] == "SAR_DUAL_POL"
    assert descriptor["polarizationStatus"] == "ESTABLISHED"
    assert descriptor["polarizations"] == ["VV", "VH"]
    assert descriptor["sourceType"] == "SENTINEL1_DUAL_POL"
    assert descriptor["compatibleModels"] == ["unet-dual-pol-sar-v09d-residual-loss"]
    assert descriptor["selectedModelId"] == "unet-dual-pol-sar-v09d-residual-loss"
    assert descriptor["inferenceSupported"] is True
    assert descriptor["sourceIdentification"] == "USER_DECLARED"
