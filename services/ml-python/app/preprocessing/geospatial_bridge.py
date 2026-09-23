"""
Geospatial Bridge & GeoJSON Polygonization Module (Phase 15).
Transforms segmented pixel masks to real geographic coordinates using GeoTIFF affine
transforms and CRS projections, calculates physical spill surface area in m² and km²,
and constructs auditable GeoJSON feature collections with MODEL_DERIVED metadata.
"""

import os
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import scipy.ndimage
from shapely.geometry import Polygon, MultiPolygon, mapping, shape
from shapely.ops import transform as shapely_transform

try:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import Affine
    import pyproj
    HAS_GEOSPATIAL = True
except ImportError:
    HAS_GEOSPATIAL = False


def pixel_to_geo(
    col: float,
    row: float,
    affine_transform: List[float],
) -> Tuple[float, float]:
    """
    Apply 2D affine geotransform to pixel coordinate (col/x, row/y).
    transform is [a, b, c, d, e, f] where:
      x_geo = c + col * a + row * b
      y_geo = f + col * d + row * e
    """
    a, b, c, d, e, f = affine_transform[:6]
    x_geo = c + col * a + row * b
    y_geo = f + col * d + row * e
    return (x_geo, y_geo)


def transform_geometry_to_wgs84(
    geom_dict: Dict[str, Any],
    src_crs_str: str,
) -> Tuple[Dict[str, Any], List[float]]:
    """
    Reproject GeoJSON geometry dictionary from source CRS to EPSG:4326 (WGS84 lat/lng).
    Returns (reprojected_geom_dict, centroid_lat_lng).
    """
    if not HAS_GEOSPATIAL or not src_crs_str or src_crs_str == "NOT_AVAILABLE":
        return geom_dict, [0.0, 0.0]

    try:
        src_crs = CRS.from_user_input(src_crs_str)
        dst_crs = CRS.from_epsg(4326)

        if src_crs == dst_crs or src_crs.is_geographic:
            poly = shape(geom_dict)
            c = poly.centroid
            return geom_dict, [round(c.y, 6), round(c.x, 6)]

        project = pyproj.Transformer.from_crs(src_crs, dst_crs, always_xy=True).transform
        poly = shape(geom_dict)
        reprojected_poly = shapely_transform(project, poly)
        c = reprojected_poly.centroid

        return mapping(reprojected_poly), [round(c.y, 6), round(c.x, 6)]
    except Exception:
        # Fallback if pyproj fails
        poly = shape(geom_dict)
        c = poly.centroid
        return geom_dict, [round(c.y, 6), round(c.x, 6)]


def calculate_physical_area_m2(
    pixel_count: int,
    resolution: Optional[List[float]],
    crs_str: Optional[str] = None,
) -> Optional[float]:
    """
    Calculate physical surface area in m² from pixel count and resolution.
    Returns None if resolution is not established.
    """
    if not resolution or len(resolution) < 2:
        return None

    res_x, res_y = abs(resolution[0]), abs(resolution[1])
    if res_x <= 0 or res_y <= 0:
        return None

    # If CRS is projected (e.g. UTM), resolution is in meters
    if crs_str and "UTM" in crs_str.upper() or (crs_str and not crs_str.startswith("EPSG:4326") and not crs_str.startswith("+proj=longlat")):
        pixel_area_m2 = res_x * res_y
        return float(pixel_count * pixel_area_m2)

    # If resolution is around 10m (Sentinel-2) or 0.1m (drone)
    if res_x > 0.001:  # Likely metric resolution
        return float(pixel_count * res_x * res_y)

    # Geographic degrees ~ 111,320m per degree at equator
    deg_to_m = 111320.0
    pixel_area_m2 = (res_x * deg_to_m) * (res_y * deg_to_m)
    return float(pixel_count * pixel_area_m2)


def mask_to_geospatial_geojson(
    binary_mask: np.ndarray,
    affine_transform: Optional[List[float]],
    crs_str: Optional[str],
    resolution: Optional[List[float]] = None,
    prob_map: Optional[np.ndarray] = None,
    threshold: float = 0.50,
) -> Dict[str, Any]:
    """
    Convert binary mask to auditable GeoJSON FeatureCollection with MODEL_DERIVED status.
    """
    h, w = binary_mask.shape
    total_pixels = h * w
    foreground_pixels = int(np.sum(binary_mask == 1))

    has_geolocation = bool(
        affine_transform and len(affine_transform) >= 6 and
        crs_str and crs_str != "NOT_AVAILABLE" and crs_str != "UNSPECIFIED"
    )

    if not has_geolocation:
        return {
            "status": "GEOLOCATION_NOT_ESTABLISHED",
            "type": "FeatureCollection",
            "features": [],
            "geospatial": {
                "geolocationStatus": "NOT_ESTABLISHED",
                "crs": crs_str or "NOT_AVAILABLE",
                "physicalAreaM2": None,
                "physicalAreaKm2": None,
                "message": "Geospatial investigation unavailable. Reason: No valid geolocation metadata was established for this image.",
            },
        }

    # Generate Raster Footprint Bounding Polygon
    tl = pixel_to_geo(0, 0, affine_transform)
    tr = pixel_to_geo(w, 0, affine_transform)
    br = pixel_to_geo(w, h, affine_transform)
    bl = pixel_to_geo(0, h, affine_transform)

    footprint_raw = {
        "type": "Polygon",
        "coordinates": [[[tl[0], tl[1]], [tr[0], tr[1]], [br[0], br[1]], [bl[0], bl[1]], [tl[0], tl[1]]]]
    }
    footprint_wgs84, raster_centroid = transform_geometry_to_wgs84(footprint_raw, crs_str)

    features = []
    
    # Add Raster Footprint Feature
    features.append({
        "type": "Feature",
        "geometry": footprint_wgs84,
        "properties": {
            "featureType": "IMAGE_FOOTPRINT",
            "provenance": "MODEL_DERIVED",
            "dataProvenance": "MODEL_DERIVED",
            "status": "OBSERVED_RASTER_BOUNDS",
            "dimensions": [w, h],
            "crs": crs_str,
        }
    })

    # Connected Component Extraction
    labeled_mask, num_features = scipy.ndimage.label(binary_mask)
    total_spill_area_m2 = 0.0

    for comp_id in range(1, num_features + 1):
        comp_mask = (labeled_mask == comp_id)
        comp_pixels = int(np.sum(comp_mask))

        if comp_pixels < 4:
            continue

        ys, xs = np.where(comp_mask)
        min_y, max_y = int(np.min(ys)), int(np.max(ys))
        min_x, max_x = int(np.min(xs)), int(np.max(xs))

        # Build Polygon from bounding box / contour approximation
        c_tl = pixel_to_geo(min_x, min_y, affine_transform)
        c_tr = pixel_to_geo(max_x, min_y, affine_transform)
        c_br = pixel_to_geo(max_x, max_y, affine_transform)
        c_bl = pixel_to_geo(min_x, max_y, affine_transform)

        raw_geom = {
            "type": "Polygon",
            "coordinates": [[[c_tl[0], c_tl[1]], [c_tr[0], c_tr[1]], [c_br[0], c_br[1]], [c_bl[0], c_bl[1]], [c_tl[0], c_tl[1]]]]
        }
        wgs84_geom, comp_centroid = transform_geometry_to_wgs84(raw_geom, crs_str)

        comp_area_m2 = calculate_physical_area_m2(comp_pixels, resolution, crs_str)
        if comp_area_m2:
            total_spill_area_m2 += comp_area_m2

        mean_prob = float(np.mean(prob_map[comp_mask])) if prob_map is not None else 1.0
        max_prob = float(np.max(prob_map[comp_mask])) if prob_map is not None else 1.0

        features.append({
            "type": "Feature",
            "geometry": wgs84_geom,
            "properties": {
                "featureType": "OIL_SPILL_POLYGON",
                "provenance": "MODEL_DERIVED",
                "dataProvenance": "MODEL_DERIVED",
                "status": "MODEL_DERIVED",
                "componentId": comp_id,
                "pixelCount": comp_pixels,
                "pixelFraction": round(comp_pixels / max(total_pixels, 1), 6),
                "physicalAreaM2": round(comp_area_m2, 2) if comp_area_m2 else None,
                "physicalAreaKm2": round(comp_area_m2 / 1e6, 6) if comp_area_m2 else None,
                "meanProbability": round(mean_prob, 4),
                "maxProbability": round(max_prob, 4),
                "centroid": comp_centroid,
                "operatingThreshold": threshold,
                "evidenceClassification": "MODEL_DERIVED_PREDICTION",
            }
        })

    total_km2 = (total_spill_area_m2 / 1e6) if total_spill_area_m2 > 0 else None

    return {
        "type": "FeatureCollection",
        "features": features,
        "geospatial": {
            "geolocationStatus": "ESTABLISHED",
            "crs": crs_str,
            "rasterCentroid": raster_centroid,
            "physicalAreaM2": round(total_spill_area_m2, 2) if total_spill_area_m2 > 0 else None,
            "physicalAreaKm2": round(total_km2, 6) if total_km2 else None,
            "detectedFeatureCount": len([f for f in features if f["properties"].get("featureType") == "OIL_SPILL_POLYGON"]),
        }
    }
