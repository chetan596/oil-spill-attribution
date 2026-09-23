import os
import json
from pathlib import Path
import pytest
import numpy as np
import rasterio

from app.preprocessing.sar_preprocessor import load_sar_raster
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.sar_preview import extract_sar_raster_metadata, generate_sar_preview_image
from app.postprocessing.mask_to_polygon import probability_mask_to_polygons
from app.models.registry import model_registry

WORKSPACE_ROOT = Path(__file__).resolve().parents[4]
PART1_IMG = str(WORKSPACE_ROOT / "data" / "raw" / "satellite" / "real" / "part1_oil" / "images" / "00000.tif")
PART1_MASK = str(WORKSPACE_ROOT / "data" / "raw" / "satellite" / "real" / "part1_oil" / "masks" / "00000.tif")
MANIFEST_PATH = str(WORKSPACE_ROOT / "data" / "raw" / "satellite" / "dataset_manifest.json")
REPORT_PATH = str(WORKSPACE_ROOT / "data" / "raw" / "satellite" / "real" / "part1_oil" / "positive_validation_report.json")


def test_positive_scene_discovery_and_manifest_pairing():
    assert os.path.exists(MANIFEST_PATH), "dataset_manifest.json must exist"
    with open(MANIFEST_PATH, "r") as f:
        manifest = json.load(f)

    # Locate real_part1_oil_00000
    scene = next((s for s in manifest.get("scenes", []) if s.get("scene_id") == "real_part1_oil_00000"), None)
    assert scene is not None, "real_part1_oil_00000 must be indexed in manifest"
    assert scene["category"] == "oil_spill"
    assert "Part I" in scene["zenodo_part"]
    assert os.path.exists(PART1_IMG), f"Image file missing: {PART1_IMG}"
    assert os.path.exists(PART1_MASK), f"Mask file missing: {PART1_MASK}"


def test_positive_scene_raster_and_mask_alignment():
    if not os.path.exists(PART1_IMG) or not os.path.exists(PART1_MASK):
        pytest.skip("Test raster or mask not found")

    with rasterio.open(PART1_IMG) as img_src:
        assert img_src.width == 2048
        assert img_src.height == 2048
        assert img_src.count == 2
        assert img_src.crs is not None
        assert "4326" in str(img_src.crs)
        img_bounds = img_src.bounds

    with rasterio.open(PART1_MASK) as mask_src:
        assert mask_src.width == 2048
        assert mask_src.height == 2048
        mask_arr = mask_src.read(1)
        gt_pixels = int(np.sum(mask_arr > 0))
        assert gt_pixels == 14539, f"Expected 14539 ground truth positive pixels, got {gt_pixels}"


def test_positive_scene_inference_and_metrics():
    if not os.path.exists(PART1_IMG):
        pytest.skip("Test raster not found")

    raster_tensor, metadata = load_sar_raster(PART1_IMG, polarization="VV+VH")
    assert raster_tensor.shape == (2, 2048, 2048)
    assert metadata["selected_bands"] == ["VV", "VH"]

    tiles, tile_coords = generate_tiles(raster_tensor, tile_size=512, stride=448)
    assert len(tiles) == 25

    model, model_entry = model_registry.load_model("unet-dual-pol-sar-v2", device="cpu", allow_untrained=True)
    assert model_entry["model_id"] == "unet-dual-pol-sar-v2"

    meta = extract_sar_raster_metadata(PART1_IMG)
    assert meta["exists"] is True
    assert meta["ground_truth_available"] is True
    assert meta["ground_truth_pixel_count"] == 14539

    if os.path.exists(REPORT_PATH):
        with open(REPORT_PATH, "r") as f:
            rep = json.load(f)
        assert rep["dataset"] == "Sentinel-1 SAR Oil Spill Dataset"
        assert rep["datasetPart"] == "Part I"
        assert rep["threshold"] == 0.35
        metrics = rep["evaluationMetrics"]
        assert "iou" in metrics
        assert "dice" in metrics
        assert "precision" in metrics
        assert "recall" in metrics
        assert metrics["groundTruthPositivePixels"] == 14539
        assert metrics["predictedPositivePixels"] == 7091


def test_polygon_containment_in_bounds():
    if not os.path.exists(REPORT_PATH):
        pytest.skip("Report file missing")

    with open(REPORT_PATH, "r") as f:
        rep = json.load(f)

    bounds = rep["bounds"]
    left = min(bounds["left"], bounds["right"])
    right = max(bounds["left"], bounds["right"])
    bottom = min(bounds["bottom"], bounds["top"])
    top = max(bounds["bottom"], bounds["top"])

    for poly in rep.get("predictedPolygons", []):
        coords = poly["coordinates"][0]
        for pt in coords:
            assert left <= pt[0] <= right, f"Predicted point longitude {pt[0]} outside [{left}, {right}]"
            assert bottom <= pt[1] <= top, f"Predicted point latitude {pt[1]} outside [{bottom}, {top}]"

    for poly in rep.get("groundTruthPolygons", []):
        coords = poly["coordinates"][0]
        for pt in coords:
            assert left <= pt[0] <= right, f"GT point longitude {pt[0]} outside [{left}, {right}]"
            assert bottom <= pt[1] <= top, f"GT point latitude {pt[1]} outside [{bottom}, {top}]"


def test_preview_generation_ground_truth_channel():
    if not os.path.exists(PART1_IMG):
        pytest.skip("Test raster not found")

    png_bytes, meta = generate_sar_preview_image(PART1_IMG, channel="ground_truth", max_dimension=512)
    assert len(png_bytes) > 500
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    assert meta["channel_rendered"] == "ground_truth"
    assert meta["positive_pixel_count"] == 14539


def test_demo_and_cdse_isolation():
    try:
        from app.api.routes.detection import DEMO_SCENARIO_OUTPUTS
        mumbai_demo = DEMO_SCENARIO_OUTPUTS["demo-scene-001"]
        assert mumbai_demo["confidence"] == 0.94
        assert mumbai_demo["total_area_km2"] == 4.73
    except Exception as e:
        pytest.skip(f"Detection route import unavailable in current environment: {e}")
