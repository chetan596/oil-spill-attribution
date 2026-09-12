"""
Unit Tests for Geospatial Safety & Coordinate Transformations.
Tests CRS validation, pixel-to-geographic projection, and metric surface area calculation.
"""

import pytest
from rasterio.transform import from_origin, Affine
from shapely.geometry import Polygon, box

from app.preprocessing.georeferencing import (
    validate_georeferencing,
    pixel_to_geographic,
    reproject_to_wgs84,
    calculate_projected_area_km2,
)


def test_validate_georeferencing_valid():
    transform = from_origin(72.8, 18.9, 0.001, 0.001)
    is_valid, msg = validate_georeferencing("EPSG:4326", transform)
    assert is_valid is True
    assert msg == "valid"


def test_validate_georeferencing_missing_crs():
    transform = from_origin(72.8, 18.9, 0.001, 0.001)
    is_valid, msg = validate_georeferencing(None, transform)
    assert is_valid is False
    assert msg == "missing_crs"


def test_validate_georeferencing_missing_transform():
    is_valid, msg = validate_georeferencing("EPSG:4326", None)
    assert is_valid is False
    assert msg == "missing_transform"


def test_pixel_to_geographic():
    transform = from_origin(72.0, 19.0, 0.1, 0.1)
    x, y = pixel_to_geographic(10, 20, transform)
    assert round(x, 2) == 73.05  # 72.0 + 10.5*0.1
    assert round(y, 2) == 16.95  # 19.0 - 20.5*0.1


def test_calculate_projected_area_km2():
    """
    Test metric surface area calculation on an approx 0.01 deg x 0.01 deg box (approx 1.1 km x 1.1 km = ~1.2 km²).
    Ensures metric calculation does not return raw 0.0001 (degree units).
    """
    poly = box(72.80, 18.90, 72.81, 18.91)
    area_km2 = calculate_projected_area_km2(poly)
    assert area_km2 > 1.0 and area_km2 < 1.5
