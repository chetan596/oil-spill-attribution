"""
TIFF Metadata Inspector & Deterministic Preview Renderer (Phase 15).
Extracts comprehensive raster and GeoTIFF metadata, performs deterministic
normalization (uint8, uint16, float32) handling NaN/Inf/nodata, and renders
derived visual PNG previews without modifying the authoritative source TIFF.
"""

import os
import io
import math
from typing import Dict, Any, Optional, Tuple, List
import numpy as np
from PIL import Image

try:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import Affine
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


class InvalidTiffError(ValueError):
    """Raised when an uploaded file is not a valid or readable TIFF."""
    pass


def compute_pixel_display_stats(
    arr: np.ndarray,
    nodata: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Forensically inspect pixel value distribution without modifying the source array.
    Excludes nodata, NaNs, and infinite values from all statistical calculations.
    """
    valid_mask = np.isfinite(arr)
    if nodata is not None:
        valid_mask = valid_mask & (arr != nodata)

    if not np.any(valid_mask):
        return {
            "min": 0.0,
            "max": 0.0,
            "mean": 0.0,
            "median": 0.0,
            "p01": 0.0,
            "p02": 0.0,
            "p05": 0.0,
            "p50": 0.0,
            "p95": 0.0,
            "p98": 0.0,
            "p99": 0.0,
            "uniqueValueCount": 0,
            "uniqueValues": [],
            "isConstant": True,
            "isBinary": False,
            "isNearBinary": False,
            "isLowDynamicRange": False,
        }

    valid_vals = arr[valid_mask]
    val_min = float(np.min(valid_vals))
    val_max = float(np.max(valid_vals))
    val_mean = float(np.mean(valid_vals))
    val_median = float(np.median(valid_vals))

    p01, p02, p05, p50, p95, p98, p99 = [
        float(p) for p in np.percentile(valid_vals, [1, 2, 5, 50, 95, 98, 99])
    ]

    # For unique values, check full array if integer/small, or sample if massive float
    if len(valid_vals) > 2_000_000 and valid_vals.dtype.kind == 'f':
        uniques, counts = np.unique(valid_vals[:500_000], return_counts=True)
    else:
        uniques, counts = np.unique(valid_vals, return_counts=True)

    unique_count = int(len(uniques))
    unique_list = [float(v) if isinstance(v, (np.floating, float)) else int(v) for v in uniques[:25]]

    # 1. Constant check
    is_constant = bool(val_min == val_max or unique_count <= 1)

    # 2. Binary detection:
    # A raster is classified as binary when unique_value_count == 2
    # AND values are discrete/separated sufficiently for mask interpretation
    is_binary = False
    if unique_count == 2 and not is_constant:
        u_sorted = sorted(unique_list)
        # Common mask cases: {0, 1}, {0, 255}, {1, 2}, or lower is 0 and upper in [1, 2, 3, 255]
        if u_sorted in [[0, 1], [0, 255], [1, 2]]:
            is_binary = True
        elif u_sorted[0] == 0 and u_sorted[1] in [1, 2, 3, 255]:
            is_binary = True
        elif arr.dtype == np.uint8 and (u_sorted[1] - u_sorted[0] == 1):
            is_binary = True

    # 3. Near-binary detection:
    # >99% of valid pixels belong to <= 2 dominant values that are mask-like
    is_near_binary = False
    if not is_constant and not is_binary and len(counts) >= 2:
        top_2_indices = np.argsort(counts)[-2:]
        top_2_count = counts[top_2_indices].sum()
        ratio = top_2_count / len(valid_vals)
        if ratio > 0.99:
            top_2_vals = sorted([uniques[i] for i in top_2_indices])
            if (top_2_vals[0] == 0 and top_2_vals[1] in [1, 2, 255]) or (top_2_vals == [0, 1]):
                is_near_binary = True

    # 4. Low dynamic range detection:
    is_low_dynamic_range = False
    if not is_constant and not is_binary:
        if str(arr.dtype) == "uint8":
            is_low_dynamic_range = bool((val_max - val_min) < 32 or (p98 - p02) < 20)
        elif "16" in str(arr.dtype):
            is_low_dynamic_range = bool((val_max - val_min) < 500 or (p98 - p02) < 300)
        else:
            is_low_dynamic_range = bool((p98 - p02) < 0.1 * (val_max - val_min + 1e-6))

    return {
        "min": round(val_min, 4),
        "max": round(val_max, 4),
        "mean": round(val_mean, 4),
        "median": round(val_median, 4),
        "p01": round(p01, 4),
        "p02": round(p02, 4),
        "p05": round(p05, 4),
        "p50": round(p50, 4),
        "p95": round(p95, 4),
        "p98": round(p98, 4),
        "p99": round(p99, 4),
        "uniqueValueCount": unique_count,
        "uniqueValues": unique_list,
        "isConstant": is_constant,
        "isBinary": is_binary,
        "isNearBinary": is_near_binary,
        "isLowDynamicRange": is_low_dynamic_range,
    }


def normalize_channel_to_uint8(
    arr: np.ndarray,
    nodata: Optional[float] = None,
    percentile_low: float = 2.0,
    percentile_high: float = 98.0,
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Deterministically normalize any numeric array (uint8, uint16, int16, float32)
    to [0, 255] uint8 for derived visualization without modifying source data.
    Excludes nodata, NaNs, and infinite values from percentile calculations.
    """
    source_dtype = str(arr.dtype)
    valid_mask = np.isfinite(arr)
    if nodata is not None:
        valid_mask = valid_mask & (arr != nodata)

    stats = compute_pixel_display_stats(arr, nodata)

    # 1. Empty or uniform constant raster
    if stats["isConstant"] or not np.any(valid_mask):
        out = np.zeros_like(arr, dtype=np.uint8)
        out[valid_mask] = 128
        return out, {
            "method": "constant_neutral",
            "normalization": "CONSTANT",
            "representation": "GRAYSCALE",
            "sourceDtype": source_dtype,
            "displayValue": 128,
            "message": "CONSTANT RASTER: All valid pixels have the same value. No meaningful contrast can be generated.",
            "nodataExcluded": True,
            "displayStats": stats,
            "min": stats["min"],
            "max": stats["max"],
        }

    # 2. Binary or Near-Binary mask
    if stats["isBinary"] or stats["isNearBinary"]:
        out = np.zeros_like(arr, dtype=np.uint8)
        u_vals = stats["uniqueValues"]
        if len(u_vals) >= 2:
            bg_val = u_vals[0]
            fg_val = u_vals[1]
        else:
            bg_val = stats["min"]
            fg_val = stats["max"]

        if stats["isBinary"] and u_vals == [0, 255]:
            out[valid_mask & (arr == 255)] = 255
        else:
            if stats["isNearBinary"]:
                mid = (bg_val + fg_val) / 2.0
                out[valid_mask & (arr >= mid)] = 255
            else:
                out[valid_mask & (arr >= fg_val)] = 255

        return out, {
            "method": "binary_stretch",
            "normalization": "BINARY",
            "representation": "BINARY_MASK",
            "sourceDtype": source_dtype,
            "nodataExcluded": True,
            "backgroundValue": bg_val,
            "foregroundValue": fg_val,
            "displayStats": stats,
            "min": stats["min"],
            "max": stats["max"],
        }

    # 3. Grayscale (Normal, Low Dynamic Range, uint16, float32)
    p_low = stats["p02"]
    p_high = stats["p98"]
    if p_high <= p_low:
        p_low = stats["min"]
        p_high = stats["max"]
    if p_high <= p_low:
        p_high = p_low + 1.0

    # uint8 with full dynamic range (min <= 15, max >= 240, broad spread) can be passed directly
    if (
        source_dtype == "uint8"
        and not stats["isLowDynamicRange"]
        and stats["min"] <= 15
        and stats["max"] >= 240
        and (p_high - p_low) > 180
    ):
        clean_uint8 = np.nan_to_num(arr, nan=0.0, posinf=255.0, neginf=0.0).astype(np.uint8)
        clean_uint8[~valid_mask] = 0
        return clean_uint8, {
            "method": "direct_uint8",
            "normalization": "DIRECT",
            "representation": "GRAYSCALE",
            "sourceDtype": source_dtype,
            "nodataExcluded": bool(nodata is not None),
            "displayStats": stats,
            "min": stats["min"],
            "max": stats["max"],
        }

    # Percentile-based robust stretch
    clean_arr = np.where(valid_mask, arr, p_low)
    scaled = (clean_arr - p_low) / (p_high - p_low)
    scaled = np.clip(scaled, 0.0, 1.0)
    scaled_uint8 = (scaled * 255.0).astype(np.uint8)
    scaled_uint8[~valid_mask] = 0

    return scaled_uint8, {
        "method": "percentile_stretch",
        "normalization": "PERCENTILE_STRETCH",
        "representation": "GRAYSCALE",
        "sourceDtype": source_dtype,
        "nodataExcluded": True,
        "pLow": p_low,
        "pHigh": p_high,
        "displayStats": stats,
        "min": stats["min"],
        "max": stats["max"],
    }


def inspect_tiff_metadata(
    file_path: str,
    source_type: Optional[str] = None,
    explicit_polarizations: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Authoritatively inspect TIFF / GeoTIFF metadata from file.
    Does NOT infer or fabricate missing metadata.
    Calculates forensic pixel display statistics without modifying original TIFF.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"TIFF file not found: {file_path}")

    stats = os.stat(file_path)
    file_size_bytes = stats.st_size
    filename = os.path.basename(file_path)
    ext = os.path.splitext(filename)[1].lower()

    width = 0
    height = 0
    count = 0
    dtypes = []
    nodata = None
    crs_str = "UNPROJECTED"
    epsg_code = None
    is_geographic = False
    transform_list = None
    resolution_list = None
    bounds_dict = None
    is_geotiff = False
    photometric = "NOT_AVAILABLE"
    compression = "NOT_AVAILABLE"
    band_descriptions = []
    color_interp = []
    display_stats = None
    tags = {}
    band_tags = []

    if HAS_RASTERIO:
        try:
            with rasterio.open(file_path) as src:
                width = int(src.width)
                height = int(src.height)
                count = int(src.count)
                dtypes = [str(d) for d in src.dtypes]
                nodata = float(src.nodata) if src.nodata is not None else None
                compression = str(src.compression.value if src.compression else "NONE")
                photometric = str(src.photometric.value if src.photometric else "NOT_AVAILABLE")
                band_descriptions = [str(d) if d else f"Band_{i+1}" for i, d in enumerate(src.descriptions)]
                color_interp = [str(ci.name) if hasattr(ci, "name") else str(ci) for ci in src.colorinterp]
                try:
                    tags = src.tags()
                except Exception:
                    tags = {}
                try:
                    band_tags = [src.tags(i + 1) for i in range(count)]
                except Exception:
                    band_tags = []

                if src.crs:
                    crs_str = src.crs.to_string()
                    epsg_code = src.crs.to_epsg()
                    is_geographic = src.crs.is_geographic

                if src.transform and src.transform != rasterio.transform.IDENTITY:
                    transform_list = list(src.transform)[:6]

                is_geotiff = bool(src.crs is not None)

                if src.res and src.res[0] > 0 and src.res[1] > 0:
                    resolution_list = [float(src.res[0]), float(src.res[1])]

                if src.bounds and (src.bounds.left != 0.0 or src.bounds.right != width):
                    bounds_dict = {
                        "left": float(src.bounds.left),
                        "bottom": float(src.bounds.bottom),
                        "right": float(src.bounds.right),
                        "top": float(src.bounds.top),
                    }

                try:
                    ch1_arr = src.read(1)
                    display_stats = compute_pixel_display_stats(ch1_arr, nodata)
                except Exception:
                    display_stats = None
        except Exception:
            pass

    # Fallback to PIL inspection if rasterio could not read or was unavailable
    if width == 0 or height == 0:
        try:
            with Image.open(file_path) as img:
                width, height = img.size
                mode = img.mode
                count = len(img.getbands()) if hasattr(img, "getbands") else 1
                dtypes = ["uint8"]
                photometric = mode
                try:
                    img_arr = np.array(img)
                    if img_arr.ndim == 3:
                        img_arr = img_arr[:, :, 0]
                    display_stats = compute_pixel_display_stats(img_arr, nodata)
                except Exception:
                    display_stats = None
        except Exception as e:
            raise InvalidTiffError(f"Corrupted or invalid TIFF container at: {file_path}") from e

    # Polarization and modality identification
    polarization_status = "NOT_ESTABLISHED"
    polarizations = []

    if count == 2:
        # 1. Explicit polarizations
        if explicit_polarizations and len(explicit_polarizations) == 2:
            p0, p1 = str(explicit_polarizations[0]).upper(), str(explicit_polarizations[1]).upper()
            if {p0, p1} == {"VV", "VH"}:
                polarization_status = "ESTABLISHED"
                polarizations = [p0, p1]

        # 2. Trusted source declaration
        if polarization_status != "ESTABLISHED" and source_type:
            st_clean = str(source_type).upper()
            if st_clean in ("SENTINEL1_DUAL_POL", "SAR_DUAL_POL", "SENTINEL1_VV_VH", "SENTINEL_1", "REAL_CDSE"):
                polarization_status = "ESTABLISHED"
                polarizations = ["VV", "VH"]

        # 3. Band descriptions from raster
        if polarization_status != "ESTABLISHED" and len(band_descriptions) >= 2:
            d0, d1 = band_descriptions[0].upper(), band_descriptions[1].upper()
            if "VV" in d0 and "VH" in d1:
                polarization_status = "ESTABLISHED"
                polarizations = ["VV", "VH"]
            elif "VH" in d0 and "VV" in d1:
                polarization_status = "ESTABLISHED"
                polarizations = ["VH", "VV"]

        # 4. Raster tags
        if polarization_status != "ESTABLISHED":
            p_tag = str(tags.get("POLARIZATION") or tags.get("polarization") or "").upper()
            if "VV" in p_tag and "VH" in p_tag:
                polarization_status = "ESTABLISHED"
                polarizations = ["VV", "VH"]
            elif len(band_tags) >= 2:
                bt0 = str(band_tags[0].get("POLARIZATION") or band_tags[0].get("DESCRIPTION") or "").upper()
                bt1 = str(band_tags[1].get("POLARIZATION") or band_tags[1].get("DESCRIPTION") or "").upper()
                if "VV" in bt0 and "VH" in bt1:
                    polarization_status = "ESTABLISHED"
                    polarizations = ["VV", "VH"]
                elif "VH" in bt0 and "VV" in bt1:
                    polarization_status = "ESTABLISHED"
                    polarizations = ["VH", "VV"]

        # 5. Check filename patterns for Sentinel-1 standard naming
        if polarization_status != "ESTABLISHED":
            fname_u = filename.upper()
            if ("_1SDV_" in fname_u) or ("_SDV_" in fname_u) or ("VV_VH" in fname_u) or ("VV+VH" in fname_u):
                polarization_status = "ESTABLISHED"
                polarizations = ["VV", "VH"]
            elif ("_1SDH_" in fname_u) or ("_SDH_" in fname_u):
                # Dual-pol HH+HV (not VV+VH)
                polarization_status = "NOT_ESTABLISHED"

    # Determine channel structure, modality, and model compatibility
    if count == 1:
        modality = "GRAYSCALE_OR_MASK"
        channel_structure = "SINGLE_CHANNEL_GRAYSCALE"
        band_structure = "GRAYSCALE_OR_MASK"
        rgb_inference_supported = False
        rejection_reason = "Single-channel grayscale TIFF. Optical RGB models require 3 channels (RGB); SAR dual-pol requires 2 channels (VV+VH). Visual preview is available."
        is_dual_channel_unsupported = False
        is_single_channel_unsupported = True
        is_inference_unsupported = True
        compatible_models = []
    elif count == 2:
        if polarization_status == "ESTABLISHED":
            modality = "SAR_DUAL_POL"
            channel_structure = "SAR_DUAL_POL"
            band_structure = "SAR_VV_VH"
            rgb_inference_supported = False
            rejection_reason = None
            is_dual_channel_unsupported = False
            is_single_channel_unsupported = False
            is_inference_unsupported = False
            compatible_models = [
                {
                    "modelId": "unet-dual-pol-sar-v09d-residual-loss",
                    "name": "Dual-Pol SAR Oil Spill Segmentation",
                    "channels": 2,
                    "bandStructure": "SAR_VV_VH",
                    "sourceTypes": ["SAR_DUAL_POL", "SENTINEL1_DUAL_POL", "SENTINEL_1", "REAL_CDSE"],
                    "containerFormats": ["TIFF", "GEOTIFF"],
                    "modality": "SAR_DUAL_POL",
                    "expectedPolarizations": polarizations,
                    "production": True,
                    "status": "COMPATIBLE",
                    "task": "OIL_SPILL_SEGMENTATION",
                }
            ]
        else:
            modality = "TWO_CHANNEL_UNCLASSIFIED"
            channel_structure = "TWO_CHANNEL_UNCLASSIFIED"
            band_structure = "TWO_CHANNEL_UNCLASSIFIED"
            rgb_inference_supported = False
            rejection_reason = "2-channel raster detected, but polarization (VV/VH) is not established. An explicit source declaration is required before SAR inference can be executed."
            is_dual_channel_unsupported = True
            is_single_channel_unsupported = False
            is_inference_unsupported = True
            compatible_models = []
    elif count == 3:
        modality = "RGB"
        channel_structure = "RGB"
        band_structure = "RGB"
        rgb_inference_supported = True
        rejection_reason = "No compatible TIFF RGB production model registered. Optical RGB production models require PNG/JPEG containers. Visual preview is available."
        is_dual_channel_unsupported = False
        is_single_channel_unsupported = False
        is_inference_unsupported = True
        compatible_models = []
    elif count == 6:
        modality = "SENTINEL_2"
        channel_structure = "SENTINEL_2_6_BAND"
        band_structure = "SENTINEL2_B4_B3_B2_B8_B11_B12"
        rgb_inference_supported = False
        rejection_reason = None
        is_dual_channel_unsupported = False
        is_single_channel_unsupported = False
        is_inference_unsupported = False
        compatible_models = [
            {
                "modelId": "mados-resnet34-rgbnir-swir-v1",
                "name": "MADOS Sentinel-2 Multi-Spectral ResNet-34 U-Net",
                "containerFormats": ["TIFF", "GEOTIFF"],
                "channels": 6,
                "bandStructure": "SENTINEL2_B4_B3_B2_B8_B11_B12",
                "sourceTypes": ["SENTINEL_2"],
                "production": True,
                "status": "COMPATIBLE",
            }
        ]
    else:
        modality = "OTHER"
        channel_structure = f"MULTISPECTRAL_{count}_CHANNEL"
        band_structure = "OTHER"
        rgb_inference_supported = False
        rejection_reason = f"This TIFF contains {count} channels. Supported configurations: 2-channel SAR (VV+VH) or 6-band Sentinel-2."
        is_dual_channel_unsupported = False
        is_single_channel_unsupported = False
        is_inference_unsupported = True
        compatible_models = []

    geolocation_status = "ESTABLISHED" if (is_geotiff and crs_str not in ("UNPROJECTED", "NOT_AVAILABLE")) else "NOT_ESTABLISHED"

    filename_lower = filename.lower()
    is_filename_seg = any(k in filename_lower for k in ["_segmentation", "_mask", "_label", "segmentation", "groundtruth", "gt_"])
    is_binary = bool(display_stats and display_stats.get("isBinary"))
    is_seg_like = bool(is_binary or is_filename_seg)

    preview_summary = {
        "format": "PNG",
        "purpose": "VISUALIZATION_ONLY",
        "representation": "BINARY_MASK" if is_seg_like and count == 1 else "GRAYSCALE" if count == 1 else "RGB" if count == 3 else "SENTINEL2_TRUE_COLOR" if count == 6 else ("SAR_VV_VH" if count == 2 and polarization_status == "ESTABLISHED" else "CHANNEL_1_AND_CHANNEL_2" if count == 2 else "MULTISPECTRAL"),
        "normalization": "BINARY" if is_binary else "PERCENTILE_STRETCH" if count == 1 else "DIRECT",
        "source": "ORIGINAL_TIFF",
        "isSegmentationLike": is_seg_like,
        "rasterTypeHint": "SEGMENTATION / MASK-LIKE RASTER" if is_seg_like else ("SENTINEL-1 DUAL-POL SAR RASTER (VV+VH)" if count == 2 and polarization_status == "ESTABLISHED" else "2-CHANNEL UNCLASSIFIED RASTER" if count == 2 else "OPTICAL RGB RASTER" if count == 3 else "MULTISPECTRAL SENTINEL-2 RASTER" if count == 6 else "CONTINUOUS GRAYSCALE RASTER"),
    }

    return {
        "filename": filename,
        "format": "TIFF",
        "driver": "GTiff" if is_geotiff else "TIFF",
        "extension": ext,
        "mimeType": "image/tiff",
        "fileSizeBytes": file_size_bytes,
        "width": width,
        "height": height,
        "channels": count,
        "samplesPerPixel": count,
        "dtypes": dtypes,
        "dtype": dtypes[0] if dtypes else "uint8",
        "primaryDtype": dtypes[0] if dtypes else "uint8",
        "bitDepth": 16 if any("16" in d for d in dtypes) else (32 if any("32" in d for d in dtypes) else 8),
        "compression": compression,
        "photometric": photometric,
        "bandDescriptions": band_descriptions,
        "colorInterpretation": color_interp,
        "nodata": nodata,
        "crs": crs_str,
        "epsg": epsg_code,
        "isGeographic": is_geographic,
        "transform": transform_list,
        "resolution": resolution_list,
        "bounds": bounds_dict,
        "isGeotiff": is_geotiff,
        "isGeoTiff": is_geotiff,
        "is_geotiff": is_geotiff,
        "inputFormat": "GEOTIFF_RASTER" if is_geotiff else "TIFF_RASTER",
        "channelCount": count,
        "bandStructure": band_structure,
        "modality": modality,
        "polarizationStatus": polarization_status,
        "polarizations": polarizations,
        "compatibleModels": compatible_models,
        "isDualChannelUnsupported": is_dual_channel_unsupported,
        "isSingleChannelUnsupported": is_single_channel_unsupported,
        "isInferenceUnsupported": is_inference_unsupported,
        "geolocationStatus": geolocation_status,
        "channelStructure": channel_structure,
        "rgbInferenceSupported": rgb_inference_supported,
        "sentinel2Supported": count == 6,
        "rejectionReason": rejection_reason,
        "displayStats": display_stats or {},
        "preview": preview_summary,
    }


def generate_tiff_visual_preview(
    file_path: str,
    output_dir: str,
    prefix: str = "tiff",
    max_dimension: int = 1024,
    source_type: Optional[str] = None,
    explicit_polarizations: Optional[List[str]] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Generate derived visual PNG preview artifacts from source TIFF without modifying original TIFF.
    
    Generates:
      - 3-channel: Full RGB PNG preview
      - 6-band Sentinel-2: True-color RGB visualization preview (B4=R, B3=G, B2=B)
      - 2-channel: Channel 1 Grayscale preview + Channel 2 Grayscale preview
      - 1-channel: Binary mask stretch or percentile-contrast grayscale PNG preview
    """
    os.makedirs(output_dir, exist_ok=True)
    meta = inspect_tiff_metadata(
        file_path=file_path,
        source_type=source_type,
        explicit_polarizations=explicit_polarizations,
    )
    count = meta["channels"]
    width = meta["width"]
    height = meta["height"]
    nodata = meta["nodata"]

    preview_artifacts = {}
    normalization_meta = {}
    display_stats = meta.get("displayStats", {})

    filename_lower = os.path.basename(file_path).lower()
    is_filename_seg = any(k in filename_lower for k in ["_segmentation", "_mask", "_label", "segmentation", "groundtruth", "gt_"])

    representation = "GRAYSCALE"
    normalization = "PERCENTILE_STRETCH"
    is_seg_like = False
    raster_type_hint = "CONTINUOUS GRAYSCALE RASTER"

    if HAS_RASTERIO:
        with rasterio.open(file_path) as src:
            if count == 3:
                # 3-channel RGB TIFF
                b1 = src.read(1)
                b2 = src.read(2)
                b3 = src.read(3)

                u1, n1 = normalize_channel_to_uint8(b1, nodata)
                u2, n2 = normalize_channel_to_uint8(b2, nodata)
                u3, n3 = normalize_channel_to_uint8(b3, nodata)

                rgb_arr = np.dstack((u1, u2, u3))
                pil_img = Image.fromarray(rgb_arr, mode="RGB")

                # Preserve exact aspect ratio when resizing for web preview
                if max(width, height) > max_dimension:
                    scale = max_dimension / max(width, height)
                    new_w = max(1, int(width * scale))
                    new_h = max(1, int(height * scale))
                    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)

                preview_path = os.path.join(output_dir, f"{prefix}_preview.png")
                pil_img.save(preview_path, format="PNG", optimize=True)

                preview_artifacts["preview"] = preview_path
                preview_artifacts["rgb_preview"] = preview_path
                representation = "RGB"
                normalization = "DIRECT"
                is_seg_like = False
                raster_type_hint = "OPTICAL RGB RASTER"
                display_stats = n1.get("displayStats", {})
                normalization_meta = {
                    "method": "channel_wise_normalization",
                    "channels": ["Band 1 (Red)", "Band 2 (Green)", "Band 3 (Blue)"],
                    "nodataExcluded": True,
                    "displayStats": display_stats,
                }

            elif count == 6:
                # 6-band Sentinel-2 TIFF (B4, B3, B2, B8, B11, B12)
                # Visual preview rendered as True-Color RGB: B4 (Red), B3 (Green), B2 (Blue)
                b4 = src.read(1) # Red
                b3 = src.read(2) # Green
                b2 = src.read(3) # Blue

                u4, n4 = normalize_channel_to_uint8(b4, nodata)
                u3, _ = normalize_channel_to_uint8(b3, nodata)
                u2, _ = normalize_channel_to_uint8(b2, nodata)

                rgb_arr = np.dstack((u4, u3, u2))
                pil_img = Image.fromarray(rgb_arr, mode="RGB")

                if max(width, height) > max_dimension:
                    scale = max_dimension / max(width, height)
                    new_w = max(1, int(width * scale))
                    new_h = max(1, int(height * scale))
                    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)

                preview_path = os.path.join(output_dir, f"{prefix}_preview.png")
                pil_img.save(preview_path, format="PNG", optimize=True)

                preview_artifacts["preview"] = preview_path
                preview_artifacts["sentinel2_rgb_preview"] = preview_path
                representation = "SENTINEL2_TRUE_COLOR"
                normalization = "SENTINEL2_TRUE_COLOR_RGB"
                is_seg_like = False
                raster_type_hint = "MULTISPECTRAL SENTINEL-2 RASTER"
                display_stats = n4.get("displayStats", {})
                normalization_meta = {
                    "method": "sentinel2_true_color_rgb",
                    "bandsVisualized": ["B4 (Red)", "B3 (Green)", "B2 (Blue)"],
                    "bandsRetainedForInference": ["B4", "B3", "B2", "B8", "B11", "B12"],
                    "nodataExcluded": True,
                    "displayStats": display_stats,
                }

            elif count == 2:
                # 2-channel TIFF: Render Channel 1 and Channel 2 Grayscale Previews separately
                ch1 = src.read(1)
                ch2 = src.read(2)

                u1, n1 = normalize_channel_to_uint8(ch1, nodata)
                u2, n2 = normalize_channel_to_uint8(ch2, nodata)

                pil_ch1 = Image.fromarray(u1, mode="L")
                pil_ch2 = Image.fromarray(u2, mode="L")

                if max(width, height) > max_dimension:
                    scale = max_dimension / max(width, height)
                    new_w = max(1, int(width * scale))
                    new_h = max(1, int(height * scale))
                    pil_ch1 = pil_ch1.resize((new_w, new_h), Image.Resampling.BILINEAR)
                    pil_ch2 = pil_ch2.resize((new_w, new_h), Image.Resampling.BILINEAR)

                ch1_path = os.path.join(output_dir, f"{prefix}_channel1_preview.png")
                ch2_path = os.path.join(output_dir, f"{prefix}_channel2_preview.png")
                pil_ch1.save(ch1_path, format="PNG", optimize=True)
                pil_ch2.save(ch2_path, format="PNG", optimize=True)

                # Composite dual-channel side-by-side for master preview
                composite_w = pil_ch1.width + pil_ch2.width + 10
                composite_h = pil_ch1.height
                composite_img = Image.new("RGB", (composite_w, composite_h), color=(20, 20, 24))
                composite_img.paste(pil_ch1.convert("RGB"), (0, 0))
                composite_img.paste(pil_ch2.convert("RGB"), (pil_ch1.width + 10, 0))
                
                preview_path = os.path.join(output_dir, f"{prefix}_preview.png")
                composite_img.save(preview_path, format="PNG", optimize=True)

                preview_artifacts["preview"] = preview_path
                preview_artifacts["channel1_preview"] = ch1_path
                preview_artifacts["channel2_preview"] = ch2_path
                representation = "CHANNEL_1_AND_CHANNEL_2"
                normalization = "DUAL_CHANNEL_INDEPENDENT_GRAYSCALE"
                is_seg_like = False
                raster_type_hint = "DUAL CHANNEL RASTER"
                display_stats = n1.get("displayStats", {})
                normalization_meta = {
                    "method": "dual_channel_independent_grayscale",
                    "channels": ["Channel 1 (Grayscale)", "Channel 2 (Grayscale)"],
                    "note": "2-channel input. Not RGB. Visual preview only.",
                    "displayStats": display_stats,
                }

            else:
                # 1-channel grayscale or binary mask
                ch1 = src.read(1)
                u1, n1 = normalize_channel_to_uint8(ch1, nodata)
                display_stats = n1.get("displayStats", {})

                if n1["representation"] == "BINARY_MASK" or (is_filename_seg and display_stats.get("uniqueValueCount", 10) <= 4):
                    representation = "BINARY_MASK"
                    normalization = "BINARY" if n1["normalization"] in ["BINARY", "CONSTANT"] else n1["normalization"]
                    is_seg_like = True
                    raster_type_hint = "SEGMENTATION / MASK-LIKE RASTER"
                else:
                    representation = n1["representation"]
                    normalization = n1["normalization"]
                    is_seg_like = is_filename_seg
                    raster_type_hint = "SEGMENTATION / MASK-LIKE RASTER" if is_seg_like else "CONTINUOUS GRAYSCALE RASTER"

                pil_ch1 = Image.fromarray(u1, mode="L")

                if max(width, height) > max_dimension:
                    scale = max_dimension / max(width, height)
                    new_w = max(1, int(width * scale))
                    new_h = max(1, int(height * scale))
                    pil_ch1 = pil_ch1.resize((new_w, new_h), Image.Resampling.BILINEAR)

                preview_path = os.path.join(output_dir, f"{prefix}_preview.png")
                pil_ch1.save(preview_path, format="PNG", optimize=True)

                preview_artifacts["preview"] = preview_path
                preview_artifacts["grayscale_preview"] = preview_path
                normalization_meta = {
                    "method": n1.get("method", "single_channel_grayscale"),
                    "normalization": normalization,
                    "representation": representation,
                    "nodataExcluded": True,
                    "displayStats": display_stats,
                }
    else:
        # PIL fallback
        with Image.open(file_path) as img:
            rgb_img = img.convert("RGB")
            if max(width, height) > max_dimension:
                scale = max_dimension / max(width, height)
                new_w = max(1, int(width * scale))
                new_h = max(1, int(height * scale))
                rgb_img = rgb_img.resize((new_w, new_h), Image.Resampling.BILINEAR)
            preview_path = os.path.join(output_dir, f"{prefix}_preview.png")
            rgb_img.save(preview_path, format="PNG", optimize=True)
            preview_artifacts["preview"] = preview_path

    preview_dict = {
        "format": "PNG",
        "purpose": "VISUALIZATION_ONLY",
        "representation": representation,
        "normalization": normalization,
        "source": "ORIGINAL_TIFF",
        "isSegmentationLike": is_seg_like,
        "rasterTypeHint": raster_type_hint,
    }

    meta["displayStats"] = display_stats
    meta["preview"] = preview_dict

    return {
        "metadata": meta,
        "previewGenerated": True,
        "previewFormat": "PNG",
        "previewPath": preview_artifacts.get("preview"),
        "preview_path": preview_artifacts.get("preview"),
        "channel1PreviewPath": preview_artifacts.get("channel1_preview"),
        "channel2PreviewPath": preview_artifacts.get("channel2_preview"),
        "previewSource": "ORIGINAL_TIFF",
        "previewPurpose": "VISUALIZATION_ONLY",
        "inferenceSource": "ORIGINAL_TIFF",
        "artifacts": preview_artifacts,
        "previewComposition": "B4_B3_B2_TRUE_COLOR" if count == 6 else "RGB" if count == 3 else "DUAL_CHANNEL_COMPOSITE" if count == 2 else representation,
        "previewNormalization": normalization_meta,
        "preview": preview_dict,
        "displayStats": display_stats,
    }

