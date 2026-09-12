"""
Geospatial Safety & Coordinate Transformation Module.
Enforces rigorous validation of Coordinate Reference Systems (CRS) and Affine Transforms,
provides safe reprojection to EPSG:4326 (WGS84), and computes true metric/projected surface areas.
"""

from typing import Tuple, Optional, Any, Dict
import pyproj
from pyproj import Transformer
import rasterio.transform
from rasterio.crs import CRS
from rasterio.transform import Affine
import shapely.geometry
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import transform as shapely_transform


class GeospatialError(Exception):
    """Exception raised for invalid or missing georeferencing metadata."""
    pass


def validate_georeferencing(crs: Optional[Any], affine_transform: Optional[Any]) -> Tuple[bool, str]:
    """
    Validate whether the raster possesses valid CRS and Affine Transform.

    Returns:
        Tuple of (is_valid: bool, status_message: str)
    """
    if crs is None or str(crs).strip() == "":
        return False, "missing_crs"
    if affine_transform is None or (hasattr(affine_transform, "is_identity") and affine_transform.is_identity):
        return False, "missing_transform"
    return True, "valid"


def pixel_to_geographic(px: float, py: float, transform: Affine) -> Tuple[float, float]:
    """
    Convert (x_pixel, y_pixel) to native spatial coordinates (x_geo, y_geo) using the Affine transform.
    """
    x_geo, y_geo = rasterio.transform.xy(transform, py, px, offset="center")
    return float(x_geo), float(y_geo)


def reproject_to_wgs84(geom: shapely.geometry.base.BaseGeometry, src_crs_str: str) -> shapely.geometry.base.BaseGeometry:
    """
    Reproject a Shapely geometry from source CRS to WGS84 (EPSG:4326, Lon/Lat order).

    Args:
        geom: Shapely geometry object in src_crs.
        src_crs_str: Source CRS string (e.g. 'EPSG:32643' or WKT).

    Returns:
        Reprojected Shapely geometry in EPSG:4326.
    """
    src_crs = CRS.from_user_input(src_crs_str)
    dst_crs = CRS.from_epsg(4326)

    if src_crs == dst_crs:
        return geom

    # always_xy=True forces (lon, lat) / (x, y) coordinate ordering
    transformer = Transformer.from_crs(src_crs, dst_crs, always_xy=True)
    reprojected_geom = shapely_transform(transformer.transform, geom)
    return reprojected_geom


def calculate_projected_area_km2(geom_wgs84: shapely.geometry.base.BaseGeometry) -> float:
    """
    Calculate the accurate surface area of a WGS84 geometry in square kilometers (km²).
    Reprojects geometry to World Equal-Area Cylindrical Projection (EPSG:6933) to measure true metric area.
    DO NOT compute area directly in degree units!

    Args:
        geom_wgs84: Shapely Polygon or MultiPolygon in EPSG:4326.

    Returns:
        Area in square kilometers (km²) rounded to 4 decimal places.
    """
    if geom_wgs84.is_empty:
        return 0.0

    # Reproject to EPSG:6933 (Equal Area Cylindrical in meters)
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:6933", always_xy=True)
    equal_area_geom = shapely_transform(transformer.transform, geom_wgs84)

    # Area in square meters -> convert to square kilometers
    area_m2 = equal_area_geom.area
    area_km2 = area_m2 / 1_000_000.0

    return round(float(area_km2), 4)
