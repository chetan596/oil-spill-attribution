"""
Geospatial Geometry & Centroid Processing Module.
Part 0.13B - Ocean Guard AI
Calculates real centroids and bounding boxes for georeferenced coordinates.
"""

from typing import List, Tuple, Union, Dict, Any
import numpy as np
import shapely.geometry
from shapely.geometry import shape, Polygon, Point


def calculate_centroid(coordinates: Union[List[Any], Dict[str, Any], shapely.geometry.base.BaseGeometry]) -> List[float]:
    """
    Calculate the centroid [latitude, longitude] of a geometry or coordinate list.
    Returns:
        [latitude (Y), longitude (X)]
    """
    if coordinates is None:
        return [0.0, 0.0]

    if isinstance(coordinates, dict):
        try:
            geom = shape(coordinates)
            return [round(float(geom.centroid.y), 6), round(float(geom.centroid.x), 6)]
        except Exception:
            return [0.0, 0.0]

    if isinstance(coordinates, shapely.geometry.base.BaseGeometry):
        return [round(float(coordinates.centroid.y), 6), round(float(coordinates.centroid.x), 6)]

    if isinstance(coordinates, (list, tuple)):
        # If list of [lon, lat] pairs
        if len(coordinates) > 0 and isinstance(coordinates[0], (list, tuple)):
            lons = [pt[0] for pt in coordinates]
            lats = [pt[1] for pt in coordinates]
            return [round(float(np.mean(lats)), 6), round(float(np.mean(lons)), 6)]
        # If single pair [lat, lon]
        elif len(coordinates) == 2:
            return [float(coordinates[0]), float(coordinates[1])]

    return [0.0, 0.0]
