import os
from pathlib import Path
import pytest
from app.preprocessing.sar_preview import (
    extract_sar_raster_metadata,
    generate_sar_preview_image,
    check_bounds_compatibility,
    identify_dataset_part,
)

WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
TEST_GEOTIFF = str(WORKSPACE_ROOT / "data" / "raw" / "satellite" / "real" / "part3_test" / "images" / "00062.tif")


def test_extract_sar_raster_metadata_real_scene():
    if not os.path.exists(TEST_GEOTIFF):
        pytest.skip(f"Test GeoTIFF not found at {TEST_GEOTIFF}")

    meta = extract_sar_raster_metadata(TEST_GEOTIFF)
    assert meta["exists"] is True
    assert meta["width"] == 2048
    assert meta["height"] == 2048
    assert meta["band_count"] == 2
    assert "VV" in meta["bands"]
    assert "VH" in meta["bands"]
    assert meta["crs"] == "EPSG:4326"
    assert meta["bounds"] is not None
    assert meta["detection_model"] == "unet-dual-pol-sar-v2"
    assert meta["threshold"] == 0.35
    assert "Zenodo Sentinel-1 SAR Oil Spill Dataset (Part III" in meta["dataset_part"]


def test_bounds_compatibility_inside():
    # Bounds for 00062.tif: L=-125.6445, B=45.6068, R=-125.4605, T=45.7908
    bounds = {"left": -125.6445, "bottom": 45.6068, "right": -125.4605, "top": 45.7908}
    compat = check_bounds_compatibility(bounds, centroid_lat=45.7000, centroid_lng=-125.5500)
    assert compat["is_compatible"] is True
    assert compat["status"] == "GEOSPATIALLY_COMPATIBLE"


def test_bounds_compatibility_outside():
    # Mumbai coordinates [18.921, 72.832] against 00062.tif bounds
    bounds = {"left": -125.6445, "bottom": 45.6068, "right": -125.4605, "top": 45.7908}
    compat = check_bounds_compatibility(bounds, centroid_lat=18.9210, centroid_lng=72.8320)
    assert compat["is_compatible"] is False
    assert compat["status"] == "OVERLAY_NOT_GEOSPATIALLY_COMPATIBLE"
    assert "outside raster bounds" in compat["message"]


def test_identify_dataset_part_mappings():
    assert "Part I" in identify_dataset_part("data/raw/satellite/real/part1_oil/images/00000.tif")
    assert "Part II Lookalike" in identify_dataset_part("data/raw/satellite/real/part2_lookalike/images/00000.tif")
    assert "Part II Clean Ocean" in identify_dataset_part("data/raw/satellite/real/part2_no_oil/images/00000.tif")
    assert "Part III Held-Out Test" in identify_dataset_part("data/raw/satellite/real/part3_test/images/00062.tif")


def test_generate_sar_preview_vv():
    if not os.path.exists(TEST_GEOTIFF):
        pytest.skip(f"Test GeoTIFF not found at {TEST_GEOTIFF}")

    png_bytes, meta = generate_sar_preview_image(TEST_GEOTIFF, channel="vv", max_dimension=512)
    assert len(png_bytes) > 1000
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic header
    assert meta["channel_rendered"] == "vv"
    assert meta["preview_width"] <= 512


def test_generate_sar_preview_vh():
    if not os.path.exists(TEST_GEOTIFF):
        pytest.skip(f"Test GeoTIFF not found at {TEST_GEOTIFF}")

    png_bytes, meta = generate_sar_preview_image(TEST_GEOTIFF, channel="vh", max_dimension=512)
    assert len(png_bytes) > 1000
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    assert meta["channel_rendered"] == "vh"


def test_generate_sar_preview_composite():
    if not os.path.exists(TEST_GEOTIFF):
        pytest.skip(f"Test GeoTIFF not found at {TEST_GEOTIFF}")

    png_bytes, meta = generate_sar_preview_image(TEST_GEOTIFF, channel="vv_vh", max_dimension=512)
    assert len(png_bytes) > 1000
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    assert meta["channel_rendered"] == "vv_vh"


def test_extract_sar_raster_metadata_missing_file():
    meta = extract_sar_raster_metadata("non_existent_path.tif")
    assert meta["exists"] is False
