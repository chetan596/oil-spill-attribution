"""
Georeferenced Candidate Spill Geospatial Analysis Module.
Part 0.13B - Ocean Guard AI

Transforms binary segmentation masks and probability rasters from verified inference
(e.g., V09D unet-dual-pol-sar-v09d-residual-loss) into structured, georeferenced candidate
spill analysis objects with connected component extraction, metric area/perimeter calculation,
centroid/bounding-box derivation, model probability statistics, and GeoJSON serialization.

Scientific Guardrails:
- Status is strictly CANDIDATE_DARK_FORMATION (never CONFIRMED_OIL_SPILL).
- Volume estimation is strictly NOT_ESTABLISHED.
- Oil-type classification is strictly NOT_ESTABLISHED.
- AIS attribution, Metocean drift, and LLM synthesis are NOT evaluated in this phase.
"""

import time
import math
from typing import Dict, Any, List, Optional, Tuple, Union
import numpy as np
import cv2

try:
    import rasterio
    import rasterio.features
    from rasterio.crs import CRS
    from rasterio.transform import Affine
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

import shapely.geometry
from shapely.geometry import shape, Polygon, MultiPolygon, Point
from shapely.ops import unary_union, transform as shapely_transform
import pyproj
from pyproj import Transformer

from app.preprocessing.georeferencing import (
    validate_georeferencing,
    reproject_to_wgs84,
    calculate_projected_area_km2,
    GeospatialError,
)


class GeospatialAnalysisError(Exception):
    """Raised when geospatial input validation or processing fails."""
    pass


def validate_binary_mask(
    mask: np.ndarray,
    prob_map: Optional[np.ndarray] = None
) -> None:
    """
    Validate binary mask integrity:
    1. 2D array dimensions.
    2. Values must be strictly 0 and 1.
    3. If prob_map is provided, verify matching dimensions and valid range [0, 1].
    """
    if not isinstance(mask, np.ndarray):
        raise GeospatialAnalysisError("Binary mask must be a numpy.ndarray.")

    if mask.ndim != 2:
        raise GeospatialAnalysisError(f"Binary mask must be 2-dimensional (H, W), got {mask.ndim}D shape {mask.shape}.")

    unique_vals = np.unique(mask)
    for val in unique_vals:
        if val not in (0, 1, 0.0, 1.0, False, True):
            raise GeospatialAnalysisError(
                f"Binary mask contains invalid values: {unique_vals}. Must contain only 0 and 1."
            )

    if prob_map is not None:
        if not isinstance(prob_map, np.ndarray):
            raise GeospatialAnalysisError("Probability map must be a numpy.ndarray.")
        if prob_map.shape != mask.shape:
            raise GeospatialAnalysisError(
                f"Probability map shape {prob_map.shape} does not match binary mask shape {mask.shape}."
            )
        if not np.all(np.isfinite(prob_map)):
            raise GeospatialAnalysisError("Probability map contains non-finite values (NaN or Inf).")
        if np.any(prob_map < -1e-5) or np.any(prob_map > 1.0 + 1e-5):
            raise GeospatialAnalysisError("Probability map values must fall in the range [0.0, 1.0].")


def compute_projected_metric_properties(
    geom_wgs84: shapely.geometry.base.BaseGeometry
) -> Tuple[float, float, float]:
    """
    Compute metric area in m², metric area in km², and metric perimeter in meters
    using World Cylindrical Equal Area projection (EPSG:6933).

    Args:
        geom_wgs84: Shapely Polygon or MultiPolygon in EPSG:4326.

    Returns:
        Tuple of (area_m2, area_km2, perimeter_m)
    """
    if geom_wgs84.is_empty:
        return 0.0, 0.0, 0.0

    try:
        transformer = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)
        equal_area_geom = shapely_transform(transformer.transform, geom_wgs84)
        area_m2 = float(equal_area_geom.area)
        area_km2 = float(area_m2 / 1_000_000.0)
        perimeter_m = float(equal_area_geom.length)
        return round(area_m2, 2), round(area_km2, 6), round(perimeter_m, 2)
    except Exception as e:
        raise GeospatialAnalysisError(f"Failed to project geometry to EPSG:6933 for metric calculation: {str(e)}")


def compute_shape_features(
    geom_wgs84: shapely.geometry.base.BaseGeometry,
    area_m2: float,
    perimeter_m: float
) -> Dict[str, float]:
    """
    Calculate descriptive, non-interpretive geometric shape measurements:
    - aspectRatio: ratio of major to minor dimension of minimum bounding rectangle.
    - elongation: 1.0 - (minor / major).
    - compactness: Isoperimetric quotient 4 * pi * area / (perimeter^2).

    Note: These are purely geometric descriptors and MUST NOT be used to classify oil types.
    """
    if geom_wgs84.is_empty or area_m2 <= 0.0 or perimeter_m <= 0.0:
        return {
            "aspectRatio": 1.0,
            "elongation": 0.0,
            "compactness": 0.0
        }

    # Minimum rotated rectangle in projected equal-area space for true geometric metric ratios
    try:
        transformer = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)
        proj_geom = shapely_transform(transformer.transform, geom_wgs84)
        mrr = proj_geom.minimum_rotated_rectangle
        
        # Extract edge lengths of the minimum rotated rectangle
        coords = list(mrr.exterior.coords)
        if len(coords) >= 4:
            edge1 = Point(coords[0]).distance(Point(coords[1]))
            edge2 = Point(coords[1]).distance(Point(coords[2]))
            major_axis = max(edge1, edge2, 1e-4)
            minor_axis = max(min(edge1, edge2), 1e-4)
            aspect_ratio = float(major_axis / minor_axis)
            elongation = float(1.0 - (minor_axis / major_axis))
        else:
            aspect_ratio = 1.0
            elongation = 0.0
    except Exception:
        aspect_ratio = 1.0
        elongation = 0.0

    # Compactness (Isoperimetric Quotient: 4 * pi * Area / Perimeter^2)
    # Circle = 1.0; highly irregular or elongated shapes -> 0.0
    if perimeter_m > 0:
        compactness = float((4.0 * math.pi * area_m2) / (perimeter_m ** 2))
        compactness = min(1.0, max(0.0, compactness))
    else:
        compactness = 0.0

    return {
        "aspectRatio": round(aspect_ratio, 3),
        "elongation": round(elongation, 3),
        "compactness": round(compactness, 4)
    }


def analyze_candidate_spill_regions(
    binary_mask: np.ndarray,
    prob_map: Optional[np.ndarray] = None,
    affine_transform: Optional[Any] = None,
    src_crs: Optional[str] = "EPSG:4326",
    source_metadata: Optional[Dict[str, Any]] = None,
    min_pixel_area: int = 15,
    simplify_tolerance_deg: float = 0.0001,
    required_crs: bool = False
) -> Dict[str, Any]:
    """
    Perform rigorous geospatial connected component and polygonization analysis on a segmented SAR scene.

    Args:
        binary_mask: 2D array of {0, 1} slick segmentation.
        prob_map: Optional 2D array of [0.0, 1.0] model output probabilities.
        affine_transform: Rasterio Affine transform for geocoding.
        src_crs: Source Coordinate Reference System (e.g. 'EPSG:4326', 'EPSG:32630').
        source_metadata: Dict containing provenance, model ID, release, threshold, etc.
        min_pixel_area: Minimum connected component pixel area to retain (speckle filter).
        simplify_tolerance_deg: Douglas-Peucker simplification tolerance in degrees.
        required_crs: If True, fails closed if CRS or Affine transform is missing.

    Returns:
        Structured scene-level geospatial candidate spill analysis object.
    """
    t_start = time.perf_counter()

    # 1. Input Validation
    validate_binary_mask(binary_mask, prob_map)

    is_geo_valid, geo_status = validate_georeferencing(src_crs, affine_transform)
    if required_crs and not is_geo_valid:
        raise GeospatialAnalysisError(
            f"Geospatial output required but georeferencing is invalid: {geo_status}"
        )

    meta = source_metadata or {}
    source_type = meta.get("sourceType", "UPLOADED_REAL_SAR")
    scene_id = meta.get("sceneId", meta.get("sourceSceneId", "unknown_scene"))
    acquisition_timestamp = meta.get("acquisitionTimestamp", None)
    model_id = meta.get("modelId", "unet-dual-pol-sar-v09d-residual-loss")
    model_release = meta.get("modelRelease", "OG-SAR-ML-RESEARCH-RELEASE-V0.12")
    checkpoint_sha = meta.get("checkpointSha256", "ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d")
    threshold = float(meta.get("threshold", 0.50))

    height, width = binary_mask.shape
    total_scene_pixels = height * width

    # 2. Connected Component Extraction
    t_poly_start = time.perf_counter()
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        binary_mask.astype(np.uint8), connectivity=8
    )

    regions_data: List[Dict[str, Any]] = []
    geojson_features: List[Dict[str, Any]] = []
    all_wgs84_polygons: List[Polygon] = []

    transform_to_use = affine_transform if is_geo_valid else Affine.identity()

    t_poly_ms = round((time.perf_counter() - t_poly_start) * 1000, 2)
    t_geom_start = time.perf_counter()

    for label_idx in range(1, num_labels):
        area_pixels = int(stats[label_idx, cv2.CC_STAT_AREA])
        if area_pixels < min_pixel_area:
            continue

        region_id = f"candidate_region_{len(regions_data) + 1:03d}"
        region_mask = (labels == label_idx).astype(np.uint8)

        # Extract vector polygons for this single component
        shapes_gen = rasterio.features.shapes(
            region_mask,
            mask=(region_mask == 1),
            transform=transform_to_use,
            connectivity=8
        )

        component_polys = []
        for geom_dict, val in shapes_gen:
            if val == 1:
                poly_shape = shape(geom_dict)
                if not poly_shape.is_valid:
                    poly_shape = poly_shape.buffer(0)
                if not poly_shape.is_empty and poly_shape.area > 0:
                    if isinstance(poly_shape, MultiPolygon):
                        component_polys.extend(poly_shape.geoms)
                    elif isinstance(poly_shape, Polygon):
                        component_polys.append(poly_shape)

        if not component_polys:
            continue

        unified_poly = unary_union(component_polys)
        if unified_poly.is_empty:
            continue

        # 3. Geometry Reprojection & Coordinate Validation
        if is_geo_valid and src_crs:
            wgs84_poly = reproject_to_wgs84(unified_poly, src_crs)
        else:
            wgs84_poly = unified_poly

        if simplify_tolerance_deg > 0 and is_geo_valid:
            simplified_wgs84 = wgs84_poly.simplify(simplify_tolerance_deg, preserve_topology=True)
        else:
            simplified_wgs84 = wgs84_poly

        all_wgs84_polygons.append(simplified_wgs84)

        # 4. Metric Area & Perimeter Calculation
        if is_geo_valid:
            area_m2, area_km2, perimeter_m = compute_projected_metric_properties(simplified_wgs84)
        else:
            area_m2 = float(area_pixels)
            area_km2 = float(area_pixels / 1_000_000.0)
            perimeter_m = float(simplified_wgs84.length)

        # 5. Centroid Calculation (Explicit WGS84 Lon/Lat)
        centroid_pt = simplified_wgs84.centroid
        centroid_lon = round(float(centroid_pt.x), 6)
        centroid_lat = round(float(centroid_pt.y), 6)

        # 6. Bounding Box (WGS84 Lon/Lat bounds)
        min_lon, min_lat, max_lon, max_lat = [round(float(b), 6) for b in simplified_wgs84.bounds]

        # 7. Model Output Probability Statistics
        if prob_map is not None:
            region_probs = prob_map[region_mask == 1]
            mean_prob = round(float(np.mean(region_probs)), 4)
            max_prob = round(float(np.max(region_probs)), 4)
            min_prob = round(float(np.min(region_probs)), 4)
            prob_pixel_count = int(len(region_probs))
        else:
            mean_prob = 1.0
            max_prob = 1.0
            min_prob = 1.0
            prob_pixel_count = area_pixels

        prob_stats = {
            "meanProbability": mean_prob,
            "maxProbability": max_prob,
            "minProbability": min_prob,
            "probabilityPixelCount": prob_pixel_count,
            "statisticType": "MODEL_OUTPUT_STATISTICS",
            "interpretationNote": "Model output probability across candidate region pixels; not per-scene confidence."
        }

        # 8. Descriptive Geometric Shape Features
        shape_features = compute_shape_features(simplified_wgs84, area_m2, perimeter_m)

        # 9. Formulate Region Data Object
        region_obj = {
            "regionId": region_id,
            "scientificStatus": "CANDIDATE_DARK_FORMATION",
            "pixelCount": area_pixels,
            "areaM2": area_m2,
            "areaKm2": area_km2,
            "perimeterM": perimeter_m,
            "centroid": {
                "latitude": centroid_lat,
                "longitude": centroid_lon
            },
            "centroidGeometry": {
                "type": "Point",
                "coordinates": [centroid_lon, centroid_lat]
            },
            "boundingBox": {
                "minLongitude": min_lon,
                "minLatitude": min_lat,
                "maxLongitude": max_lon,
                "maxLatitude": max_lat
            },
            "modelOutputStatistics": prob_stats,
            "shapeFeatures": shape_features,
            "scientificGuardrails": {
                "oilType": "NOT_ESTABLISHED",
                "estimatedVolume": "NOT_ESTABLISHED",
                "limitation": "Single-date SAR dark backscatter region; thickness, volume, and chemical typing are unestablished."
            },
            "geometry": shapely.geometry.mapping(simplified_wgs84)
        }
        regions_data.append(region_obj)

        # 10. GeoJSON Feature Representation
        geojson_feature = {
            "type": "Feature",
            "id": region_id,
            "geometry": shapely.geometry.mapping(simplified_wgs84),
            "properties": {
                "regionId": region_id,
                "scientificStatus": "CANDIDATE_DARK_FORMATION",
                "pixelCount": area_pixels,
                "areaM2": area_m2,
                "areaKm2": area_km2,
                "perimeterM": perimeter_m,
                "centroidLatitude": centroid_lat,
                "centroidLongitude": centroid_lon,
                "boundingBox": [min_lon, min_lat, max_lon, max_lat],
                "meanProbability": mean_prob,
                "maxProbability": max_prob,
                "aspectRatio": shape_features["aspectRatio"],
                "elongation": shape_features["elongation"],
                "compactness": shape_features["compactness"],
                "oilType": "NOT_ESTABLISHED",
                "estimatedVolume": "NOT_ESTABLISHED",
                "modelId": model_id,
                "modelRelease": model_release,
                "operatingThreshold": threshold,
                "sourceType": source_type
            }
        }
        geojson_features.append(geojson_feature)

    t_geom_ms = round((time.perf_counter() - t_geom_start) * 1000, 2)
    t_area_start = time.perf_counter()

    # 11. Scene-Level Summaries
    total_positive_pixels = int(sum(r["pixelCount"] for r in regions_data))
    total_area_m2 = round(float(sum(r["areaM2"] for r in regions_data)), 2)
    total_area_km2 = round(float(sum(r["areaKm2"] for r in regions_data)), 6)
    coverage_percent = round((total_positive_pixels / max(total_scene_pixels, 1)) * 100.0, 4)

    # Largest Region
    largest_region = None
    if regions_data:
        largest = max(regions_data, key=lambda r: r["areaKm2"])
        largest_region = {
            "regionId": largest["regionId"],
            "areaKm2": largest["areaKm2"],
            "pixelCount": largest["pixelCount"],
            "centroid": largest["centroid"]
        }

    # Scene Centroid & Scene Bounding Box
    scene_centroid = None
    scene_bbox = None
    if all_wgs84_polygons:
        scene_union = unary_union(all_wgs84_polygons)
        sc_pt = scene_union.centroid
        scene_centroid = {
            "latitude": round(float(sc_pt.y), 6),
            "longitude": round(float(sc_pt.x), 6)
        }
        s_min_lon, s_min_lat, s_max_lon, s_max_lat = [round(float(b), 6) for b in scene_union.bounds]
        scene_bbox = {
            "minLongitude": s_min_lon,
            "minLatitude": s_min_lat,
            "maxLongitude": s_max_lon,
            "maxLatitude": s_max_lat
        }

    t_area_ms = round((time.perf_counter() - t_area_start) * 1000, 2)
    t_total_ms = round((time.perf_counter() - t_start) * 1000, 2)

    # Construct GeoJSON FeatureCollection
    geojson_collection = {
        "type": "FeatureCollection",
        "features": geojson_features,
        "metadata": {
            "sceneId": scene_id,
            "sourceType": source_type,
            "regionCount": len(regions_data),
            "totalAreaKm2": total_area_km2,
            "crs": "EPSG:4326"
        }
    }

    # Complete Structured Scene Analysis Schema
    return {
        "sceneId": scene_id,
        "sourceType": source_type,
        "acquisitionTimestamp": acquisition_timestamp,
        "model": {
            "id": model_id,
            "release": model_release,
            "checkpointSha256": checkpoint_sha,
            "scientificStatus": "EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS",
            "operatingThreshold": threshold
        },
        "geospatial": {
            "srcCrs": src_crs,
            "outputCrs": "EPSG:4326",
            "isGeoreferenced": is_geo_valid,
            "georeferencingStatus": geo_status,
            "sceneCentroid": scene_centroid,
            "sceneBoundingBox": scene_bbox
        },
        "summary": {
            "regionCount": len(regions_data),
            "totalPositivePixels": total_positive_pixels,
            "totalScenePixels": total_scene_pixels,
            "coveragePercent": coverage_percent,
            "totalDetectedAreaM2": total_area_m2,
            "totalDetectedAreaKm2": total_area_km2,
            "largestRegion": largest_region,
            "scientificStatus": "CANDIDATE_DARK_FORMATION" if len(regions_data) > 0 else "NO_FORMATION_DETECTED",
        },
        "scientificGuardrails": {
            "oilType": "NOT_ESTABLISHED",
            "estimatedVolume": "NOT_ESTABLISHED",
            "aisAttribution": "NOT_IMPLEMENTED",
            "metoceanDrift": "NOT_IMPLEMENTED",
            "llmSynthesis": "NOT_IMPLEMENTED",
            "analyticalLimitation": "Radar backscatter depression marks candidate surface damping; does not prove chemical oil classification, volume, or vessel liability."
        },
        "regions": regions_data,
        "geoJson": geojson_collection,
        "performance": {
            "polygonizationDurationMs": t_poly_ms,
            "geometryProcessingDurationMs": t_geom_ms,
            "areaCalculationDurationMs": t_area_ms,
            "totalGeospatialDurationMs": t_total_ms
        }
    }
