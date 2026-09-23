"""
SAR Server-Side Preview Generator Module.
Renders deterministic, calibrated PNG previews directly from Sentinel-1 SAR GeoTIFF files
for VV, VH, and polarimetric RGB composite channels with geospatial bounds compatibility checks.
"""

import os
import io
from typing import Dict, Any, Optional, Tuple, List
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine
from PIL import Image

from app.preprocessing.normalization import normalize_sar_band


def identify_dataset_part(file_path: str) -> str:
    """Identify the source archive or dataset part from file path."""
    p = file_path.replace("\\", "/")
    if "cdse" in p:
        return "Copernicus Data Space Ecosystem (Sentinel-1 Level-1 GRD)"
    if "part1_oil" in p:
        return "Zenodo Sentinel-1 SAR Oil Spill Dataset (Part I / DOI 10.5281/zenodo.8346860)"
    if "part2_lookalike" in p:
        return "Zenodo Sentinel-1 SAR Oil Spill Dataset (Part II Lookalike / DOI 10.5281/zenodo.8253899)"
    if "part2_no_oil" in p:
        return "Zenodo Sentinel-1 SAR Oil Spill Dataset (Part II Clean Ocean / DOI 10.5281/zenodo.8253899)"
    if "part3_test" in p:
        return "Zenodo Sentinel-1 SAR Oil Spill Dataset (Part III Held-Out Test / DOI 10.5281/zenodo.13761290)"
    if "synthetic" in p:
        return "Synthetic Demonstration Raster (Simulated C-Band SAR)"
    return "Sentinel-1 C-Band SAR Archive"


def check_bounds_compatibility(
    raster_bounds: Dict[str, float],
    centroid_lat: Optional[float] = None,
    centroid_lng: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Check if a target slick centroid falls inside the source raster's bounding box.
    """
    if centroid_lat is None or centroid_lng is None:
        return {
            "is_compatible": True,
            "status": "UNCHECKED",
            "message": "No slick coordinates provided for compatibility check.",
        }

    left = raster_bounds.get("left", 0.0)
    right = raster_bounds.get("right", 0.0)
    bottom = raster_bounds.get("bottom", 0.0)
    top = raster_bounds.get("top", 0.0)

    is_lng_inside = min(left, right) <= centroid_lng <= max(left, right)
    is_lat_inside = min(bottom, top) <= centroid_lat <= max(bottom, top)

    is_compatible = is_lng_inside and is_lat_inside

    if is_compatible:
        return {
            "is_compatible": True,
            "status": "GEOSPATIALLY_COMPATIBLE",
            "slick_centroid": [centroid_lat, centroid_lng],
            "raster_bounds": raster_bounds,
            "message": "Persisted spill polygon centroid falls within the source raster geographic bounds.",
        }
    else:
        return {
            "is_compatible": False,
            "status": "OVERLAY_NOT_GEOSPATIALLY_COMPATIBLE",
            "slick_centroid": [centroid_lat, centroid_lng],
            "raster_bounds": raster_bounds,
            "message": f"Persisted slick centroid [{centroid_lat:.4f}°N, {centroid_lng:.4f}°E] is outside raster bounds (Lng: [{left:.4f}, {right:.4f}], Lat: [{bottom:.4f}, {top:.4f}]). Overlay suppressed.",
        }


def extract_sar_raster_metadata(
    file_path: str,
    centroid_lat: Optional[float] = None,
    centroid_lng: Optional[float] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Extract complete geospatial and radiometrical metadata from a SAR GeoTIFF file.
    """
    if not os.path.exists(file_path):
        return {
            "exists": False,
            "error": f"File not found: {file_path}",
            "file_path": file_path,
        }

    with rasterio.open(file_path) as src:
        crs: Optional[CRS] = src.crs
        transform: Affine = src.transform
        bounds = src.bounds
        res = src.res

        bands = []
        if src.count >= 1:
            bands.append("VV")
        if src.count >= 2:
            bands.append("VH")

        bounds_dict = {
            "left": bounds.left,
            "bottom": bounds.bottom,
            "right": bounds.right,
            "top": bounds.top,
        }

        compat = check_bounds_compatibility(bounds_dict, centroid_lat, centroid_lng)

        # Check for corresponding ground-truth mask
        mask_path = None
        clean_p = file_path.replace("\\", "/")
        if "/images/" in clean_p:
            possible_mask = clean_p.replace("/images/", "/masks/")
            if os.path.exists(possible_mask):
                mask_path = possible_mask

        gt_data = {}
        if mask_path and os.path.exists(mask_path):
            try:
                with rasterio.open(mask_path) as msrc:
                    m_arr = msrc.read(1)
                    gt_pixels = int(np.sum(m_arr > 0))
                    gt_data["mask_path"] = mask_path
                    gt_data["ground_truth_available"] = True
                    gt_data["ground_truth_pixel_count"] = gt_pixels
            except Exception:
                pass

        # Determine model and corresponding validation report
        model_str = (model or "").lower()
        if "v4" in model_str:
            report_name = "positive_validation_report_v4.json"
            def_model = "unet-dual-pol-sar-v4"
            def_thresh = 0.50
        elif "v3" in model_str:
            report_name = "positive_validation_report_v3.json"
            def_model = "unet-dual-pol-sar-v3"
            def_thresh = 0.25
        else:
            report_name = "positive_validation_report.json"
            def_model = "unet-dual-pol-sar-v2"
            def_thresh = 0.35

        # Check for precomputed positive validation report
        val_report_path = os.path.join(os.path.dirname(os.path.dirname(file_path)), report_name)
        val_report = None
        if os.path.exists(val_report_path):
            try:
                import json
                with open(val_report_path, "r") as f:
                    val_report = json.load(f)
            except Exception:
                val_report = None

        res_meta = {
            "exists": True,
            "file_path": file_path,
            "filename": os.path.basename(file_path),
            "dataset_part": identify_dataset_part(file_path),
            "width": src.width,
            "height": src.height,
            "band_count": src.count,
            "bands": bands,
            "polarization": "VV+VH" if src.count >= 2 else ("VV" if src.count == 1 else "NONE"),
            "dtype": str(src.dtypes[0]),
            "crs": crs.to_string() if crs else "UNSPECIFIED",
            "is_geographic": crs.is_geographic if crs else False,
            "affine_transform": list(transform) if transform else None,
            "bounds": bounds_dict,
            "resolution": list(res),
            "nodata": src.nodata,
            "detection_model": def_model,
            "threshold": def_thresh,
            "bounds_compatibility": compat,
            "preview_available": True,
            **gt_data,
        }

        if val_report and val_report.get("imagePath", "").replace("\\", "/").endswith(os.path.basename(file_path)):
            res_meta["validation_metrics"] = val_report.get("evaluationMetrics")
            res_meta["evaluation_metrics"] = val_report.get("evaluationMetrics")
            res_meta["ground_truth_area_km2"] = val_report.get("evaluationMetrics", {}).get("groundTruthAreaKm2")
            res_meta["predicted_area_km2"] = val_report.get("evaluationMetrics", {}).get("predictedAreaKm2")
            res_meta["ground_truth_polygons"] = val_report.get("groundTruthPolygons")
            res_meta["predicted_polygons"] = val_report.get("predictedPolygons")
            res_meta["provenance_record"] = {
                "dataset": val_report.get("dataset", "Sentinel-1 SAR Oil Spill Dataset"),
                "datasetPart": val_report.get("datasetPart", "Part I"),
                "imagePath": val_report.get("imagePath", file_path),
                "maskPath": val_report.get("maskPath", mask_path),
                "bands": val_report.get("bands", ["VV", "VH"]),
                "model": val_report.get("model", def_model),
                "threshold": val_report.get("threshold", def_thresh),
            }

        return res_meta


def generate_sar_preview_image(
    file_path: str,
    channel: str = "vv_vh",
    max_dimension: int = 1024,
) -> Tuple[bytes, Dict[str, Any]]:
    """
    Generate a calibrated SAR preview PNG image from the actual GeoTIFF raster.

    Args:
        file_path: Path to the GeoTIFF raster file.
        channel: "vv", "vh", "vv_vh", "ground_truth" / "gt", or "ai_detection".
        max_dimension: Max width/height to scale down for responsive web delivery.

    Returns:
        Tuple of (png_bytes, metadata_dict).
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"SAR raster file not found: {file_path}")

    channel_clean = channel.lower().replace("+", "_").replace(" ", "_")

    # Handle Ground Truth Mask channel
    if channel_clean in ["ground_truth", "gt", "mask"]:
        mask_path = None
        clean_p = file_path.replace("\\", "/")
        if "/images/" in clean_p:
            possible_mask = clean_p.replace("/images/", "/masks/")
            if os.path.exists(possible_mask):
                mask_path = possible_mask

        if not mask_path or not os.path.exists(mask_path):
            raise FileNotFoundError(f"Corresponding ground truth mask not found for {file_path}")

        with rasterio.open(mask_path) as msrc:
            mask_data = msrc.read(1)
            m_h, m_w = mask_data.shape
            # Create RGBA: Emerald green (#10b981) on positive pixels, transparent elsewhere
            pos_mask = (mask_data > 0)
            r = np.zeros((m_h, m_w), dtype=np.uint8)
            g = np.zeros((m_h, m_w), dtype=np.uint8)
            b = np.zeros((m_h, m_w), dtype=np.uint8)
            a = np.zeros((m_h, m_w), dtype=np.uint8)

            r[pos_mask] = 16
            g[pos_mask] = 185
            b[pos_mask] = 129
            a[pos_mask] = 220

            img_array = np.dstack((r, g, b, a))
            img = Image.fromarray(img_array, mode="RGBA")

            if max(m_w, m_h) > max_dimension:
                scale = max_dimension / max(m_w, m_h)
                new_w = max(1, int(m_w * scale))
                new_h = max(1, int(m_h * scale))
                img = img.resize((new_w, new_h), Image.Resampling.NEAREST)

            buffer = io.BytesIO()
            img.save(buffer, format="PNG", optimize=True)
            png_bytes = buffer.getvalue()

            meta = {
                "width": m_w,
                "height": m_h,
                "preview_width": img.width,
                "preview_height": img.height,
                "channel_rendered": "ground_truth",
                "positive_pixel_count": int(np.sum(pos_mask)),
            }
            return png_bytes, meta

    with rasterio.open(file_path) as src:
        count = src.count
        width = src.width
        height = src.height
        nodata = src.nodata
        crs = src.crs
        bounds = src.bounds

        # Read bands
        band1 = src.read(1)
        band2 = src.read(2) if count >= 2 else None

        # Mask nodata & scrub NaNs
        valid_mask_vv = np.isfinite(band1)
        if nodata is not None:
            valid_mask_vv = valid_mask_vv & (band1 != nodata)

        clean_vv = np.nan_to_num(band1, nan=-50.0, posinf=0.0, neginf=-50.0)

        # Normalize VV to [0, 255]
        norm_vv = normalize_sar_band(clean_vv)
        uint8_vv = (norm_vv * 255.0).astype(np.uint8)

        if count >= 2 and band2 is not None:
            valid_mask_vh = np.isfinite(band2)
            if nodata is not None:
                valid_mask_vh = valid_mask_vh & (band2 != nodata)
            clean_vh = np.nan_to_num(band2, nan=-50.0, posinf=0.0, neginf=-50.0)
            norm_vh = normalize_sar_band(clean_vh)
            uint8_vh = (norm_vh * 255.0).astype(np.uint8)
            alpha_mask = (valid_mask_vv & valid_mask_vh).astype(np.uint8) * 255
        else:
            uint8_vh = None
            norm_vh = None
            alpha_mask = valid_mask_vv.astype(np.uint8) * 255

        # Build image based on requested channel
        if channel_clean == "vh":
            if uint8_vh is None:
                raise ValueError("VH polarization channel not available in single-band raster.")
            img_array = np.dstack((uint8_vh, uint8_vh, uint8_vh, alpha_mask))
            img = Image.fromarray(img_array, mode="RGBA")
        elif channel_clean == "vv":
            img_array = np.dstack((uint8_vv, uint8_vv, uint8_vv, alpha_mask))
            img = Image.fromarray(img_array, mode="RGBA")
        else:  # vv_vh / composite
            if uint8_vh is not None and norm_vh is not None:
                eps = 1e-5
                ratio = (norm_vv + eps) / (norm_vh + eps)
                norm_ratio = normalize_sar_band(ratio)
                uint8_b = (norm_ratio * 255.0).astype(np.uint8)
                img_array = np.dstack((uint8_vv, uint8_vh, uint8_b, alpha_mask))
            else:
                img_array = np.dstack((uint8_vv, uint8_vv, uint8_vv, alpha_mask))
            img = Image.fromarray(img_array, mode="RGBA")

        # Downscale if larger than max_dimension
        if max(width, height) > max_dimension:
            scale = max_dimension / max(width, height)
            new_w = max(1, int(width * scale))
            new_h = max(1, int(height * scale))
            img = img.resize((new_w, new_h), Image.Resampling.BILINEAR)

        buffer = io.BytesIO()
        img.save(buffer, format="PNG", optimize=True)
        png_bytes = buffer.getvalue()

        meta = {
            "width": width,
            "height": height,
            "preview_width": img.width,
            "preview_height": img.height,
            "bands_available": ["VV"] if count < 2 else ["VV", "VH"],
            "channel_rendered": channel_clean,
            "crs": crs.to_string() if crs else "UNSPECIFIED",
            "bounds": {
                "left": bounds.left,
                "bottom": bounds.bottom,
                "right": bounds.right,
                "top": bounds.top,
            },
        }

        return png_bytes, meta
