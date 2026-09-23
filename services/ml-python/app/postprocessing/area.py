"""
Metric Surface Area Calculation Module.
Part 0.13B - Ocean Guard AI
Computes real projected surface areas via equal-area cylindrical projection (EPSG:6933).
"""

from typing import Union, Dict, Any
import shapely.geometry
from shapely.geometry import shape, Polygon, MultiPolygon
from app.preprocessing.georeferencing import calculate_projected_area_km2


def compute_polygon_area_km2(polygon_input: Union[Dict[str, Any], shapely.geometry.base.BaseGeometry]) -> float:
    """
    Calculate the accurate surface area of a geometry in square kilometers (km²).
    Accepts GeoJSON dict or Shapely geometry in EPSG:4326.
    """
    if polygon_input is None:
        return 0.0

    if isinstance(polygon_input, dict):
        try:
            geom = shape(polygon_input)
        except Exception:
            return 0.0
    else:
        geom = polygon_input

    return calculate_projected_area_km2(geom)
