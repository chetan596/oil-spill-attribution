import os
from typing import Dict, Any, Optional
import torch
import numpy as np
from fastapi import APIRouter, HTTPException, status, Response, Query


from app.api.schemas.detection import (
    DetectionRequest,
    DetectionResponse,
    ManualAnalysisRequest,
    ManualAnalysisResponse,
    V09DInferenceRequest,
    V09DInferenceResponse,
    RgbClassificationRequest,
    RgbClassificationResponse,
    ManualOpticalInferRequest,
    ManualOpticalInferResponse,
    TiffInspectRequest,
    TiffInspectResponse,
    SarDualPolInferRequest,
    SarDualPolInferResponse,
)
from app.core.config import settings
from app.preprocessing.sar_preprocessor import load_sar_raster, SARPreprocessingError
from app.preprocessing.sar_preview import extract_sar_raster_metadata, generate_sar_preview_image
from app.preprocessing.tiff_preview import generate_tiff_visual_preview, inspect_tiff_metadata
from app.inference.sar_dual_pol_inference_engine import (
    execute_sar_dual_pol_inference,
    inspect_and_read_sar_raster,
    SARDualPolInputError,
    SARDualPolModelMismatchError,
)

from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.postprocessing.mask_to_polygon import probability_mask_to_polygons
from app.models.registry import model_registry, ModelNotTrainedError, ModelNotFoundError, ModelVerificationError
from app.inference.v09d_engine import execute_v09d_full_scene_inference, SARInputValidationError
from app.inference.rgb_classifier_engine import (
    classify_rgb_image,
    ModalityGuardError,
    InvalidImageInputError,
)
from app.inference.optical_inference_engine import (
    optical_engine,
    ModelVerificationError as OpticalModelVerificationError,
    ModalityValidationError as OpticalModalityValidationError,
)

router = APIRouter()




DEMO_SCENARIO_OUTPUTS = {
    "demo-scene-001": {
        "polygon": {
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
        },
        "confidence": 0.94,
        "total_area_km2": 4.73,
        "estimated_age_hours": 14.5,
    },
    "demo-scene-002": {
        "polygon": {
            "type": "Polygon",
            "coordinates": [
                [
                    [69.180, 22.430],
                    [69.240, 22.430],
                    [69.240, 22.470],
                    [69.180, 22.470],
                    [69.180, 22.430],
                ]
            ],
        },
        "confidence": 0.91,
        "total_area_km2": 2.85,
        "estimated_age_hours": 12.0,
    },
    "demo-scene-003": {
        "polygon": {
            "type": "Polygon",
            "coordinates": [
                [
                    [86.880, 20.120],
                    [86.960, 20.120],
                    [86.960, 20.180],
                    [86.880, 20.180],
                    [86.880, 20.120],
                ]
            ],
        },
        "confidence": 0.89,
        "total_area_km2": 5.20,
        "estimated_age_hours": 16.0,
    },
    "demo-scene-004": {
        "polygon": {
            "type": "Polygon",
            "coordinates": [
                [
                    [73.490, 15.260],
                    [73.550, 15.260],
                    [73.550, 15.300],
                    [73.490, 15.300],
                    [73.490, 15.260],
                ]
            ],
        },
        "confidence": 0.93,
        "total_area_km2": 3.60,
        "estimated_age_hours": 10.5,
    },
}


def get_demo_fallback_response(scene_id: str) -> DetectionResponse:
    """
    Deterministic demonstration scenario fallback.
    Explicitly flags processing_metadata.mode = 'demo_fallback' and is_real_ml = False.
    """
    scenario = DEMO_SCENARIO_OUTPUTS.get(scene_id, DEMO_SCENARIO_OUTPUTS["demo-scene-001"])

    return DetectionResponse(
        scene_id=scene_id,
        detection_status="detected",
        confidence=scenario["confidence"],
        slick_polygons=[scenario["polygon"]],
        total_area_km2=scenario["total_area_km2"],
        estimated_age_hours=scenario["estimated_age_hours"],
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

    # 2. Load model weights (Verified V09D or default registry model)
    try:
        if request.model_id in ["unet-dual-pol-sar-v09d-residual-loss", "v09d"]:
            model, model_entry = model_registry.load_verified_model(
                model_id="unet-dual-pol-sar-v09d-residual-loss",
                device="cpu"
            )
        elif request.model_id:
            model, model_entry = model_registry.load_model(model_id=request.model_id, device="cpu", allow_untrained=False)
        else:
            model, model_entry = model_registry.load_model(device="cpu", allow_untrained=False)
    except ModelVerificationError as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model Cryptographic/Structural Verification Failed: {str(err)}"
        )
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

    # Match tensor channels to model in_channels if single polarization provided
    expected_channels = model_entry.get("in_channels", 2)
    if expected_channels == 2 and raster_tensor.shape[0] == 1:
        raster_tensor = np.stack([raster_tensor[0], raster_tensor[0]], axis=0)

    # 3. Slice into tiles
    tiles, tile_coords = generate_tiles(
        raster_array=raster_tensor,
        tile_size=settings.TILE_SIZE,
        stride=settings.STRIDE
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


def _resolve_raster_file(scene_id: Optional[str] = None, image_path: Optional[str] = None) -> Optional[str]:
    """Helper to safely resolve a raster file path."""
    if not isinstance(image_path, str):
        image_path = None
    if not isinstance(scene_id, str):
        scene_id = None

    if image_path and os.path.exists(image_path):
        return image_path

    # Common relative paths in project root
    base_dirs = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../..")),
        os.getcwd(),
    ]

    if image_path:
        for b in base_dirs:
            candidate = os.path.join(b, image_path)
            if os.path.exists(candidate):
                return candidate

    # If scene_id corresponds to known dataset file or manifest entry
    if scene_id:
        clean_id = scene_id.replace("real_part1_oil_", "").replace("real_part3_test_", "").replace("real_part2_lookalike_", "").replace("real_part2_no_oil_", "")
        for b in base_dirs:
            candidates = [
                os.path.join(b, f"data/raw/satellite/real/part1_oil/images/{scene_id}.tif"),
                os.path.join(b, f"data/raw/satellite/real/part1_oil/images/{clean_id}.tif"),
                os.path.join(b, f"data/raw/satellite/real/part3_test/images/{scene_id}.tif"),
                os.path.join(b, f"data/raw/satellite/real/part3_test/images/{clean_id}.tif"),
                os.path.join(b, f"data/raw/satellite/real/part2_lookalike/images/{clean_id}.tif"),
                os.path.join(b, f"data/raw/satellite/real/part2_no_oil/images/{clean_id}.tif"),
            ]
            for c in candidates:
                if os.path.exists(c):
                    return c

            # Check dataset_manifest.json
            manifest_path = os.path.join(b, "data/raw/satellite/dataset_manifest.json")
            if os.path.exists(manifest_path):
                try:
                    import json
                    with open(manifest_path, "r") as f:
                        m_data = json.load(f)
                    for sc in m_data.get("scenes", []):
                        if sc.get("scene_id") == scene_id:
                            m_img = os.path.join(b, sc.get("image_path", ""))
                            if os.path.exists(m_img):
                                return m_img
                except Exception:
                    pass

    return None


@router.get("/raster-metadata")
def get_raster_metadata(
    scene_id: Optional[str] = Query(None),
    image_path: Optional[str] = Query(None),
    centroid_lat: Optional[float] = Query(None),
    centroid_lng: Optional[float] = Query(None),
    model: Optional[str] = Query(None),
):
    """
    Retrieve metadata for a SAR GeoTIFF file including geospatial bounds compatibility.
    """
    if not isinstance(centroid_lat, (int, float)):
        centroid_lat = None
    if not isinstance(centroid_lng, (int, float)):
        centroid_lng = None

    resolved_path = _resolve_raster_file(scene_id=scene_id, image_path=image_path)
    if not resolved_path:
        return {
            "scene_id": scene_id,
            "preview_available": False,
            "source_classification": "SAR_SOURCE_RASTER_UNAVAILABLE",
            "message": "SAR SOURCE RASTER UNAVAILABLE FOR THIS SCENARIO",
            "detection_model": "unet-dual-pol-sar-v2",
            "threshold": 0.35,
        }

    meta = extract_sar_raster_metadata(
        resolved_path,
        centroid_lat=centroid_lat,
        centroid_lng=centroid_lng,
        model=model,
    )
    meta["scene_id"] = scene_id or meta.get("filename")
    meta["source_classification"] = "VERIFIED_DATASET_DERIVED_SAR"
    return meta


@router.get("/raster-preview")
def get_raster_preview(
    scene_id: Optional[str] = Query(None),
    image_path: Optional[str] = Query(None),
    channel: str = Query("vv_vh", description="Channel: vv, vh, or vv_vh"),
    max_dimension: int = Query(1024, ge=256, le=2048),
):
    """
    Generate calibrated server-side PNG preview from actual SAR GeoTIFF raster.
    """
    resolved_path = _resolve_raster_file(scene_id=scene_id, image_path=image_path)
    if not resolved_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SAR raster file unavailable for requested scene/path."
        )

    try:
        png_bytes, meta = generate_sar_preview_image(
            file_path=resolved_path,
            channel=channel,
            max_dimension=max_dimension,
        )
        return Response(
            content=png_bytes,
            media_type="image/png",
            headers={
                "X-SAR-Scene-ID": str(scene_id or meta.get("filename", "")),
                "X-SAR-Channel": channel,
                "X-SAR-Source-CRS": str(meta.get("crs", "")),
                "X-SAR-Dimensions": f"{meta.get('width')}x{meta.get('height')}",
                "Cache-Control": "public, max-age=86400",
            }
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to generate SAR preview: {str(err)}"
        )


@router.post("/manual-analysis", response_model=ManualAnalysisResponse)
def analyze_manual_image(request: ManualAnalysisRequest) -> ManualAnalysisResponse:
    """
    Execute Manual Image Analysis Pipeline:
      - Validates container and file integrity
      - Evaluates SAR compatibility (strictly rejects optical RGB photos)
      - Radiometric normalization (corrected Sentinel-1 dB calibration)
      - Deep learning U-Net inference and probability reconstruction
      - Binary segmentation and localized region delineation
      - Coverage % and georeferenced surface area (km² if georeferenced, else null)
      - Evidence-based estimated spill severity derivation
      - SAR look-alike risk estimation
      - Visual artifact generation (original, mask, overlay, probability heatmap)
    """
    if not request.image_path or not os.path.exists(request.image_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Uploaded image file not found at path: '{request.image_path}'"
        )

    try:
        from app.inference.manual_inference import execute_manual_analysis_pipeline
        result = execute_manual_analysis_pipeline(
            image_path=request.image_path,
            original_filename=request.original_filename or "uploaded_image",
            output_dir=request.output_dir,
            threshold=request.threshold,
            polarization=request.polarization,
            model_id=request.model_id or "unet-dual-pol-sar-v09d-residual-loss"
        )
        return ManualAnalysisResponse(
            analysis_type=result.get("analysisType", "MANUAL_IMAGE"),
            status=result.get("status", "COMPLETED"),
            input=result.get("input", {}),
            compatibility=result.get("compatibility", {}),
            detection=result.get("detection", {}),
            segmentation=result.get("segmentation", {}),
            severity=result.get("severity", {}),
            oil_type=result.get("oilType", {}),
            authenticity=result.get("authenticity", {}),
            quality=result.get("quality", {}),
            look_alike=result.get("lookAlike", {}),
            artifacts=result.get("artifacts", {}),
            regions=result.get("regions", []),
            limitations=result.get("limitations", []),
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Manual Image Analysis Pipeline failed: {str(err)}"
        )


@router.post("/v09d-inference", response_model=V09DInferenceResponse)
def run_v09d_inference(request: V09DInferenceRequest) -> V09DInferenceResponse:
    """
    Execute full-scene SAR semantic segmentation using frozen candidate V09D
    (unet-dual-pol-sar-v09d-residual-loss) from OG-SAR-ML-RESEARCH-RELEASE-V0.12.
    """
    try:
        res = execute_v09d_full_scene_inference(
            image_path=request.image_path,
            scene_id=request.scene_id,
            threshold=request.threshold,
            source_type=request.source_type,
            output_dir=request.output_dir,
            generate_artifacts=request.generate_artifacts
        )
        return V09DInferenceResponse(**res)
    except SARInputValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except ModelVerificationError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"V09D inference failed: {str(e)}")


@router.post("/rgb-classify", response_model=RgbClassificationResponse)
def run_rgb_classification(request: RgbClassificationRequest) -> RgbClassificationResponse:
    """
    Execute RGB Oil vs Non-Oil binary classification for optical imagery (JPG, JPEG, PNG).
    Enforces strict modality guard: Rejects TIFF / SAR imagery.
    """
    if not request.image_path or not os.path.exists(request.image_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image file not found on disk at path: '{request.image_path}'"
        )

    try:
        res = classify_rgb_image(
            image_path=request.image_path,
            threshold=request.threshold,
        )
        return RgbClassificationResponse(**res)
    except ModalityGuardError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except InvalidImageInputError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="RGB image classification failed. The model is temporarily unavailable or encountered an unrecoverable error."
        )


from app.inference.optical_router import (
    operational_optical_engine,
    AmbiguousModalityError,
    UnsupportedInputError,
    ModelInputMismatchError,
    ModelVerificationError as OpticalRouterModelVerificationError,
)
from app.api.schemas.detection import (
    DetectionRequest,
    DetectionResponse,
    ManualAnalysisRequest,
    ManualAnalysisResponse,
    V09DInferenceRequest,
    V09DInferenceResponse,
    RgbClassificationRequest,
    RgbClassificationResponse,
    ManualOpticalInferRequest,
    ManualOpticalInferResponse,
    OperationalOpticalInferRequest,
    OperationalOpticalInferResponse,
    ManualOpticalCompareRequest,
    ManualOpticalCompareResponse,
)


@router.post("/manual-analysis/infer", response_model=ManualOpticalInferResponse)
def run_manual_optical_inference(request: ManualOpticalInferRequest) -> ManualOpticalInferResponse:
    """
    Execute Phase 12 domain-routed operational optical inference for manual image uploads:
      - Sentinel-2 Multi-Spectral (6-band -> mados-resnet34-rgbnir-swir-v1)
      - Drone / Aerial RGB (3-band -> kerf-resnet34-focaldice-v1)
      - RGB-Only Satellite Fallback (3-band -> mados-resnet34-rgb-v1)
    """
    has_image = bool(request.image_path and os.path.exists(request.image_path))
    has_bands = bool(request.band_paths)

    if not has_image and not has_bands:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image file or band paths not found on disk: '{request.image_path}'"
        )

    # Check for SAR Dual-Polarization or 2-channel TIFF
    if has_image and request.image_path and request.image_path.lower().endswith((".tif", ".tiff")):
        is_sar_model = request.model_id == "unet-dual-pol-sar-v09d-residual-loss"
        is_sar_source = (request.source_type or "").upper() in ("SAR_DUAL_POL", "SENTINEL1_DUAL_POL", "SENTINEL-1", "SENTINEL_1")

        channel_count = 0
        try:
            import rasterio
            with rasterio.open(request.image_path) as src:
                channel_count = src.count
        except Exception:
            pass

        if channel_count == 2 or is_sar_model or is_sar_source:
            if is_sar_model and channel_count != 2:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "MODEL_INPUT_MISMATCH", "message": f"Selected model 'unet-dual-pol-sar-v09d-residual-loss' requires 2-channel SAR VV+VH input, but file has {channel_count} channels."},
                )
            if channel_count == 2 and request.model_id and request.model_id != "unet-dual-pol-sar-v09d-residual-loss":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "MODEL_INPUT_MISMATCH", "message": f"Selected model '{request.model_id}' is not compatible with 2-channel raster. Requires SAR dual-pol model."},
                )

            # Execute SAR dual-pol inference
            out_dir = request.output_dir or os.path.dirname(request.image_path)
            try:
                sar_res = execute_sar_dual_pol_inference(
                    image_path=request.image_path,
                    output_dir=out_dir,
                    prefix=request.prefix or "manual_sar",
                    threshold=request.threshold or 0.50,
                    requested_model_id=request.model_id,
                    trusted_source=request.source_type,
                    explicit_polarizations=request.bands,
                )

                inference_ms = float(sar_res.get("timingMs", 0.0))
                is_detected = sar_res.get("detectionStatus") == "DETECTED"

                formatted_sar_res = {
                    **sar_res,
                    "status": "COMPLETED",
                    "model": {
                        "modelId": sar_res.get("modelId", "unet-dual-pol-sar-v09d-residual-loss"),
                        "name": "Dual-Pol SAR Residual Loss U-Net v0.9d",
                        "inputType": "SAR_DUAL_POL",
                        "polarizations": sar_res.get("polarizations", ["VV", "VH"]),
                        "checkpoint": "unet_dual_pol_sar_v09d_residual_loss.pth",
                    },
                    "classification": {
                        "label": "OIL_SPILL" if is_detected else "NO_SPILL",
                        "is_oil_spill": is_detected,
                        "confidence": float(sar_res.get("confidence", 0.0)),
                    },
                    "segmentation": {
                        "foreground_pixels": int(sar_res.get("positivePixels", 0)),
                        "total_pixels": int(sar_res.get("totalPixels", 0)),
                        "foreground_fraction": float((sar_res.get("oilSpillCoveragePercent", 0.0) or 0.0) / 100.0),
                        "mask_available": bool(sar_res.get("artifacts", {}).get("mask")),
                    },
                    "geospatial": sar_res.get("geospatial") or {},
                    "inference_time_ms": inference_ms,
                    "timing_ms": {"inference_ms": inference_ms, "total_ms": inference_ms},
                }

                return ManualOpticalInferResponse(**formatted_sar_res)
            except SARDualPolModelMismatchError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "MODEL_INPUT_MISMATCH", "message": str(e)},
                )
            except SARDualPolInputError as e:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "MODEL_INPUT_MISMATCH", "message": str(e)},
                )
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"SAR dual-pol inference failed: {str(e)}",
                )

    try:
        res = operational_optical_engine.run_inference(
            image_path=request.image_path,
            user_selected_type=request.source_type,
            band_paths=request.band_paths,
            threshold=request.threshold,
            output_dir=request.output_dir,
            prefix=request.prefix or "manual",
            requested_model_id=request.model_id,
        )
        return ManualOpticalInferResponse(**res)
    except ModelInputMismatchError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MODEL_INPUT_MISMATCH", "message": str(e)},
        )
    except AmbiguousModalityError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except UnsupportedInputError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MODEL_INPUT_MISMATCH", "message": str(e)},
        )
    except (OpticalRouterModelVerificationError, OpticalModelVerificationError) as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Optical inference failed: {str(e)}")



@router.post("/manual-analysis/compare-models", response_model=ManualOpticalCompareResponse)
def compare_manual_optical_models(request: ManualOpticalCompareRequest) -> ManualOpticalCompareResponse:
    """
    Phase 14 Developer Tool: Execute side-by-side comparison of Drone RGB vs Satellite RGB
    models on the same uploaded image.
    """
    if not request.image_path or not os.path.exists(request.image_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image file not found on disk: '{request.image_path}'"
        )

    try:
        res = operational_optical_engine.compare_optical_models(
            image_path=request.image_path,
            threshold=request.threshold,
            output_dir=request.output_dir,
        )
        return ManualOpticalCompareResponse(**res)
    except AmbiguousModalityError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except UnsupportedInputError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except (OpticalRouterModelVerificationError, OpticalModelVerificationError) as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Model comparison failed: {str(e)}")


@router.post("/optical/infer", response_model=OperationalOpticalInferResponse)
def run_operational_optical_inference(request: OperationalOpticalInferRequest) -> OperationalOpticalInferResponse:
    """
    Execute Phase 12 Domain-Specific Operational Optical Inference:
      - Sentinel-2 Multi-Spectral (6-band B4, B3, B2, B8, B11, B12 -> mados-resnet34-rgbnir-swir-v1)
      - Drone / Aerial RGB (3-band RGB -> kerf-resnet34-focaldice-v1)
      - RGB-Only Satellite Fallback (3-band RGB -> mados-resnet34-rgb-v1)
    """
    has_image = bool(request.image_path and os.path.exists(request.image_path))
    has_bands = bool(request.band_paths)

    if not has_image and not has_bands:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image file or band paths not found on disk: '{request.image_path}'"
        )

    try:
        res = operational_optical_engine.run_inference(
            image_path=request.image_path,
            user_selected_type=request.source_type,
            band_paths=request.band_paths,
            threshold=request.threshold,
            output_dir=request.output_dir,
            prefix=request.prefix or "optical",
            requested_model_id=request.model_id,
        )
        return OperationalOpticalInferResponse(**res)
    except ModelInputMismatchError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MODEL_INPUT_MISMATCH", "message": str(e)},
        )
    except AmbiguousModalityError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except UnsupportedInputError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except OpticalRouterModelVerificationError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Operational optical inference failed: {str(e)}")


@router.post("/tiff/inspect", response_model=TiffInspectResponse)
def inspect_tiff_file(request: TiffInspectRequest) -> TiffInspectResponse:
    """
    Phase 15/16 TIFF / GeoTIFF Forensic Inspector & Visual Preview Generator:
    Extracts authoritatively verified raster and GeoTIFF metadata and generates
    derived PNG visual preview artifacts without modifying the authoritative source TIFF.
    """
    if not request.image_path or not os.path.exists(request.image_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image file not found on disk: '{request.image_path}'"
        )

    out_dir = request.output_dir or os.path.dirname(request.image_path)
    try:
        preview_res = generate_tiff_visual_preview(
            file_path=request.image_path,
            output_dir=out_dir,
            prefix=request.prefix or "tiff",
            max_dimension=request.max_dimension or 1024,
            source_type=request.source_type,
            explicit_polarizations=request.explicit_polarizations,
        )
        return TiffInspectResponse(**preview_res)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"TIFF forensic inspection failed: {str(e)}"
        )


@router.post("/sar/dual-pol/infer", response_model=SarDualPolInferResponse)
def run_sar_dual_pol_inference(request: SarDualPolInferRequest) -> SarDualPolInferResponse:
    """
    Phase 16 Dedicated Dual-Polarization SAR Semantic Segmentation Inference:
    Executes authoritative inference with verified checkpoint 'unet-dual-pol-sar-v09d-residual-loss'.
    """
    if not request.image_path or not os.path.exists(request.image_path):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SAR image file not found on disk: '{request.image_path}'"
        )

    out_dir = request.output_dir or os.path.dirname(request.image_path)
    try:
        res = execute_sar_dual_pol_inference(
            image_path=request.image_path,
            output_dir=out_dir,
            prefix=request.prefix or "sar_dual_pol",
            threshold=request.threshold or 0.50,
            requested_model_id=request.model_id,
            trusted_source=request.source_type,
            explicit_polarizations=request.polarizations,
        )
        return SarDualPolInferResponse(**res)
    except SARDualPolModelMismatchError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "MODEL_INPUT_MISMATCH", "message": str(e)},
        )
    except SARDualPolInputError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SAR dual-pol inference failed: {str(e)}",
        )








