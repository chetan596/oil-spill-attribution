"""
Real SAR Inference Pipeline Verification — Phase 3D-2
=====================================================

Loads the genuinely trained checkpoint from the model registry and tests
the full inference pipeline on a real held-out Sentinel-1 scene:
  Real GeoTIFF
  → SAR Preprocessor
  → Tiling & Normalization
  → Real Model Inference (UNet dual-pol weights)
  → Mask Reconstruction
  → Polygonization
  → GeoJSON EPSG:4326 Output
"""

import sys
import os
import json
from pathlib import Path
import numpy as np
import torch

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "services" / "ml-python"))

from app.models.registry import model_registry
from app.preprocessing.sar_preprocessor import load_sar_raster
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.postprocessing.mask_to_polygon import probability_mask_to_polygons

TEST_SCENE_PATH = str(BASE_DIR / "data" / "raw" / "satellite" / "real" / "part3_test" / "images" / "00062.tif")


def test_real_inference():
    print("=" * 80)
    print("PHASE 3D-2: REAL END-TO-END INFERENCE VERIFICATION")
    print("=" * 80)
    print(f"Test Image: {TEST_SCENE_PATH}")

    # 1. Preprocess real SAR GeoTIFF
    print("\n[STEP 1] Ingesting and Preprocessing SAR GeoTIFF...")
    raster_tensor, metadata = load_sar_raster(TEST_SCENE_PATH, polarization="VV+VH")
    print(f"  Raster shape: {raster_tensor.shape} (Channels, Height, Width)")
    print(f"  CRS: {metadata.get('crs')}")
    print(f"  Transform: {metadata.get('transform')}")
    print(f"  Georeferencing status: {metadata.get('georeferencing_status')}")

    # 2. Tile into 512x512 patches
    print("\n[STEP 2] Slicing Raster into 512x512 Inference Tiles...")
    tiles, tile_coords = generate_tiles(raster_tensor, tile_size=512, stride=512)
    print(f"  Generated {len(tiles)} tiles.")

    # 3. Load genuinely trained model from registry
    print("\n[STEP 3] Loading Trained Model Checkpoint from Model Registry...")
    model, model_entry = model_registry.load_model(model_id="unet-dual-pol-sar-v2", device="cpu", allow_untrained=False)
    print(f"  Loaded model: {model_entry['model_id']} ({model_entry['architecture']})")
    print(f"  Status: {model_entry['status']}")
    print(f"  Checkpoint: {model_entry['checkpoint_path']}")
    model.eval()

    # 4. Execute tile inference with real weights
    print("\n[STEP 4] Executing Deep Learning Inference Across All Tiles...")
    tile_predictions = []
    with torch.no_grad():
        for tile in tiles:
            tile_tensor = torch.from_numpy(tile).unsqueeze(0).float()
            probs = model.predict_probabilities(tile_tensor)
            spill_prob = probs[0, 1].cpu().numpy()
            tile_predictions.append(spill_prob)

    # 5. Reconstruct full-scene probability map
    print("\n[STEP 5] Reconstructing Full Probability Map...")
    full_prob_map = reconstruct_full_mask(
        tile_predictions=tile_predictions,
        tile_coords=tile_coords,
        full_height=metadata["height"],
        full_width=metadata["width"],
    )
    print(f"  Reconstructed map shape: {full_prob_map.shape}")
    print(f"  Probability range: [{full_prob_map.min():.4f}, {full_prob_map.max():.4f}]")

    # 6. Polygonization to geographic GeoJSON
    print("\n[STEP 6] Extracting Geographic Vector Polygons...")
    transform = metadata.get("transform")
    crs = metadata.get("crs")
    polygons, total_area, confidence = probability_mask_to_polygons(
        prob_map=full_prob_map,
        affine_transform=transform,
        src_crs=crs,
        threshold=0.35,  # Detection threshold for test
        min_pixel_area=10
    )
    print(f"  Detected polygons: {len(polygons)}")
    print(f"  Total Area: {total_area:.4f} km2")
    print(f"  Confidence: {confidence:.2f}")

    print("\n" + "=" * 80)
    print("REAL INFERENCE PIPELINE: VERIFIED SUCCESSFUL")
    print("  GeoTIFF -> SAR Preprocessor -> Normalization -> UNet Forward Pass -> Full Mask -> Geographic Polygonization")
    print("=" * 80)
    return {
        "status": "success",
        "polygons_count": len(polygons),
        "total_area_km2": total_area,
        "confidence": confidence,
        "georeferencing_status": metadata.get("georeferencing_status"),
    }


if __name__ == "__main__":
    test_real_inference()
