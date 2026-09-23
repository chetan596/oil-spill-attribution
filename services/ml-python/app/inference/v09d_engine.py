"""
Frozen V09D SAR Semantic Segmentation Inference Engine.
Integrates the frozen research candidate (unet-dual-pol-sar-v09d-residual-loss)
from OG-SAR-ML-RESEARCH-RELEASE-V0.12 into the FastAPI inference pipeline.
"""

import os
import time
import math
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import torch
from PIL import Image

try:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import Affine
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

from app.models.registry import model_registry, ModelVerificationError, ModelNotFoundError
from app.preprocessing.normalization import normalize_sar_band
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.postprocessing.mask_to_polygon import probability_mask_to_polygons
from app.core.config import settings


class SARInputValidationError(Exception):
    """Raised when an input image fails SAR format, channel, or dimension validation."""
    pass


def validate_sar_input(
    image_path: str,
    required_georeferencing: bool = False
) -> Dict[str, Any]:
    """
    Validate that the input file is an authentic Sentinel-1 SAR raster.
    Rejects:
      - Missing files or corrupt containers
      - Optical color photographs (3-channel RGB)
      - Non-georeferenced images when geospatial output is required
    """
    if not os.path.exists(image_path):
        raise SARInputValidationError(f"SAR image file not found on disk: '{image_path}'")

    file_size = os.path.getsize(image_path)
    if file_size == 0:
        raise SARInputValidationError(f"SAR image file is empty: '{image_path}'")

    # Compute SHA-256 of input
    hasher = hashlib.sha256()
    with open(image_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    sha256 = hasher.hexdigest()

    # Inspect format via rasterio or PIL
    width = 0
    height = 0
    channels = 1
    dtype_str = "float32"
    crs_str = None
    affine_transform = None
    bounds = None
    raw_array = None

    if HAS_RASTERIO:
        try:
            with rasterio.open(image_path) as src:
                width = src.width
                height = src.height
                channels = src.count
                dtype_str = str(src.dtypes[0])
                crs_str = src.crs.to_string() if src.crs else None
                affine_transform = src.transform
                bounds = {
                    "left": src.bounds.left,
                    "bottom": src.bounds.bottom,
                    "right": src.bounds.right,
                    "top": src.bounds.top,
                }
                raw_array = src.read()  # Shape: (count, height, width)
        except Exception:
            raw_array = None


    if raw_array is None:
        try:
            with Image.open(image_path) as img:
                width, height = img.size
                arr = np.array(img)
                if arr.ndim == 2:
                    raw_array = np.expand_dims(arr, axis=0)
                    channels = 1
                elif arr.ndim == 3:
                    raw_array = np.transpose(arr, (2, 0, 1))
                    channels = raw_array.shape[0]
                dtype_str = str(arr.dtype)
        except Exception as e:
            raise SARInputValidationError(f"Failed to read image container: {str(e)}")

    if width < 64 or height < 64:
        raise SARInputValidationError(f"SAR image dimensions too small ({width}x{height}); minimum is 64x64.")

    # Optical RGB Rejection Check
    if channels >= 3:
        r = raw_array[0].astype(np.float32)
        g = raw_array[1].astype(np.float32)
        b = raw_array[2].astype(np.float32)
        color_variance = float(np.mean(np.abs(r - g) + np.abs(g - b)))
        if color_variance > 4.5:
            raise SARInputValidationError(
                "Input is an optical color photograph (RGB), not a microwave SAR raster. "
                "The V09D model strictly requires dual-polarization Sentinel-1 SAR (VV+VH) Sigma0 decibel backscatter."
            )

    if required_georeferencing and not crs_str:
        raise SARInputValidationError(
            "Geospatial output was requested but input raster does not contain a valid Coordinate Reference System (CRS)."
        )

    is_georeferenced = bool(crs_str and affine_transform)

    return {
        "image_path": image_path,
        "sha256": sha256,
        "width": width,
        "height": height,
        "channels": channels,
        "dtype": dtype_str,
        "crs": crs_str,
        "affine_transform": affine_transform,
        "bounds": bounds,
        "is_georeferenced": is_georeferenced,
        "raw_array": raw_array,
    }


def execute_v09d_full_scene_inference(
    image_path: str,
    scene_id: Optional[str] = None,
    threshold: float = 0.50,
    source_type: str = "REAL_CDSE",
    device: str = "cpu",
    output_dir: Optional[str] = None,
    generate_artifacts: bool = False
) -> Dict[str, Any]:
    """
    Execute full-scene SAR semantic segmentation using frozen candidate V09D.
    
    Protocol:
      1. Cryptographic and structural verification of frozen V09D checkpoint.
      2. SAR decibel radiometric calibration (sentinel1_sigma0_db_v1).
      3. Full-scene 512x512 sliding window tiling with 448px stride and 2D Hann blending.
      4. Full-resolution probability map reconstruction.
      5. Binarization at pre-registered operating threshold (default 0.50).
      6. Connected region extraction, polygonization, and georeferenced surface area computation.
      7. Structured output contract adhering to OG-SAR-ML-RESEARCH-RELEASE-V0.12.
    """
    t_start = time.perf_counter()

    # 1. Authoritative Model Loading & Cryptographic Verification
    t_load_start = time.perf_counter()
    model, model_meta = model_registry.load_verified_model(
        model_id="unet-dual-pol-sar-v09d-residual-loss",
        device=device
    )
    t_load_ms = round((time.perf_counter() - t_load_start) * 1000, 2)

    # 2. Input Validation & Radiometric Preprocessing
    t_prep_start = time.perf_counter()
    validated_input = validate_sar_input(image_path=image_path)
    raw_array = validated_input["raw_array"]
    width = validated_input["width"]
    height = validated_input["height"]

    # Normalize to sentinel1_sigma0_db_v1: VV [-35, -5] dB, VH [-45, -15] dB
    first_band = raw_array[0]
    norm_vv = normalize_sar_band(first_band, polarization="VV")
    if raw_array.shape[0] >= 2:
        norm_vh = normalize_sar_band(raw_array[1], polarization="VH")
    else:
        # If single polarization supplied, duplicate to channel 2 with VH scaling
        norm_vh = normalize_sar_band(first_band, polarization="VH")

    raster_tensor = np.stack([norm_vv, norm_vh], axis=0).astype(np.float32)
    t_prep_ms = round((time.perf_counter() - t_prep_start) * 1000, 2)

    # 3. Tile Generation
    t_infer_start = time.perf_counter()
    tile_size = settings.TILE_SIZE  # 512
    stride = settings.STRIDE        # 448
    tiles, tile_coords = generate_tiles(
        raster_array=raster_tensor,
        tile_size=tile_size,
        stride=stride
    )

    # 4. Neural Network Inference
    tile_predictions = []
    with torch.no_grad():
        for tile in tiles:
            tile_tensor = torch.from_numpy(tile).unsqueeze(0).to(device).float()
            probs = model.predict_probabilities(tile_tensor)
            if probs.shape[1] > 1:
                spill_prob = probs[0, 1].cpu().numpy()
            else:
                spill_prob = probs[0, 0].cpu().numpy()
            tile_predictions.append(spill_prob)

    # 5. Full-Scene Mask Reconstruction with Hann Blending
    full_prob_map = reconstruct_full_mask(
        tile_predictions=tile_predictions,
        tile_coords=tile_coords,
        full_height=height,
        full_width=width,
        tile_size=tile_size
    )
    t_infer_ms = round((time.perf_counter() - t_infer_start) * 1000, 2)

    # 6. Postprocessing & Georeferenced Candidate Spill Analysis
    t_post_start = time.perf_counter()

    binary_mask = (full_prob_map >= threshold).astype(np.uint8)
    positive_pixels = int(np.sum(binary_mask > 0))
    total_pixels = width * height
    coverage_pct = round((positive_pixels / max(total_pixels, 1)) * 100.0, 4)

    source_meta = {
        "sourceType": source_type,
        "sceneId": scene_id or os.path.basename(image_path),
        "modelId": model_meta["model_id"],
        "modelRelease": model_meta["release_id"],
        "checkpointSha256": model_meta["checkpoint_sha256"],
        "threshold": threshold,
    }

    from app.postprocessing.spill_analysis import analyze_candidate_spill_regions

    spill_analysis_result = analyze_candidate_spill_regions(
        binary_mask=binary_mask,
        prob_map=full_prob_map,
        affine_transform=validated_input.get("affine_transform"),
        src_crs=validated_input.get("crs"),
        source_metadata=source_meta,
        min_pixel_area=15
    )

    polygons = [r["geometry"] for r in spill_analysis_result["regions"]]
    total_area_km2 = spill_analysis_result["summary"]["totalDetectedAreaKm2"]
    total_area_m2 = spill_analysis_result["summary"]["totalDetectedAreaM2"]
    centroid = spill_analysis_result["geospatial"]["sceneCentroid"]

    # Mean probability across all segmented slick pixels
    mean_confidence = float(np.mean(full_prob_map[binary_mask > 0])) if positive_pixels > 0 else 0.0

    # Visual Artifact Generation (optional)
    artifacts = {}
    if generate_artifacts and output_dir:
        os.makedirs(output_dir, exist_ok=True)
        job_id = f"v09d_{validated_input['sha256'][:12]}"
        
        # Original grayscale
        orig_img = Image.fromarray((np.clip(norm_vv, 0, 1) * 255).astype(np.uint8), mode="L").convert("RGB")
        orig_path = os.path.join(output_dir, f"{job_id}_original.png")
        orig_img.save(orig_path)
        
        # Mask
        mask_rgba = np.zeros((height, width, 4), dtype=np.uint8)
        mask_rgba[binary_mask > 0] = [0, 229, 255, 230]
        mask_img = Image.fromarray(mask_rgba, mode="RGBA")
        mask_path = os.path.join(output_dir, f"{job_id}_mask.png")
        mask_img.save(mask_path)

        # Overlay
        overlay_img = orig_img.copy().convert("RGBA")
        overlay_img.paste(mask_img, (0, 0), mask_img)
        overlay_path = os.path.join(output_dir, f"{job_id}_overlay.png")
        overlay_img.convert("RGB").save(overlay_path)

        # Heatmap
        prob_rgba = np.zeros((height, width, 4), dtype=np.uint8)
        norm_p = np.clip(full_prob_map, 0.0, 1.0)
        prob_rgba[:, :, 0] = (norm_p * 255).astype(np.uint8)
        prob_rgba[:, :, 1] = ((1.0 - np.abs(norm_p - 0.5) * 2.0) * 180).astype(np.uint8)
        prob_rgba[:, :, 2] = ((1.0 - norm_p) * 255).astype(np.uint8)
        prob_rgba[:, :, 3] = 255
        prob_path = os.path.join(output_dir, f"{job_id}_probability.png")
        Image.fromarray(prob_rgba, mode="RGBA").save(prob_path)

        artifacts = {
            "original": orig_path,
            "mask": mask_path,
            "overlay": overlay_path,
            "probabilityMap": prob_path
        }

    t_post_ms = round((time.perf_counter() - t_post_start) * 1000, 2)
    t_total_ms = round((time.perf_counter() - t_start) * 1000, 2)

    detection_status = "detected" if positive_pixels > 0 else "no_slick"

    # 7. Formulate Complete Structured Output Contract
    response = {
        "status": "SUCCESS",
        "detection_status": detection_status,
        "model": {
            "id": model_meta["model_id"],
            "release": model_meta["release_id"],
            "status": model_meta["scientific_status"],
            "architecture": model_meta["architecture"],
            "parameters": model_meta["parameters"],
            "checkpointSha256": model_meta["checkpoint_sha256"],
            "benchmarkMetadata": {
                "heldOutRecall": model_meta["held_out_metrics"].get("recall", 0.015054),
                "heldOutIoU": model_meta["held_out_metrics"].get("iou", 0.011823),
                "heldOutDice": model_meta["held_out_metrics"].get("dice", 0.023370),
                "heldOutPrecision": model_meta["held_out_metrics"].get("precision", 0.052205),
                "heldOutOverallFpr": model_meta["held_out_metrics"].get("overall_fpr", 0.002701),
                "heldOutCleanOceanFpr": model_meta["held_out_metrics"].get("clean_ocean_fpr", 0.000397),
                "validationIoU": model_meta["validation_metrics"].get("iou", 0.152376),
                "validationRecall": model_meta["validation_metrics"].get("recall", 0.363318),
            }
        },
        "input": {
            "sceneId": scene_id or os.path.basename(image_path),
            "sourceType": source_type,
            "sha256": validated_input["sha256"],
            "dimensions": [width, height],
            "polarizations": ["VV", "VH"] if raw_array.shape[0] >= 2 else ["VV"],
            "preprocessing": model_meta["preprocessing"]
        },
        "inference": {
            "operatingThreshold": threshold,
            "tileSize": tile_size,
            "stride": stride,
            "blending": "hann_window",
            "tileCount": len(tiles),
            "device": device,
            "timingMs": {
                "modelVerification": t_load_ms,
                "preprocessing": t_prep_ms,
                "inference": t_infer_ms,
                "postprocessing": t_post_ms,
                "total": t_total_ms
            }
        },
        "prediction": {
            "oilSpillDetected": bool(positive_pixels > 0),
            "confidence": round(mean_confidence, 4) if positive_pixels > 0 else 0.0,
            "positivePixelCount": positive_pixels,
            "totalPixelCount": total_pixels,
            "coveragePercent": coverage_pct,
            "totalAreaM2": total_area_m2,
            "totalAreaKm2": total_area_km2,
            "polygonCount": len(polygons),
            "slickPolygons": polygons,
            "candidateRegions": spill_analysis_result["regions"],
            "largestRegion": spill_analysis_result["summary"]["largestRegion"],
        },
        "geospatial": {
            "crs": validated_input.get("crs"),
            "georeferencingStatus": "valid" if validated_input.get("is_georeferenced") else "missing",
            "bounds": validated_input.get("bounds"),
            "centroid": centroid,
            "sceneBoundingBox": spill_analysis_result["geospatial"]["sceneBoundingBox"]
        },
        "geoJson": spill_analysis_result["geoJson"],
        "artifacts": artifacts,
        "scientificGuardrails": spill_analysis_result["scientificGuardrails"],
        "limitations": [
            "V09D model status is EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS (not production-ready).",
            "Low absolute recall on diffuse, weathered, or low-contrast slick boundaries.",
            "Radar backscatter damping marks candidate dark surface formations only; cannot determine oil chemical type, thickness, or volume.",
            "Spatio-temporal correlation with maritime AIS trajectories does not constitute legal liability or proof of discharge."
        ]
    }

    return response
