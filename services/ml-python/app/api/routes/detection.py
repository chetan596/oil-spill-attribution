import os
from typing import Dict, Any
import torch
from fastapi import APIRouter, HTTPException, status

from app.api.schemas.detection import DetectionRequest, DetectionResponse
from app.core.config import settings
from app.preprocessing.sar_preprocessor import load_sar_raster, SARPreprocessingError
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.postprocessing.mask_to_polygon import probability_mask_to_polygons
from app.models.registry import model_registry, ModelNotTrainedError, ModelNotFoundError

router = APIRouter()


def get_demo_fallback_response(scene_id: str) -> DetectionResponse:
    """
    Deterministic demonstration scenario fallback.
    Explicitly flags processing_metadata.mode = 'demo_fallback' and is_real_ml = False.
    """
    demo_polygon = {
        "type": "Polygon",
        "coordinates": [
            [
                [72.800, 18.900],
                [72.860, 18.900],
                [72.860, 18.942],
                [72.800, 18.942],
                [72.800, 18.900],
            ]
        ],
    }

    return DetectionResponse(
        scene_id=scene_id,
        detection_status="detected",
        confidence=0.94,
        slick_polygons=[demo_polygon],
        total_area_km2=4.73,
        estimated_age_hours=14.5,
        model_version="unet-demo-deterministic-v1.0",
        georeferencing_status="valid",
        processing_metadata={
            "mode": "demo_fallback",
            "is_real_ml": False,
            "note": "Deterministic demonstration output. Real SAR ML model weights pending training.",
            "scene_identifier": scene_id,
        },
    )


@router.post("/segment", response_model=DetectionResponse)
def segment_oil_slick(request: DetectionRequest) -> DetectionResponse:
    """
    Execute SAR Oil Spill Semantic Segmentation Pipeline.

    Flow:
      1. Raster Ingestion (rasterio) & validation
      2. Tiling & Normalization
      3. Deep Learning Inference (UNet)
      4. Mask Reconstruction & Polygonization
      5. Projected Area & Confidence Calculation
    """
    # Check if this is the demo scene request
    if (not request.image_path or not os.path.exists(request.image_path)) and (request.scene_id == "demo-scene-001" or (settings.DEMO_MODE and request.scene_id.startswith("demo-"))):
        return get_demo_fallback_response(request.scene_id)

    if not request.image_path or not os.path.exists(request.image_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SAR image file not found at path: '{request.image_path}'"
        )

    # 1. Ingest and preprocess SAR GeoTIFF
    try:
        raster_tensor, metadata = load_sar_raster(
            file_path=request.image_path,
            polarization=request.polarization
        )
    except SARPreprocessingError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"SAR Preprocessing Failure: {str(err)}"
        )

    # 2. Slice into tiles
    tiles, tile_coords = generate_tiles(
        raster_array=raster_tensor,
        tile_size=settings.TILE_SIZE,
        stride=settings.STRIDE
    )

    # 3. Load model weights
    try:
        model, model_entry = model_registry.load_model(device="cpu", allow_untrained=False)
    except ModelNotTrainedError as err:
        if settings.DEMO_MODE:
            # Fallback to demo response if explicitly configured in demo mode
            res = get_demo_fallback_response(request.scene_id)
            res.processing_metadata["warning"] = str(err)
            return res
        return DetectionResponse(
            scene_id=request.scene_id,
            detection_status="model_unavailable",
            confidence=None,
            slick_polygons=[],
            total_area_km2=None,
            estimated_age_hours=None,
            model_version=model_registry.get_model_entry().get("model_id", "unet-sar-oil-spill-v1"),
            georeferencing_status=metadata.get("georeferencing_status", "missing"),
            processing_metadata={
                "error": str(err),
                "is_real_ml": False,
                "status": "untrained",
            },
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model Loading Error: {str(err)}"
        )

    # 4. Execute tile inference
    tile_predictions = []
    with torch.no_grad():
        for tile in tiles:
            # tile shape: (C, H, W) -> add batch dimension (1, C, H, W)
            tile_tensor = torch.from_numpy(tile).unsqueeze(0).float()
            probs = model.predict_probabilities(tile_tensor)
            # If 2 classes: class 1 is oil spill probability
            if probs.shape[1] > 1:
                spill_prob = probs[0, 1].cpu().numpy()
            else:
                spill_prob = probs[0, 0].cpu().numpy()
            tile_predictions.append(spill_prob)

    # 5. Reconstruct full-resolution probability map
    full_prob_map = reconstruct_full_mask(
        tile_predictions=tile_predictions,
        tile_coords=tile_coords,
        full_height=metadata["height"],
        full_width=metadata["width"],
        tile_size=settings.TILE_SIZE
    )

    # 6. Polygonize and compute metric surface area
    polygons, total_area_km2, mean_confidence = probability_mask_to_polygons(
        prob_map=full_prob_map,
        affine_transform=metadata.get("affine_transform"),
        src_crs=metadata.get("crs"),
        threshold=request.threshold
    )

    detection_status = "detected" if len(polygons) > 0 else "no_slick"

    return DetectionResponse(
        scene_id=request.scene_id,
        detection_status=detection_status,
        confidence=mean_confidence if detection_status == "detected" else 0.0,
        slick_polygons=polygons,
        total_area_km2=total_area_km2 if detection_status == "detected" else 0.0,
        estimated_age_hours=None,  # Not invented; age estimation requires multi-temporal or thickness data
        model_version=model_entry.get("model_id", "unet-sar-oil-spill-v1"),
        georeferencing_status=metadata.get("georeferencing_status", "missing"),
        processing_metadata={
            "mode": "real_sar_inference",
            "is_real_ml": True,
            "raster_dimensions": [metadata["width"], metadata["height"]],
            "tile_count": len(tiles),
            "crs": metadata.get("crs"),
            "selected_bands": metadata.get("selected_bands"),
        },
    )
