"""
Dedicated Dual-Polarization SAR Semantic Segmentation Inference Engine (Phase 16).
Production implementation for unet-dual-pol-sar-v09d-residual-loss.
Authoritative, fail-closed, and compliant with OG-SAR-ML-RESEARCH-RELEASE-V0.12.
"""

import os
import time
import math
import hashlib
from typing import Dict, Any, List, Optional, Tuple, Union
import numpy as np
import cv2
import torch
from PIL import Image

try:
    import rasterio
    import rasterio.features
    from rasterio.crs import CRS
    from rasterio.transform import Affine
    import shapely.geometry
    from shapely.geometry import shape, Polygon, MultiPolygon, Point
    from shapely.ops import unary_union, transform as shapely_transform
    import pyproj
    from pyproj import Transformer
    HAS_GEOSPATIAL = True
except ImportError:
    HAS_GEOSPATIAL = False

from app.models.registry import model_registry, ModelVerificationError, ModelNotFoundError
from app.preprocessing.normalization import normalize_sar_band, SENTINEL1_PREPROCESSING_CONTRACT_V1
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.georeferencing import calculate_projected_area_km2
from app.core.config import settings


class SARDualPolInputError(Exception):
    """Raised when an input raster fails SAR dual-pol channel count, shape, or format validation."""
    pass


class SARDualPolModelMismatchError(Exception):
    """Raised when an incompatible model is requested for dual-pol SAR raster."""
    pass


def inspect_and_read_sar_raster(
    image_path: str,
    explicit_polarizations: Optional[List[str]] = None,
    trusted_source: Optional[str] = None
) -> Dict[str, Any]:
    """
    Forensically inspect container and read the 2 channels (VV, VH) of a SAR raster.
    Strictly differentiates between established VV+VH vs unclassified 2-channel rasters.
    """
    if not os.path.exists(image_path):
        raise SARDualPolInputError(f"SAR image file not found on disk: '{image_path}'")

    file_size = os.path.getsize(image_path)
    if file_size == 0:
        raise SARDualPolInputError(f"SAR image file is empty: '{image_path}'")

    hasher = hashlib.sha256()
    with open(image_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    sha256 = hasher.hexdigest()

    width = 0
    height = 0
    count = 0
    dtype_str = "float32"
    crs_str = None
    epsg_code = None
    transform = None
    bounds = None
    raw_array = None
    band_descriptions = []
    tags = {}
    band_tags = []

    if HAS_GEOSPATIAL:
        try:
            with rasterio.open(image_path) as src:
                width = int(src.width)
                height = int(src.height)
                count = int(src.count)
                dtype_str = str(src.dtypes[0])
                band_descriptions = [str(d) if d else f"Band_{i+1}" for i, d in enumerate(src.descriptions)]
                tags = src.tags()
                band_tags = [src.tags(i + 1) for i in range(count)]

                if src.crs:
                    crs_str = src.crs.to_string()
                    epsg_code = src.crs.to_epsg()

                if src.transform and src.transform != rasterio.transform.IDENTITY:
                    transform = src.transform

                if src.bounds and (src.bounds.left != 0.0 or src.bounds.right != width):
                    bounds = {
                        "left": float(src.bounds.left),
                        "bottom": float(src.bounds.bottom),
                        "right": float(src.bounds.right),
                        "top": float(src.bounds.top),
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
                    count = 1
                elif arr.ndim == 3:
                    raw_array = np.transpose(arr, (2, 0, 1))
                    count = int(raw_array.shape[0])
                dtype_str = str(arr.dtype)
        except Exception as e:
            raise SARDualPolInputError(f"Failed to read image container: {str(e)}")

    if count != 2:
        raise SARDualPolInputError(
            f"Dual-pol SAR model requires exactly 2 input channels (VV + VH), but image contains {count} channels."
        )

    if width < 64 or height < 64:
        raise SARDualPolInputError(f"SAR image dimensions too small ({width}x{height}); minimum supported is 64x64.")

    # Polarization detection — Inspect tags, descriptions, explicit arguments, or trusted source
    polarization_status = "NOT_ESTABLISHED"
    polarizations = []
    vv_index = 0
    vh_index = 1

    # 1. Check explicit parameter
    if explicit_polarizations and len(explicit_polarizations) == 2:
        p0 = explicit_polarizations[0].upper()
        p1 = explicit_polarizations[1].upper()
        if {p0, p1} == {"VV", "VH"}:
            polarization_status = "ESTABLISHED"
            polarizations = [p0, p1]
            vv_index = 0 if p0 == "VV" else 1
            vh_index = 1 if p1 == "VH" else 0

    # 2. Check trusted source declaration
    if polarization_status != "ESTABLISHED" and trusted_source:
        ts_clean = trusted_source.upper()
        if ts_clean in ("SENTINEL1_DUAL_POL", "SAR_DUAL_POL", "SENTINEL1_VV_VH", "SENTINEL_1", "REAL_CDSE"):
            polarization_status = "ESTABLISHED"
            polarizations = ["VV", "VH"]
            vv_index = 0
            vh_index = 1

    # 3. Check band descriptions from raster
    if polarization_status != "ESTABLISHED" and band_descriptions:
        d0 = band_descriptions[0].upper()
        d1 = band_descriptions[1].upper()
        if "VV" in d0 and "VH" in d1:
            polarization_status = "ESTABLISHED"
            polarizations = ["VV", "VH"]
            vv_index = 0
            vh_index = 1
        elif "VH" in d0 and "VV" in d1:
            polarization_status = "ESTABLISHED"
            polarizations = ["VH", "VV"]
            vv_index = 1
            vh_index = 0

    # 4. Check tags from rasterio metadata
    if polarization_status != "ESTABLISHED":
        p_tag = tags.get("POLARIZATION") or tags.get("polarization")
        if p_tag:
            pt_clean = str(p_tag).upper()
            if "VV" in pt_clean and "VH" in pt_clean:
                polarization_status = "ESTABLISHED"
                polarizations = ["VV", "VH"]

        for idx, b_tag in enumerate(band_tags):
            b_pol = b_tag.get("POLARIZATION") or b_tag.get("polarization") or b_tag.get("DESCRIPTION") or ""
            bp_clean = str(b_pol).upper()
            if "VV" in bp_clean:
                vv_index = idx
            elif "VH" in bp_clean:
                vh_index = idx

        if vv_index != vh_index and polarization_status == "ESTABLISHED":
            polarizations = ["VV", "VH"] if vv_index == 0 else ["VH", "VV"]

    # 5. Check filename patterns for Sentinel-1 standard naming convention (e.g. S1A_..._1SDV_...)
    if polarization_status != "ESTABLISHED":
        fname = os.path.basename(image_path).upper()
        if ("_1SDV_" in fname) or ("_SDV_" in fname) or ("VV_VH" in fname) or ("VV+VH" in fname):
            polarization_status = "ESTABLISHED"
            polarizations = ["VV", "VH"]
            vv_index = 0
            vh_index = 1
        elif ("_1SDH_" in fname) or ("_SDH_" in fname):
            # Dual-pol HH+HV (not VV+VH)
            polarization_status = "NOT_ESTABLISHED"

    is_georeferenced = bool(crs_str and transform and bounds)

    return {
        "image_path": image_path,
        "sha256": sha256,
        "width": width,
        "height": height,
        "count": count,
        "dtype": dtype_str,
        "crs": crs_str,
        "epsg": epsg_code,
        "transform": transform,
        "bounds": bounds,
        "is_georeferenced": is_georeferenced,
        "raw_array": raw_array,
        "polarization_status": polarization_status,
        "polarizations": polarizations,
        "vv_index": vv_index,
        "vh_index": vh_index,
    }


def compute_geographic_footprint(
    bounds: Dict[str, float],
    src_crs_str: str
) -> Optional[Dict[str, Any]]:
    """
    Compute WGS84 GeoJSON Polygon for the scene bounding footprint.
    """
    if not bounds or not src_crs_str or not HAS_GEOSPATIAL:
        return None

    try:
        src_crs = CRS.from_user_input(src_crs_str)
        wgs84_crs = CRS.from_epsg(4326)

        left = bounds["left"]
        bottom = bounds["bottom"]
        right = bounds["right"]
        top = bounds["top"]

        poly_src = Polygon([
            (left, bottom),
            (right, bottom),
            (right, top),
            (left, top),
            (left, bottom),
        ])

        if not src_crs.is_geographic:
            transformer = Transformer.from_crs(src_crs, wgs84_crs, always_xy=True)
            poly_wgs84 = shapely_transform(transformer.transform, poly_src)
        else:
            poly_wgs84 = poly_src

        geojson_geom = shapely.geometry.mapping(poly_wgs84)
        b = poly_wgs84.bounds  # (minx, miny, maxx, maxy) -> (west, south, east, north)

        return {
            "type": "Feature",
            "properties": {
                "featureType": "IMAGE_FOOTPRINT",
                "label": "IMAGE FOOTPRINT",
                "sensor": "Sentinel-1 SAR",
                "north": round(float(b[3]), 6),
                "south": round(float(b[1]), 6),
                "east": round(float(b[2]), 6),
                "west": round(float(b[0]), 6),
            },
            "geometry": geojson_geom,
        }
    except Exception:
        return None


def execute_sar_dual_pol_inference(
    image_path: str,
    threshold: float = 0.50,
    output_dir: Optional[str] = None,
    prefix: str = "sar_dual_pol",
    explicit_polarizations: Optional[List[str]] = None,
    trusted_source: Optional[str] = None,
    source_type: Optional[str] = None,
    checkpoint_path: Optional[str] = None,
    requested_model_id: Optional[str] = None,
    device: str = "cpu"
) -> Dict[str, Any]:
    """
    Execute full-scene Dual-Polarization SAR semantic segmentation using frozen production model
    unet-dual-pol-sar-v09d-residual-loss.
    """
    t0 = time.perf_counter()
    effective_source = trusted_source or source_type

    # 1. Authoritative Model Loading & Cryptographic Verification
    model, model_meta = model_registry.load_verified_model(
        model_id="unet-dual-pol-sar-v09d-residual-loss",
        device=device
    )

    # 2. Inspect container and validate VV/VH polarizations
    parsed = inspect_and_read_sar_raster(
        image_path=image_path,
        explicit_polarizations=explicit_polarizations,
        trusted_source=effective_source
    )

    if parsed["polarization_status"] != "ESTABLISHED":
        raise SARDualPolInputError(
            "POLARIZATION_NOT_ESTABLISHED: The uploaded 2-channel raster has not established VV and VH polarizations. "
            "The dual-polarization SAR model requires calibrated VV and VH backscatter. Please provide an explicit source declaration."
        )

    raw_array = parsed["raw_array"]
    width = parsed["width"]
    height = parsed["height"]
    vv_idx = parsed["vv_index"]
    vh_idx = parsed["vh_index"]

    raw_vv = raw_array[vv_idx]
    raw_vh = raw_array[vh_idx]

    # 3. Apply verified sentinel1_sigma0_db_v1 Radiometric Preprocessing
    norm_vv = normalize_sar_band(raw_vv, polarization="VV")
    norm_vh = normalize_sar_band(raw_vh, polarization="VH")
    raster_tensor = np.stack([norm_vv, norm_vh], axis=0).astype(np.float32)

    # 4. Sliding Window Hann-Blended Tiled Inference
    tile_size = settings.TILE_SIZE  # 512
    stride = settings.STRIDE        # 448
    tiles, tile_coords = generate_tiles(
        raster_array=raster_tensor,
        tile_size=tile_size,
        stride=stride
    )

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

    full_prob_map = reconstruct_full_mask(
        tile_predictions=tile_predictions,
        tile_coords=tile_coords,
        full_height=height,
        full_width=width,
        tile_size=tile_size
    )

    # 5. Thresholding & Binary Segmentation
    binary_mask = (full_prob_map >= threshold).astype(np.uint8)
    positive_pixels = int(np.sum(binary_mask > 0))
    total_pixels = width * height
    coverage_pct = round((positive_pixels / max(total_pixels, 1)) * 100.0, 4)

    # 6. Connected Component Extraction via OpenCV
    num_labels, labels_im, stats, centroids_cv = cv2.connectedComponentsWithStats(binary_mask, connectivity=8)
    components = []
    largest_comp_area_px = 0
    largest_comp_idx = None

    for label_id in range(1, num_labels):
        comp_area = int(stats[label_id, cv2.CC_STAT_AREA])
        if comp_area < 5:
            continue
        if comp_area > largest_comp_area_px:
            largest_comp_area_px = comp_area
            largest_comp_idx = label_id

        comp_mask = (labels_im == label_id)
        mean_p = float(np.mean(full_prob_map[comp_mask]))
        max_p = float(np.max(full_prob_map[comp_mask]))
        x = int(stats[label_id, cv2.CC_STAT_LEFT])
        y = int(stats[label_id, cv2.CC_STAT_TOP])
        w = int(stats[label_id, cv2.CC_STAT_WIDTH])
        h = int(stats[label_id, cv2.CC_STAT_HEIGHT])
        cx, cy = centroids_cv[label_id]

        components.append({
            "component_id": int(label_id),
            "area_pixels": comp_area,
            "area_percentage": round((comp_area / max(total_pixels, 1)) * 100.0, 4),
            "mean_probability": round(mean_p, 4),
            "max_probability": round(max_p, 4),
            "bbox": [y, x, y + h, x + w],
            "pixel_centroid": [round(float(cy), 2), round(float(cx), 2)],
        })

    # Sort components descending by area
    components.sort(key=lambda c: c["area_pixels"], reverse=True)

    # 7. Geospatial Reprojection & GeoJSON Feature Collection
    features = []
    geo_centroid = None
    total_area_km2 = None
    total_area_m2 = None
    largest_comp_m2 = None

    is_georeferenced = parsed["is_georeferenced"]
    if is_georeferenced and HAS_GEOSPATIAL and positive_pixels > 0:
        try:
            src_crs = CRS.from_user_input(parsed["crs"])
            wgs84_crs = CRS.from_epsg(4326)
            transformer = Transformer.from_crs(src_crs, wgs84_crs, always_xy=True) if not src_crs.is_geographic else None

            # Vectorize binary mask to polygon shapes using rasterio
            shapes_gen = rasterio.features.shapes(
                binary_mask,
                mask=(binary_mask > 0),
                transform=parsed["transform"]
            )

            polygons_wgs84 = []
            for geom_dict, val in shapes_gen:
                if val == 1:
                    shp = shape(geom_dict)
                    if shp.is_empty:
                        continue
                    if transformer:
                        shp_wgs84 = shapely_transform(transformer.transform, shp)
                    else:
                        shp_wgs84 = shp
                    polygons_wgs84.append(shp_wgs84)

            if polygons_wgs84:
                merged_slick = unary_union(polygons_wgs84)
                # Compute projected equal-area metric dimensions
                total_area_km2 = calculate_projected_area_km2(merged_slick)
                total_area_m2 = round(total_area_km2 * 1_000_000.0, 2)

                c = merged_slick.centroid
                geo_centroid = {
                    "latitude": round(float(c.y), 6),
                    "longitude": round(float(c.x), 6),
                }

                # Single unified or multi-polygon slick feature
                features.append({
                    "type": "Feature",
                    "properties": {
                        "featureType": "OIL_SPILL_POLYGON",
                        "label": "OIL SPILL",
                        "areaKm2": total_area_km2,
                        "areaM2": total_area_m2,
                        "confidence": round(float(np.mean(full_prob_map[binary_mask > 0])), 4),
                        "centroid": [geo_centroid["latitude"], geo_centroid["longitude"]],
                    },
                    "geometry": shapely.geometry.mapping(merged_slick),
                })

                # Point feature for centroid
                features.append({
                    "type": "Feature",
                    "properties": {
                        "featureType": "SPILL_CENTROID",
                        "label": "SPILL CENTROID",
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [geo_centroid["longitude"], geo_centroid["latitude"]],
                    },
                })

                if largest_comp_idx is not None and total_area_m2:
                    largest_comp_m2 = round(total_area_m2 * (largest_comp_area_px / max(positive_pixels, 1)), 2)
        except Exception:
            is_georeferenced = False

    # Image footprint
    image_footprint_feature = None
    if parsed["is_georeferenced"]:
        image_footprint_feature = compute_geographic_footprint(
            bounds=parsed["bounds"],
            src_crs_str=parsed["crs"]
        )
        if image_footprint_feature:
            features.insert(0, image_footprint_feature)

    geo_json = {
        "type": "FeatureCollection",
        "features": features,
    } if features else None

    # 8. Visual Artifact Generation
    if not output_dir:
        output_dir = os.path.dirname(image_path)
    os.makedirs(output_dir, exist_ok=True)

    job_pfx = f"{prefix}_{parsed['sha256'][:10]}"

    # A. Original representation
    norm_vv_disp = (np.clip(norm_vv, 0.0, 1.0) * 255).astype(np.uint8)
    norm_vh_disp = (np.clip(norm_vh, 0.0, 1.0) * 255).astype(np.uint8)

    orig_path = os.path.join(output_dir, f"{job_pfx}_original.png")
    Image.fromarray(norm_vv_disp, mode="L").convert("RGB").save(orig_path, format="PNG")

    # B. VV Channel preview
    vv_path = os.path.join(output_dir, f"{job_pfx}_vv.png")
    Image.fromarray(norm_vv_disp, mode="L").save(vv_path, format="PNG")

    # C. VH Channel preview
    vh_path = os.path.join(output_dir, f"{job_pfx}_vh.png")
    Image.fromarray(norm_vh_disp, mode="L").save(vh_path, format="PNG")

    # D. Binary mask
    mask_rgba = np.zeros((height, width, 4), dtype=np.uint8)
    mask_rgba[binary_mask > 0] = [0, 229, 255, 230]  # Cyan-teal
    mask_path = os.path.join(output_dir, f"{job_pfx}_mask.png")
    Image.fromarray(mask_rgba, mode="RGBA").save(mask_path, format="PNG")

    # E. Final Overlay
    base_img = Image.fromarray(norm_vv_disp, mode="L").convert("RGBA")
    mask_img = Image.fromarray(mask_rgba, mode="RGBA")
    base_img.paste(mask_img, (0, 0), mask_img)
    overlay_path = os.path.join(output_dir, f"{job_pfx}_overlay.png")
    base_img.convert("RGB").save(overlay_path, format="PNG")

    # F. Probability Heatmap
    prob_rgba = np.zeros((height, width, 4), dtype=np.uint8)
    norm_p = np.clip(full_prob_map, 0.0, 1.0)
    prob_rgba[:, :, 0] = (norm_p * 255).astype(np.uint8)
    prob_rgba[:, :, 1] = ((1.0 - np.abs(norm_p - 0.5) * 2.0) * 180).astype(np.uint8)
    prob_rgba[:, :, 2] = ((1.0 - norm_p) * 255).astype(np.uint8)
    prob_rgba[:, :, 3] = 255
    prob_path = os.path.join(output_dir, f"{job_pfx}_probability.png")
    Image.fromarray(prob_rgba, mode="RGBA").save(prob_path, format="PNG")

    artifacts = {
        "original": orig_path,
        "vv": vv_path,
        "vh": vh_path,
        "mask": mask_path,
        "overlay": overlay_path,
        "probabilityMap": prob_path,
    }

    t_total_ms = round((time.perf_counter() - t0) * 1000, 2)
    detection_status = "DETECTED" if positive_pixels >= 10 else "NOT_DETECTED"
    confidence_val = round(float(np.mean(full_prob_map[binary_mask > 0])), 4) if positive_pixels > 0 else 0.0

    return {
        "modelId": "unet-dual-pol-sar-v09d-residual-loss",
        "modality": "SAR_DUAL_POL",
        "inputChannels": 2,
        "polarizations": parsed["polarizations"],
        "polarizationStatus": parsed["polarization_status"],
        "inferenceStatus": "SUCCESS",
        "detectionStatus": detection_status,
        "confidence": confidence_val,
        "oilType": "NOT_ESTABLISHED",
        "oilSpillCoveragePercent": coverage_pct,
        "positivePixels": positive_pixels,
        "totalPixels": total_pixels,
        "estimatedAreaM2": total_area_m2,
        "estimatedAreaKm2": total_area_km2,
        "connectedComponents": len(components),
        "components": components,
        "largestComponent": {
            "areaPixels": largest_comp_area_px,
            "estimatedAreaM2": largest_comp_m2,
        } if largest_comp_idx else None,
        "geometry": geo_json,
        "centroid": geo_centroid,
        "imageFootprint": image_footprint_feature,
        "footprint": image_footprint_feature["geometry"] if image_footprint_feature else None,
        "geospatialStatus": "ESTABLISHED" if is_georeferenced else "NOT_ESTABLISHED",
        "geospatial": {
            "crs": parsed["crs"],
            "bounds": parsed["bounds"],
            "isGeoreferenced": is_georeferenced,
            "geolocationStatus": "ESTABLISHED" if is_georeferenced else "NOT_ESTABLISHED",
            "physicalAreaKm2": total_area_km2,
            "physicalAreaM2": total_area_m2,
            "rasterCentroid": geo_centroid,
        } if is_georeferenced else None,
        "crs": parsed["crs"],
        "bounds": parsed["bounds"],
        "artifacts": artifacts,
        "preprocessing": "sentinel1_sigma0_db_v1",
        "operatingThreshold": threshold,
        "timingMs": t_total_ms,
        "scientificStatus": "MODEL_DERIVED",
    }


# Convenient alias for test suite and external modules
run_sar_dual_pol_inference = execute_sar_dual_pol_inference

