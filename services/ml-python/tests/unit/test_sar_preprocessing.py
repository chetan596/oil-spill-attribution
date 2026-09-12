"""
Unit Tests for SAR Preprocessing & Tiling.
Tests valid GeoTIFF loading, band selection (VV vs VV+VH), nodata handling,
tile generation, and reconstruction.
"""

import os
import tempfile
import pytest
import numpy as np
import rasterio
from rasterio.transform import from_origin

from app.preprocessing.sar_preprocessor import load_sar_raster, SARPreprocessingError
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.normalization import normalize_sar_band


@pytest.fixture
def synthetic_geotiff():
    """Create a temporary 2-band GeoTIFF raster for testing."""
    temp_dir = tempfile.mkdtemp()
    file_path = os.path.join(temp_dir, "test_sar_scene.tif")

    transform = from_origin(72.8, 18.9, 0.001, 0.001)
    # Band 1: VV, Band 2: VH
    band1 = np.random.uniform(50.0, 200.0, size=(600, 600)).astype(np.float32)
    band2 = np.random.uniform(20.0, 100.0, size=(600, 600)).astype(np.float32)

    # Insert NaN and nodata
    band1[0, 0] = np.nan
    band1[0, 1] = -9999.0

    with rasterio.open(
        file_path,
        "w",
        driver="GTiff",
        height=600,
        width=600,
        count=2,
        dtype=rasterio.float32,
        crs="EPSG:4326",
        transform=transform,
        nodata=-9999.0,
    ) as dst:
        dst.write(band1, 1)
        dst.write(band2, 2)

    yield file_path

    # Cleanup
    if os.path.exists(file_path):
        os.remove(file_path)
    os.rmdir(temp_dir)


def test_load_sar_raster_vv(synthetic_geotiff):
    """Test loading single VV channel."""
    tensor, meta = load_sar_raster(synthetic_geotiff, polarization="VV")
    assert tensor.shape == (1, 600, 600)
    assert tensor.dtype == np.float32
    assert meta["width"] == 600
    assert meta["height"] == 600
    assert meta["selected_bands"] == ["VV"]
    assert meta["georeferencing_status"] == "valid"
    assert not np.isnan(tensor).any()
    assert np.all(tensor >= 0.0) and np.all(tensor <= 1.0)


def test_load_sar_raster_dual_pol(synthetic_geotiff):
    """Test loading dual polarization (VV + VH)."""
    tensor, meta = load_sar_raster(synthetic_geotiff, polarization="dual")
    assert tensor.shape == (2, 600, 600)
    assert meta["selected_bands"] == ["VV", "VH"]
    assert meta["channels"] == 2


def test_load_sar_raster_missing_file():
    """Test error handling when file is missing."""
    with pytest.raises(SARPreprocessingError) as exc:
        load_sar_raster("non_existent_file.tif")
    assert "not found" in str(exc.value)


def test_tile_generation_and_reconstruction():
    """Test splitting 600x600 raster into 512x512 overlapping tiles and reconstructing."""
    dummy_raster = np.ones((1, 600, 600), dtype=np.float32)
    tiles, coords = generate_tiles(dummy_raster, tile_size=512, stride=448)

    assert len(tiles) == 4
    for tile in tiles:
        assert tile.shape == (1, 512, 512)

    # Simulate tile predictions with high probability
    tile_preds = [np.ones((512, 512), dtype=np.float32) * 0.9 for _ in tiles]
    full_mask = reconstruct_full_mask(tile_preds, coords, full_height=600, full_width=600, tile_size=512)

    assert full_mask.shape == (600, 600)
    assert np.allclose(full_mask, 0.9, atol=1e-2)
