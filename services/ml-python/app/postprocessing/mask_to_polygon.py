"""
SAR Postprocessing & Georeferenced Polygonization Module.
Converts neural network segmentation probability maps into clean, georeferenced GeoJSON Polygons,
calculates accurate metric surface areas via projected CRS transforms, and applies noise suppression.
"""

from typing import List, Dict, Any, Tuple, Optional
import numpy as np
import rasterio.features
from rasterio.transform import Affine
import shapely.geometry
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union
import cv2

from app.preprocessing.georeferencing import (
    reproject_to_wgs84,
    calculate_projected_area_km2,
    validate_georeferencing,
)


def probability_mask_to_polygons(
    prob_map: np.ndarray,
    affine_transform: Optional[Affine] = None,
    src_crs: Optional[str] = "EPSG:4326",
    threshold: float = 0.5,
    min_pixel_area: int = 15,
    simplify_tolerance_deg: float = 0.0001
) -> Tuple[List[Dict[str, Any]], float, float]:
    """
    Convert a 2D probability map to georeferenced GeoJSON polygons and compute total area.

    Args:
        prob_map: 2D float32 numpy array with values in [0.0, 1.0].
        affine_transform: Rasterio Affine transform. If None, uses pixel coordinates.
        src_crs: Coordinate Reference System of the raster (e.g. 'EPSG:4326' or UTM).
        threshold: Binarization decision threshold.
        min_pixel_area: Minimum connected component pixel count to keep (filters speckle noise).
        simplify_tolerance_deg: Douglas-Peucker simplification tolerance in degrees.

    Returns:
        Tuple of:
            - List of GeoJSON Polygon feature dicts with coordinates in WGS84 (Lon/Lat)
            - Total area in square kilometers (km²)
            - Mean detection confidence across segmented slick pixels
    """
    # 1. Binarize probability map
    binary_mask = (prob_map >= threshold).astype(np.uint8)

    if np.sum(binary_mask) == 0:
        return [], 0.0, 0.0

    # 2. Morphological noise cleanup (small opening followed by closing)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    cleaned_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_OPEN, kernel)
    cleaned_mask = cv2.morphologyEx(cleaned_mask, cv2.MORPH_CLOSE, kernel)

    # 3. Filter tiny connected components
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(cleaned_mask, connectivity=8)
    filtered_mask = np.zeros_like(cleaned_mask)
    for label_idx in range(1, num_labels):
        area_pixels = stats[label_idx, cv2.CC_STAT_AREA]
        if area_pixels >= min_pixel_area:
            filtered_mask[labels == label_idx] = 1

    if np.sum(filtered_mask) == 0:
        return [], 0.0, 0.0

    # Compute mean confidence across valid slick pixels
    slick_pixels = prob_map[filtered_mask == 1]
    mean_confidence = float(np.mean(slick_pixels)) if len(slick_pixels) > 0 else 0.0

    # 4. Extract vector shapes via rasterio.features.shapes
    is_geo_valid, _ = validate_georeferencing(src_crs, affine_transform)

    shapes_gen = rasterio.features.shapes(
        filtered_mask,
        mask=(filtered_mask == 1),
        transform=affine_transform if is_geo_valid else Affine.identity(),
        connectivity=8
    )

    shapely_polygons: List[Polygon] = []
    for geom_dict, val in shapes_gen:
        if val == 1:
            poly_shape = shape(geom_dict)
            if not poly_shape.is_valid:
                poly_shape = poly_shape.buffer(0)  # Fix self-intersections
            if not poly_shape.is_empty and poly_shape.area > 0:
                if isinstance(poly_shape, MultiPolygon):
                    shapely_polygons.extend(poly_shape.geoms)
                elif isinstance(poly_shape, Polygon):
                    shapely_polygons.append(poly_shape)

    if not shapely_polygons:
        return [], 0.0, mean_confidence

    # 5. Union contiguous geometries
    unified_geom = unary_union(shapely_polygons)
    if unified_geom.is_empty:
        return [], 0.0, mean_confidence

    # 6. Reproject to WGS84 (EPSG:4326) if georeferencing is valid
    if is_geo_valid and src_crs:
        wgs84_geom = reproject_to_wgs84(unified_geom, src_crs)
        total_area_km2 = calculate_projected_area_km2(wgs84_geom)
    else:
        wgs84_geom = unified_geom
        total_area_km2 = float(unified_geom.area)  # Pixel units if unreferenced

    # 7. Simplify geometry slightly to optimize GeoJSON payload size
    if simplify_tolerance_deg > 0 and is_geo_valid:
        simplified_geom = wgs84_geom.simplify(simplify_tolerance_deg, preserve_topology=True)
    else:
        simplified_geom = wgs84_geom

    # 8. Convert to GeoJSON polygon dictionaries
    geojson_polygons: List[Dict[str, Any]] = []
    if isinstance(simplified_geom, MultiPolygon):
        for poly in simplified_geom.geoms:
            if not poly.is_empty:
                geojson_polygons.append(shapely.geometry.mapping(poly))
    elif isinstance(simplified_geom, Polygon):
        if not simplified_geom.is_empty:
            geojson_polygons.append(shapely.geometry.mapping(simplified_geom))

    return geojson_polygons, round(total_area_km2, 4), round(mean_confidence, 4)
