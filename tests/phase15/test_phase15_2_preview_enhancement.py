"""
Phase 15.2 — Comprehensive Test Suite for TIFF Visual Preview Enhancement.
Validates:
  1. binary uint8 {0, 1} -> 0 and 255 mapping, representation BINARY_MASK, normalization BINARY
  2. binary uint8 {0, 255} -> 0 and 255 preserved, representation BINARY_MASK
  3. near-binary TIFF -> >99% dominant values detected, normalized as BINARY_MASK
  4. normal grayscale uint8 -> high dynamic range preserved
  5. low-dynamic-range grayscale -> robust percentile contrast stretch applied
  6. constant TIFF (min == max) -> neutral gray 128 preview with CONSTANT normalization
  7. uint16 grayscale -> robust percentile contrast stretch
  8. float32 grayscale -> robust percentile contrast stretch
  9. NaN and Inf handling -> excluded from statistical bounds
  10. nodata exclusion -> excluded from statistical bounds
  11. RGB TIFF regression -> 3-channel untouched, representation RGB
  12. 2-channel TIFF regression -> independent channel previews preserved
  13. 6-band Sentinel-2 regression -> True-color RGB visualization preserved
  14. metadata correctness -> displayStats & preview objects complete
  15. original TIFF SHA immutability -> source file bit-for-bit unchanged
  16. preview PNG validity -> valid readable PNG file generated
  17. current segmentation TIFF (00051_segmentation.tif) -> foreground clearly visible as 255
  18. KERF & MADOS regression preservation -> exact pixels (16,516 px, 0 px)
"""

import os
import sys
import hashlib
import tempfile
import pytest
import numpy as np
from PIL import Image

# Ensure ml-python service is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../services/ml-python")))

try:
    import rasterio
    from rasterio.transform import Affine
    from rasterio.crs import CRS
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

from app.preprocessing.tiff_preview import (
    compute_pixel_display_stats,
    normalize_channel_to_uint8,
    inspect_tiff_metadata,
    generate_tiff_visual_preview,
)
from app.inference.optical_router import OperationalOpticalEngine



@pytest.fixture
def tmp_dir():
    with tempfile.TemporaryDirectory() as td:
        yield td


def _calc_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


class TestPhase15_2PreviewEnhancement:

    def test_1_binary_uint8_0_1(self, tmp_dir):
        """Test 1: Binary uint8 {0, 1} maps background to 0 and foreground to 255."""
        p = os.path.join(tmp_dir, "binary_0_1.tif")
        data = np.zeros((100, 100), dtype=np.uint8)
        data[20:80, 20:80] = 1

        with rasterio.open(
            p, "w", driver="GTiff", height=100, width=100, count=1, dtype="uint8"
        ) as dst:
            dst.write(data, 1)

        out, norm = normalize_channel_to_uint8(data)
        assert norm["normalization"] == "BINARY"
        assert norm["representation"] == "BINARY_MASK"
        assert norm["displayStats"]["isBinary"] is True
        assert norm["displayStats"]["min"] == 0
        assert norm["displayStats"]["max"] == 1
        assert norm["displayStats"]["uniqueValueCount"] == 2
        # Foreground value 1 must be stretched to 255 in the preview
        assert np.max(out) == 255
        assert np.min(out) == 0
        assert int(out[50, 50]) == 255
        assert int(out[5, 5]) == 0

    def test_2_binary_uint8_0_255(self, tmp_dir):
        """Test 2: Binary uint8 {0, 255} preserved as BINARY_MASK."""
        data = np.zeros((100, 100), dtype=np.uint8)
        data[30:70, 30:70] = 255

        out, norm = normalize_channel_to_uint8(data)
        assert norm["normalization"] == "BINARY"
        assert norm["representation"] == "BINARY_MASK"
        assert norm["displayStats"]["isBinary"] is True
        assert np.max(out) == 255
        assert np.min(out) == 0

    def test_3_near_binary_tiff(self, tmp_dir):
        """Test 3: Near-binary (>99% dominant 0 and 1 with tiny border noise)."""
        data = np.zeros((100, 100), dtype=np.uint8)
        data[25:75, 25:75] = 1
        # Add 5 noise pixels
        data[0, 0:5] = 2

        stats = compute_pixel_display_stats(data)
        assert stats["isNearBinary"] is True

        out, norm = normalize_channel_to_uint8(data)
        assert norm["normalization"] == "BINARY"
        assert norm["representation"] == "BINARY_MASK"
        assert np.max(out) == 255

    def test_4_normal_grayscale_uint8(self, tmp_dir):
        """Test 4: Normal high-dynamic-range uint8 grayscale."""
        # Full gradient from 0 to 255
        data = np.linspace(0, 255, 10000, dtype=np.uint8).reshape((100, 100))

        out, norm = normalize_channel_to_uint8(data)
        assert norm["representation"] == "GRAYSCALE"
        assert norm["normalization"] in ["DIRECT", "PERCENTILE_STRETCH"]
        assert norm["displayStats"]["isBinary"] is False
        assert norm["displayStats"]["isConstant"] is False
        assert np.max(out) == 255
        assert np.min(out) == 0

    def test_5_low_dynamic_range_grayscale(self, tmp_dir):
        """Test 5: Low-dynamic-range grayscale (e.g. values concentrated in [10, 25])."""
        data = np.random.RandomState(42).randint(10, 26, size=(100, 100)).astype(np.uint8)

        stats = compute_pixel_display_stats(data)
        assert stats["isLowDynamicRange"] is True

        out, norm = normalize_channel_to_uint8(data)
        assert norm["normalization"] == "PERCENTILE_STRETCH"
        assert norm["representation"] == "GRAYSCALE"
        # Display stretch must expand to full [0, 255] range
        assert np.max(out) == 255
        assert np.min(out) == 0

    def test_6_constant_tiff(self, tmp_dir):
        """Test 6: Constant raster (all pixels identical) renders neutral 128 gray."""
        data = np.full((100, 100), fill_value=42, dtype=np.uint8)

        stats = compute_pixel_display_stats(data)
        assert stats["isConstant"] is True
        assert stats["uniqueValueCount"] == 1

        out, norm = normalize_channel_to_uint8(data)
        assert norm["normalization"] == "CONSTANT"
        assert norm["representation"] == "GRAYSCALE"
        assert int(np.unique(out)[0]) == 128

    def test_7_uint16_percentile_stretch(self, tmp_dir):
        """Test 7: uint16 raster with scientific counts [200, 4500]."""
        data = np.random.RandomState(42).randint(200, 4501, size=(100, 100)).astype(np.uint16)

        out, norm = normalize_channel_to_uint8(data)
        assert out.dtype == np.uint8
        assert norm["sourceDtype"] == "uint16"
        assert norm["normalization"] == "PERCENTILE_STRETCH"
        assert np.max(out) == 255
        assert np.min(out) == 0

    def test_8_float32_percentile_stretch(self, tmp_dir):
        """Test 8: float32 raster with reflectance values [0.01, 0.65]."""
        data = (np.random.RandomState(42).rand(100, 100) * 0.64 + 0.01).astype(np.float32)

        out, norm = normalize_channel_to_uint8(data)
        assert out.dtype == np.uint8
        assert norm["sourceDtype"] == "float32"
        assert norm["normalization"] == "PERCENTILE_STRETCH"
        assert np.max(out) == 255
        assert np.min(out) == 0

    def test_9_nan_and_inf_handling(self, tmp_dir):
        """Test 9: float32 containing NaN, +Inf, -Inf."""
        data = np.linspace(1.0, 100.0, 10000, dtype=np.float32).reshape((100, 100))
        data[0, 0] = np.nan
        data[0, 1] = np.inf
        data[0, 2] = -np.inf

        stats = compute_pixel_display_stats(data)
        assert not np.isnan(stats["min"])
        assert not np.isnan(stats["max"])
        assert not np.isinf(stats["mean"])
        assert stats["min"] >= 1.0

        out, norm = normalize_channel_to_uint8(data)
        assert out.dtype == np.uint8
        # Invalid pixels mapped to 0
        assert int(out[0, 0]) == 0
        assert int(out[0, 1]) == 0
        assert int(out[0, 2]) == 0

    def test_10_nodata_exclusion(self, tmp_dir):
        """Test 10: NoData value (-9999) correctly excluded."""
        data = np.linspace(10.0, 50.0, 10000, dtype=np.float32).reshape((100, 100))
        data[0, :] = -9999.0

        stats = compute_pixel_display_stats(data, nodata=-9999.0)
        assert stats["min"] >= 10.0
        assert stats["max"] <= 50.0

        out, norm = normalize_channel_to_uint8(data, nodata=-9999.0)
        assert out.dtype == np.uint8
        assert int(out[0, 5]) == 0

    def test_11_rgb_tiff_regression(self, tmp_dir):
        """Test 11: 3-channel RGB TIFF preserved with representation RGB."""
        p = os.path.join(tmp_dir, "test_rgb.tif")
        rgb = np.zeros((64, 64, 3), dtype=np.uint8)
        rgb[:, :, 0] = 180
        rgb[:, :, 1] = 90
        rgb[:, :, 2] = 45

        with rasterio.open(
            p, "w", driver="GTiff", height=64, width=64, count=3, dtype="uint8"
        ) as dst:
            dst.write(rgb[:, :, 0], 1)
            dst.write(rgb[:, :, 1], 2)
            dst.write(rgb[:, :, 2], 3)

        res = generate_tiff_visual_preview(p, tmp_dir, prefix="rgb_reg")
        assert res["preview"]["representation"] == "RGB"
        assert res["preview"]["normalization"] == "DIRECT"
        assert os.path.exists(res["previewPath"])

    def test_12_2channel_tiff_regression(self, tmp_dir):
        """Test 12: 2-channel TIFF produces separate previews, inference blocked."""
        p = os.path.join(tmp_dir, "test_dual.tif")
        ch1 = np.full((64, 64), 50, dtype=np.uint8)
        ch2 = np.full((64, 64), 150, dtype=np.uint8)

        with rasterio.open(
            p, "w", driver="GTiff", height=64, width=64, count=2, dtype="uint8"
        ) as dst:
            dst.write(ch1, 1)
            dst.write(ch2, 2)

        res = generate_tiff_visual_preview(p, tmp_dir, prefix="dual_reg")
        assert res["metadata"]["channels"] == 2
        assert res["metadata"]["isDualChannelUnsupported"] is True
        assert os.path.exists(res["channel1PreviewPath"])
        assert os.path.exists(res["channel2PreviewPath"])

    def test_13_6band_sentinel2_regression(self, tmp_dir):
        """Test 13: 6-band Sentinel-2 produces True-color RGB visualization."""
        p = os.path.join(tmp_dir, "test_s2.tif")
        data = np.full((6, 64, 64), 1000, dtype=np.uint16)

        with rasterio.open(
            p, "w", driver="GTiff", height=64, width=64, count=6, dtype="uint16"
        ) as dst:
            for b in range(6):
                dst.write(data[b], b + 1)

        res = generate_tiff_visual_preview(p, tmp_dir, prefix="s2_reg")
        assert res["preview"]["representation"] == "SENTINEL2_TRUE_COLOR"
        assert res["preview"]["normalization"] == "SENTINEL2_TRUE_COLOR_RGB"

    def test_14_preview_metadata_completeness(self, tmp_dir):
        """Test 14: displayStats and preview structures are complete."""
        p = os.path.join(tmp_dir, "meta_test.tif")
        data = np.array([[0, 1], [1, 0]], dtype=np.uint8)
        with rasterio.open(p, "w", driver="GTiff", height=2, width=2, count=1, dtype="uint8") as dst:
            dst.write(data, 1)

        res = generate_tiff_visual_preview(p, tmp_dir, prefix="meta_reg")
        stats = res["displayStats"]
        required_stats = [
            "min", "max", "mean", "median", "p01", "p02", "p05", "p50",
            "p95", "p98", "p99", "uniqueValueCount", "uniqueValues",
            "isConstant", "isBinary", "isNearBinary", "isLowDynamicRange"
        ]
        for f in required_stats:
            assert f in stats, f"Missing {f} in displayStats"

        prev = res["preview"]
        assert prev["format"] == "PNG"
        assert prev["purpose"] == "VISUALIZATION_ONLY"
        assert prev["source"] == "ORIGINAL_TIFF"

    def test_15_original_tiff_sha_immutability(self, tmp_dir):
        """Test 15: Original source TIFF is bit-for-bit unmodified."""
        p = os.path.join(tmp_dir, "immutable.tif")
        data = np.random.RandomState(42).randint(0, 2, size=(128, 128)).astype(np.uint8)
        with rasterio.open(p, "w", driver="GTiff", height=128, width=128, count=1, dtype="uint8") as dst:
            dst.write(data, 1)

        sha_before = _calc_sha256(p)
        generate_tiff_visual_preview(p, tmp_dir, prefix="immut")
        sha_after = _calc_sha256(p)
        assert sha_before == sha_after, "Original TIFF was modified!"

    def test_16_preview_png_validity(self, tmp_dir):
        """Test 16: Generated preview is a valid, readable PNG."""
        p = os.path.join(tmp_dir, "valid_png.tif")
        data = np.zeros((64, 64), dtype=np.uint8)
        with rasterio.open(p, "w", driver="GTiff", height=64, width=64, count=1, dtype="uint8") as dst:
            dst.write(data, 1)

        res = generate_tiff_visual_preview(p, tmp_dir, prefix="png_valid")
        preview_file = res["previewPath"]
        assert os.path.exists(preview_file)
        with Image.open(preview_file) as im:
            assert im.format == "PNG"
            assert im.size[0] > 0 and im.size[1] > 0

    def test_17_current_segmentation_tiff_00051(self, tmp_dir):
        """Test 17: Current 00051_segmentation.tif regression fixture."""
        p = "scratch/test_tiffs/00051_segmentation.tif"
        if not os.path.exists(p):
            pytest.skip("00051_segmentation.tif not found in scratch/test_tiffs")

        sha_before = _calc_sha256(p)
        res = generate_tiff_visual_preview(p, tmp_dir, prefix="00051_reg")
        sha_after = _calc_sha256(p)
        assert sha_before == sha_after

        assert res["preview"]["representation"] == "BINARY_MASK"
        assert res["preview"]["normalization"] == "BINARY"
        assert res["preview"]["isSegmentationLike"] is True
        assert res["displayStats"]["isBinary"] is True
        assert res["displayStats"]["min"] == 0
        assert res["displayStats"]["max"] == 1

        # Check the generated preview PNG: foreground must be 255 (visible white)
        with Image.open(res["previewPath"]) as im:
            arr = np.array(im)
            assert np.max(arr) == 255
            assert np.min(arr) == 0
            # Foreground count must be substantial
            assert (arr == 255).sum() > 50000

    def test_18_model_regression_invariance(self):
        """Test 18: Invariant check on model outputs (KERF: 16,516 px, MADOS: 0 px)."""
        reg_path = "ml/training/data/sample_optical_spill.png"
        if not os.path.exists(reg_path):
            reg_path = "services/ml-python/app/tests/fixtures/sample_optical_spill.png"
        if not os.path.exists(reg_path):
            # Try finding sample_optical_spill.png
            import glob
            matches = glob.glob("**/sample_optical_spill.png", recursive=True)
            if matches:
                reg_path = matches[0]

        if os.path.exists(reg_path):
            engine = OperationalOpticalEngine()
            res_drone = engine.run_inference(image_path=reg_path, user_selected_type="DRONE")
            assert res_drone["model"]["modelId"] == "kerf-resnet34-focaldice-v1"
            assert res_drone["segmentation"]["foreground_pixels"] == 16516
            assert abs(res_drone["segmentation"]["foreground_fraction"] - 0.1042) < 0.001

            res_sat = engine.run_inference(image_path=reg_path, user_selected_type="RGB_SATELLITE")
            assert res_sat["model"]["modelId"] == "mados-resnet34-rgb-v1"
            assert res_sat["segmentation"]["foreground_pixels"] == 0
            assert res_sat["segmentation"]["foreground_fraction"] == 0.0

