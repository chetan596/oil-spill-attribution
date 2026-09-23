"""
Unit Tests for Part 0.13B: Georeferenced Candidate Spill Analysis.
Verifies binary mask validation, connected component extraction, metric surface area (EPSG:6933),
perimeter, centroid, bounding box, probability statistics, descriptive shape features,
GeoJSON FeatureCollection serialization, fail-closed geospatial safety, and scientific guardrails.
"""

import pytest
import numpy as np
from rasterio.transform import from_origin, Affine
from shapely.geometry import box, shape

from app.postprocessing.spill_analysis import (
    validate_binary_mask,
    compute_projected_metric_properties,
    compute_shape_features,
    analyze_candidate_spill_regions,
    GeospatialAnalysisError,
)
from app.postprocessing.area import compute_polygon_area_km2
from app.postprocessing.geometry import calculate_centroid


def test_validate_binary_mask_valid():
    valid_mask = np.array([[0, 1], [1, 0]], dtype=np.uint8)
    valid_prob = np.array([[0.1, 0.9], [0.8, 0.2]], dtype=np.float32)
    # Should not raise
    validate_binary_mask(valid_mask, valid_prob)


def test_validate_binary_mask_rejects_non_binary_values():
    invalid_mask = np.array([[0, 2], [1, 0]], dtype=np.uint8)
    with pytest.raises(GeospatialAnalysisError, match="Must contain only 0 and 1"):
        validate_binary_mask(invalid_mask)


def test_validate_binary_mask_rejects_mismatched_probability_shape():
    mask = np.zeros((100, 100), dtype=np.uint8)
    prob = np.zeros((50, 50), dtype=np.float32)
    with pytest.raises(GeospatialAnalysisError, match="does not match binary mask shape"):
        validate_binary_mask(mask, prob)


def test_validate_binary_mask_rejects_nan_probabilities():
    mask = np.zeros((10, 10), dtype=np.uint8)
    prob = np.zeros((10, 10), dtype=np.float32)
    prob[0, 0] = np.nan
    with pytest.raises(GeospatialAnalysisError, match="contains non-finite values"):
        validate_binary_mask(mask, prob)


def test_compute_projected_metric_properties_on_box():
    # 0.01 deg lon x 0.01 deg lat box around (72.80, 18.90) in Mumbai offshore region
    # ~1.11 km x ~1.05 km = ~1.16 km² = ~1,160,000 m²
    geom = box(72.80, 18.90, 72.81, 18.91)
    area_m2, area_km2, perimeter_m = compute_projected_metric_properties(geom)
    
    assert area_km2 > 1.0 and area_km2 < 1.4
    assert area_m2 == pytest.approx(area_km2 * 1_000_000, rel=1e-4)
    assert perimeter_m > 4000.0 and perimeter_m < 5000.0


def test_compute_shape_features():
    geom = box(72.80, 18.90, 72.83, 18.91) # 3:1 elongated rectangle
    area_m2, area_km2, perimeter_m = compute_projected_metric_properties(geom)
    features = compute_shape_features(geom, area_m2, perimeter_m)
    
    assert "aspectRatio" in features
    assert "elongation" in features
    assert "compactness" in features
    assert features["aspectRatio"] >= 2.0
    assert features["elongation"] > 0.4
    assert features["compactness"] > 0.0 and features["compactness"] < 1.0


def test_analyze_candidate_spill_regions_single_slick():
    transform = from_origin(72.80, 18.90, 0.0005, 0.0005) # ~55m resolution
    mask = np.zeros((200, 200), dtype=np.uint8)
    prob = np.zeros((200, 200), dtype=np.float32)
    
    # 40x40 slick in center
    mask[80:120, 80:120] = 1
    prob[80:120, 80:120] = 0.92

    meta = {
        "sourceType": "REAL_CDSE",
        "sceneId": "S1A_IW_GRDH_1SDV_20260919T000000",
        "modelId": "unet-dual-pol-sar-v09d-residual-loss",
        "modelRelease": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
        "threshold": 0.50
    }

    result = analyze_candidate_spill_regions(
        binary_mask=mask,
        prob_map=prob,
        affine_transform=transform,
        src_crs="EPSG:4326",
        source_metadata=meta,
        min_pixel_area=15
    )

    assert result["sourceType"] == "REAL_CDSE"
    assert result["summary"]["regionCount"] == 1
    assert result["summary"]["scientificStatus"] == "CANDIDATE_DARK_FORMATION"
    assert result["summary"]["totalDetectedAreaKm2"] > 0.0
    assert result["summary"]["totalPositivePixels"] == 1600

    region = result["regions"][0]
    assert region["scientificStatus"] == "CANDIDATE_DARK_FORMATION"
    assert region["pixelCount"] == 1600
    assert region["areaKm2"] > 0.0
    assert region["areaM2"] > 0.0
    assert region["perimeterM"] > 0.0
    assert 72.80 <= region["centroid"]["longitude"] <= 72.90
    assert 18.80 <= region["centroid"]["latitude"] <= 18.90
    assert region["modelOutputStatistics"]["meanProbability"] == pytest.approx(0.92, abs=0.01)

    # Scientific Guardrails
    assert result["scientificGuardrails"]["oilType"] == "NOT_ESTABLISHED"
    assert result["scientificGuardrails"]["estimatedVolume"] == "NOT_ESTABLISHED"
    assert result["scientificGuardrails"]["aisAttribution"] == "NOT_IMPLEMENTED"
    assert result["scientificGuardrails"]["metoceanDrift"] == "NOT_IMPLEMENTED"
    assert result["scientificGuardrails"]["llmSynthesis"] == "NOT_IMPLEMENTED"

    # GeoJSON verification
    geojson = result["geoJson"]
    assert geojson["type"] == "FeatureCollection"
    assert len(geojson["features"]) == 1
    feat = geojson["features"][0]
    assert feat["type"] == "Feature"
    assert feat["geometry"]["type"] in ("Polygon", "MultiPolygon")
    assert feat["properties"]["oilType"] == "NOT_ESTABLISHED"
    assert feat["properties"]["estimatedVolume"] == "NOT_ESTABLISHED"


def test_analyze_candidate_spill_regions_noise_speckle_filtering():
    transform = from_origin(72.80, 18.90, 0.0005, 0.0005)
    mask = np.zeros((100, 100), dtype=np.uint8)
    
    # 2x2 speckle noise (4 pixels < min_pixel_area 15)
    mask[10:12, 10:12] = 1

    result = analyze_candidate_spill_regions(
        binary_mask=mask,
        affine_transform=transform,
        src_crs="EPSG:4326",
        min_pixel_area=15
    )

    assert result["summary"]["regionCount"] == 0
    assert result["summary"]["totalDetectedAreaKm2"] == 0.0
    assert result["summary"]["scientificStatus"] == "NO_FORMATION_DETECTED"


def test_analyze_candidate_spill_regions_fail_closed_on_missing_crs():
    mask = np.zeros((50, 50), dtype=np.uint8)
    mask[10:20, 10:20] = 1

    with pytest.raises(GeospatialAnalysisError, match="georeferencing is invalid"):
        analyze_candidate_spill_regions(
            binary_mask=mask,
            affine_transform=None,
            src_crs=None,
            required_crs=True
        )


def test_legacy_helper_functions_return_accurate_metrics():
    # Test area.py
    poly_dict = {
        "type": "Polygon",
        "coordinates": [[[72.80, 18.90], [72.81, 18.90], [72.81, 18.91], [72.80, 18.91], [72.80, 18.90]]]
    }
    area = compute_polygon_area_km2(poly_dict)
    assert area > 1.0 and area < 1.4

    # Test geometry.py
    centroid = calculate_centroid(poly_dict)
    assert centroid[0] == pytest.approx(18.905, abs=0.005) # Lat
    assert centroid[1] == pytest.approx(72.805, abs=0.005) # Lon
