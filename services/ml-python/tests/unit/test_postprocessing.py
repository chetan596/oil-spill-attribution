"""
Unit Tests for SAR Postprocessing & Polygonization.
Tests thresholding, noise filtering, GeoJSON polygon creation, and surface area calculation.
"""

import pytest
import numpy as np
from rasterio.transform import from_origin

from app.postprocessing.mask_to_polygon import probability_mask_to_polygons


def test_probability_mask_to_polygons_empty():
    prob_map = np.zeros((200, 200), dtype=np.float32)
    polys, area, conf = probability_mask_to_polygons(prob_map)
    assert len(polys) == 0
    assert area == 0.0
    assert conf == 0.0


def test_probability_mask_to_polygons_with_slick():
    transform = from_origin(72.8, 18.9, 0.001, 0.001)
    prob_map = np.zeros((300, 300), dtype=np.float32)

    # Insert a 40x40 pixel slick with high probability (0.95)
    prob_map[100:140, 100:140] = 0.95

    # Insert isolated 2x2 speckle noise (should be filtered out by min_pixel_area)
    prob_map[20:22, 20:22] = 0.99

    polys, area_km2, conf = probability_mask_to_polygons(
        prob_map=prob_map,
        affine_transform=transform,
        src_crs="EPSG:4326",
        threshold=0.5,
        min_pixel_area=15
    )

    assert len(polys) == 1
    assert polys[0]["type"] == "Polygon"
    assert area_km2 > 0.0
    assert conf > 0.9
