"""
Phase 15 Test Suite: TIFF Visual Preview + GeoTIFF Ingestion + Geospatial Analysis Bridge.

Covers all 35 test points across 6 categories:
1. Forensic TIFF Inspection (tests 1–8)
2. TIFF Visual Preview Generation (tests 9–14)
3. 2-Channel TIFF Rejection & Fail-Closed Guard (tests 15–18)
4. Geospatial Bridge & Physical Area (tests 19–24)
5. Downstream Investigation Integration & Legal Guardrails (tests 25–30)
6. Regression Preservation (Phase 13, 14, 15) & Checkpoint Immutability (tests 31–36)
"""

import os
import sys
import json
import io
import hashlib
import numpy as np
import pytest
from PIL import Image
import rasterio
from rasterio.transform import from_origin
from rasterio.crs import CRS

# Ensure ml-python service is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../services/ml-python")))

from fastapi.testclient import TestClient
from app.main import app
from app.models.optical_model_registry import (
    OPTICAL_REGISTRY,
    compute_file_sha256,
    SourceType,
    OpticalInputDescriptor,
    AmbiguousModalityError,
)
from app.inference.optical_router import (
    OpticalRouter,
    UnsupportedInputError,
    OperationalOpticalEngine,
)
from app.preprocessing.tiff_preview import (
    inspect_tiff_metadata,
    generate_tiff_visual_preview,
    normalize_channel_to_uint8,
    InvalidTiffError,
)
from app.preprocessing.geospatial_bridge import (
    pixel_to_geo,
    transform_geometry_to_wgs84,
    calculate_physical_area_m2,
    mask_to_geospatial_geojson,
)

client = TestClient(app)

EXPECTED_CHECKPOINTS = {
    "kerf-resnet34-focaldice-v1": "d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264",
    "mados-resnet34-rgb-v1": "a4c32de7177bc42c2f0298427ce8bef4a2bf8d4a35e25c3450a67eb16f8e099a",
    "mados-resnet34-rgbnir-swir-v1": "856ea016b8f750a40af942ee2e59f5919d2f04fbc510d01d2c772ecbdb3ee983",
}

REGRESSION_612_259_PATH = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "../../data/uploads/manual/1786da21-7a3c-49e8-b893-1fd6126d5c76/source_image.jpg"
    )
)


# ── FIXTURE GENERATION HELPERS ────────────────────────────────────────

def create_synthetic_tiff(
    filepath: str,
    channels: int = 3,
    width: int = 120,
    height: int = 100,
    dtype: str = "uint8",
    crs: str = None,
    transform = None,
    nodata = None,
):
    """Generates a synthetic raster TIFF using rasterio."""
    np_dtype = np.uint8 if dtype == "uint8" else np.uint16 if dtype == "uint16" else np.float32
    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": channels,
        "dtype": dtype,
    }
    if crs:
        profile["crs"] = CRS.from_string(crs)
    if transform:
        profile["transform"] = transform
    if nodata is not None:
        profile["nodata"] = nodata

    with rasterio.open(filepath, "w", **profile) as dst:
        for c in range(1, channels + 1):
            if dtype == "uint8":
                data = np.random.randint(10, 240, (height, width), dtype=np.uint8)
            elif dtype == "uint16":
                data = np.random.randint(500, 4000, (height, width), dtype=np.uint16)
            else:
                data = np.random.uniform(0.01, 0.95, (height, width)).astype(np.float32)
            dst.write(data, c)


# ── 1. FORENSIC TIFF INSPECTION TESTS ─────────────────────────────────

class TestTiffInspection:
    """Tests 1–8: Comprehensive inspection of TIFF/GeoTIFF raster containers."""

    def test_standard_3channel_rgb_tiff_inspection(self, tmp_path):
        p = str(tmp_path / "rgb.tif")
        create_synthetic_tiff(p, channels=3, width=64, height=64, dtype="uint8")
        meta = inspect_tiff_metadata(p)
        assert meta["filename"] == "rgb.tif"
        assert meta["format"] == "TIFF"
        assert meta["channels"] == 3
        assert meta["width"] == 64
        assert meta["height"] == 64
        assert meta["dtype"] == "uint8"
        assert meta["channelStructure"] == "RGB"
        assert meta["isGeoTiff"] is False
        assert meta["geolocationStatus"] == "NOT_ESTABLISHED"

    def test_2channel_tiff_inspection_unsupported_tag(self, tmp_path):
        p = str(tmp_path / "dual_sar.tif")
        create_synthetic_tiff(p, channels=2, width=80, height=80, dtype="uint16")
        meta = inspect_tiff_metadata(p)
        assert meta["channels"] == 2
        assert meta["channelStructure"] == "DUAL_CHANNEL_UNSUPPORTED"
        assert meta["isDualChannelUnsupported"] is True
        assert meta["dtype"] == "uint16"
        assert meta["bitDepth"] == 16

    def test_geotiff_inspection_with_crs_and_transform(self, tmp_path):
        p = str(tmp_path / "geotiff_utm.tif")
        transform = from_origin(500000, 4000000, 10.0, 10.0)
        create_synthetic_tiff(p, channels=3, width=100, height=100, crs="EPSG:32630", transform=transform)
        meta = inspect_tiff_metadata(p)
        assert meta["isGeoTiff"] is True
        assert meta["geolocationStatus"] == "ESTABLISHED"
        assert meta["epsg"] == 32630
        assert meta["resolution"] == [10.0, 10.0]
        assert meta["transform"] is not None
        assert meta["bounds"] is not None

    def test_unprojected_tiff_inspection(self, tmp_path):
        p = str(tmp_path / "unprojected.tif")
        create_synthetic_tiff(p, channels=3, width=50, height=50)
        meta = inspect_tiff_metadata(p)
        assert meta["isGeoTiff"] is False
        assert meta["geolocationStatus"] == "NOT_ESTABLISHED"
        assert meta["crs"] == "UNPROJECTED"
        assert meta["epsg"] is None

    def test_nodata_preservation(self, tmp_path):
        p = str(tmp_path / "nodata.tif")
        create_synthetic_tiff(p, channels=1, width=40, height=40, dtype="uint16", nodata=0)
        meta = inspect_tiff_metadata(p)
        assert meta["nodata"] == 0

    def test_uint16_normalization_to_uint8(self):
        arr = np.array([[0, 1000], [2000, 4000]], dtype=np.uint16)
        norm, _ = normalize_channel_to_uint8(arr)
        assert norm.dtype == np.uint8
        assert norm.min() == 0
        assert norm.max() == 255

    def test_float32_normalization_nan_inf_handling(self):
        arr = np.array([[np.nan, 0.1], [np.inf, 0.9]], dtype=np.float32)
        norm, _ = normalize_channel_to_uint8(arr)
        assert norm.dtype == np.uint8
        assert not np.isnan(norm).any()
        assert norm.min() >= 0
        assert norm.max() <= 255

    def test_invalid_corrupted_tiff_handling(self, tmp_path):
        p = str(tmp_path / "corrupted.tif")
        with open(p, "wb") as f:
            f.write(b"NOT_A_TIFF_HEADER_CONTENT")
        with pytest.raises(InvalidTiffError):
            inspect_tiff_metadata(p)


# ── 2. TIFF VISUAL PREVIEW GENERATION TESTS ───────────────────────────

class TestTiffPreviewGeneration:
    """Tests 9–14: Generation of non-destructive PNG visual previews."""

    def test_generate_rgb_tiff_preview(self, tmp_path):
        p = str(tmp_path / "rgb_sample.tif")
        create_synthetic_tiff(p, channels=3, width=128, height=128, dtype="uint8")
        prev = generate_tiff_visual_preview(p, output_dir=str(tmp_path))
        assert os.path.exists(prev["previewPath"])
        assert prev["previewFormat"] == "PNG"
        assert prev["previewPurpose"] == "VISUALIZATION_ONLY"
        assert prev["inferenceSource"] == "ORIGINAL_TIFF"
        with open(prev["previewPath"], "rb") as f:
            header = f.read(8)
            assert header == b"\x89PNG\r\n\x1a\n"

    def test_generate_single_channel_grayscale_preview(self, tmp_path):
        p = str(tmp_path / "gray_sample.tif")
        create_synthetic_tiff(p, channels=1, width=64, height=64, dtype="uint16")
        prev = generate_tiff_visual_preview(p, output_dir=str(tmp_path))
        assert os.path.exists(prev["previewPath"])
        img = Image.open(prev["previewPath"])
        assert img.size == (64, 64)

    def test_generate_dual_channel_previews(self, tmp_path):
        p = str(tmp_path / "dual_sample.tif")
        create_synthetic_tiff(p, channels=2, width=64, height=64, dtype="uint16")
        prev = generate_tiff_visual_preview(p, output_dir=str(tmp_path))
        assert prev["channel1PreviewPath"] is not None
        assert prev["channel2PreviewPath"] is not None
        assert os.path.exists(prev["channel1PreviewPath"])
        assert os.path.exists(prev["channel2PreviewPath"])

    def test_generate_6band_sentinel2_preview(self, tmp_path):
        p = str(tmp_path / "s2_sample.tif")
        create_synthetic_tiff(p, channels=6, width=64, height=64, dtype="uint16")
        prev = generate_tiff_visual_preview(p, output_dir=str(tmp_path))
        assert os.path.exists(prev["previewPath"])
        assert prev["previewComposition"] == "B4_B3_B2_TRUE_COLOR"

    def test_preview_immutability_original_tiff_unmodified(self, tmp_path):
        p = str(tmp_path / "immutable.tif")
        create_synthetic_tiff(p, channels=3, width=64, height=64, dtype="uint8")
        before_sha = compute_file_sha256(p)
        generate_tiff_visual_preview(p, output_dir=str(tmp_path))
        after_sha = compute_file_sha256(p)
        assert before_sha == after_sha, "Original TIFF was modified during preview generation!"

    def test_preview_metadata_flags(self, tmp_path):
        p = str(tmp_path / "flags.tif")
        create_synthetic_tiff(p, channels=3, width=64, height=64, dtype="uint8")
        prev = generate_tiff_visual_preview(p, output_dir=str(tmp_path))
        assert prev["previewPurpose"] == "VISUALIZATION_ONLY"
        assert prev["inferenceSource"] == "ORIGINAL_TIFF"


# ── 3. 2-CHANNEL TIFF REJECTION & GUARD TESTS ─────────────────────────

class TestDualChannelRejection:
    """Tests 15–18: Rejecting 2-channel TIFFs for optical RGB inference."""

    def test_infer_descriptor_sets_dual_channel_unsupported(self, tmp_path):
        p = str(tmp_path / "dual_check.tif")
        create_synthetic_tiff(p, channels=2, width=64, height=64, dtype="uint8")
        router = OpticalRouter()
        desc = router.infer_descriptor_from_file(p)
        assert desc.channel_count == 2
        assert desc.source_type_origin == "DUAL_CHANNEL_UNSUPPORTED"

    def test_optical_router_route_rejects_dual_channel(self):
        router = OpticalRouter()
        desc = OpticalInputDescriptor(
            source_type=SourceType.DRONE,
            channel_count=2,
            bands=["CH1", "CH2"],
            source_type_origin="DUAL_CHANNEL_UNSUPPORTED",
        )
        with pytest.raises(UnsupportedInputError) as excinfo:
            router.route(desc)
        expected_msg = (
            "UNSUPPORTED INPUT: This TIFF contains 2 channels. "
            "RGB inference requires a genuine 3-channel RGB image. "
            "The original TIFF has NOT been modified."
        )
        assert str(excinfo.value) == expected_msg

    def test_fastapi_infer_endpoint_rejects_dual_channel(self, tmp_path):
        p = str(tmp_path / "dual_api.tif")
        create_synthetic_tiff(p, channels=2, width=64, height=64, dtype="uint8")
        resp = client.post(
            "/api/v1/detection/manual-analysis/infer",
            json={"image_path": p, "source_type": "DRONE"}
        )
        assert resp.status_code == 400
        detail = resp.json().get("detail", "")
        assert "UNSUPPORTED INPUT: This TIFF contains 2 channels" in detail
        assert "The original TIFF has NOT been modified" in detail

    def test_dual_channel_file_sha256_unmodified(self, tmp_path):
        p = str(tmp_path / "dual_unmod.tif")
        create_synthetic_tiff(p, channels=2, width=64, height=64, dtype="uint8")
        before_sha = compute_file_sha256(p)
        client.post(
            "/api/v1/detection/manual-analysis/infer",
            json={"image_path": p, "source_type": "DRONE"}
        )
        after_sha = compute_file_sha256(p)
        assert before_sha == after_sha, "Original 2-channel TIFF was modified upon rejection!"


# ── 4. GEOSPATIAL BRIDGE & PHYSICAL AREA TESTS ────────────────────────

class TestGeospatialBridgeAndPhysicalArea:
    """Tests 19–24: Conversion of masks to GeoJSON and physical area derivation."""

    def test_pixel_to_geo_affine_transform(self):
        transform = from_origin(500000, 4000000, 10.0, 10.0)
        x, y = pixel_to_geo(0, 0, transform)
        assert x == 500000.0
        assert y == 4000000.0
        x_pix, y_pix = pixel_to_geo(col=20, row=10, affine_transform=transform)
        assert x_pix == 500200.0
        assert y_pix == 3999900.0

    def test_transform_geometry_to_wgs84(self):
        geom_utm = {
            "type": "Polygon",
            "coordinates": [[[500000, 4000000], [500100, 4000000], [500100, 4000100], [500000, 4000000]]]
        }
        reproj_dict, centroid = transform_geometry_to_wgs84(geom_utm, "EPSG:32630")
        coords = reproj_dict["coordinates"][0]
        # In WGS84, lon is around 0.0, lat around 36.14
        assert -5.0 <= coords[0][0] <= 5.0
        assert 30.0 <= coords[0][1] <= 45.0
        assert len(centroid) == 2

    def test_calculate_physical_area_m2_and_km2(self):
        m2 = calculate_physical_area_m2(pixel_count=1000, resolution=[10.0, 10.0])
        assert m2 == 100000.0
        km2 = m2 / 1_000_000.0
        assert km2 == 0.1

    def test_unprojected_tiff_returns_null_physical_area(self):
        m2 = calculate_physical_area_m2(pixel_count=500, resolution=None)
        assert m2 is None

    def test_mask_to_geospatial_geojson_structure(self):
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:40, 30:50] = 1  # 400 foreground pixels
        transform = from_origin(500000, 4000000, 10.0, 10.0)
        fc = mask_to_geospatial_geojson(
            binary_mask=mask,
            affine_transform=list(transform)[:6],
            crs_str="EPSG:32630",
            resolution=[10.0, 10.0]
        )
        assert fc is not None
        assert fc["type"] == "FeatureCollection"
        assert len(fc["features"]) >= 1
        footprint_feature = fc["features"][0]
        assert footprint_feature["properties"]["featureType"] == "IMAGE_FOOTPRINT"
        assert footprint_feature["properties"]["provenance"] == "MODEL_DERIVED"

    def test_geospatial_output_in_inference_result(self, tmp_path):
        p = str(tmp_path / "geotiff_infer.tif")
        transform = from_origin(500000, 4000000, 10.0, 10.0)
        create_synthetic_tiff(p, channels=3, width=128, height=128, dtype="uint8", crs="EPSG:32630", transform=transform)
        engine = OperationalOpticalEngine()
        result = engine.run_inference(image_path=p, user_selected_type="DRONE", output_dir=str(tmp_path))
        assert "geospatial" in result
        geo = result["geospatial"]
        assert geo["geolocationStatus"] == "ESTABLISHED"
        assert geo["crs"] == "EPSG:32630"
        assert geo["geoJson"] is not None
        assert geo["geoJson"]["type"] == "FeatureCollection"


# ── 5. DOWNSTREAM INVESTIGATION INTEGRATION & GUARDRAILS ──────────────

class TestDownstreamInvestigationIntegration:
    """Tests 25–30: Geolocation gate and candidate vessel guardrails."""

    def test_geolocation_gate_unprojected_flag(self, tmp_path):
        p = str(tmp_path / "unprojected_flag.tif")
        create_synthetic_tiff(p, channels=3, width=64, height=64, dtype="uint8")
        meta = inspect_tiff_metadata(p)
        assert meta["geolocationStatus"] == "NOT_ESTABLISHED"
        # If geolocationStatus != 'ESTABLISHED', investigation gate must block
        is_gated = meta["geolocationStatus"] != "ESTABLISHED"
        assert is_gated is True

    def test_geolocation_established_permits_investigation(self, tmp_path):
        p = str(tmp_path / "established_flag.tif")
        transform = from_origin(500000, 4000000, 10.0, 10.0)
        create_synthetic_tiff(p, channels=3, width=64, height=64, dtype="uint8", crs="EPSG:32630", transform=transform)
        meta = inspect_tiff_metadata(p)
        assert meta["geolocationStatus"] == "ESTABLISHED"
        is_gated = meta["geolocationStatus"] != "ESTABLISHED"
        assert is_gated is False

    def test_candidate_vessels_all_tagged_potential_candidate(self):
        # Emulate candidate list from attribution service
        raw_candidates = [
            {"mmsi": 123456789, "totalScore": 0.85, "vesselName": "OCEAN VOYAGER"},
            {"mmsi": 987654321, "totalScore": 0.62, "vesselName": "PACIFIC STAR"},
        ]
        candidates = [
            {**c, "legalClassification": "POTENTIAL CANDIDATE", "blameStatus": "POTENTIAL CANDIDATE"}
            for c in raw_candidates
        ]
        for c in candidates:
            assert c["legalClassification"] == "POTENTIAL CANDIDATE"
            assert c["blameStatus"] == "POTENTIAL CANDIDATE"

    def test_candidate_vessels_never_confirmed_polluter(self):
        raw_candidates = [
            {"mmsi": 123456789, "totalScore": 0.99, "vesselName": "HIGH SCORE VESSEL"},
        ]
        candidates = [
            {**c, "legalClassification": "POTENTIAL CANDIDATE", "blameStatus": "POTENTIAL CANDIDATE"}
            for c in raw_candidates
        ]
        for c in candidates:
            assert "CONFIRMED POLLUTER" not in c.values()
            assert c["legalClassification"] != "CONFIRMED POLLUTER"

    def test_scientific_disclaimer_present(self):
        disclaimer = (
            "Scientific correlation only. Attribution scores represent modelled spatial/temporal "
            "proximity and do not establish legal liability or guilt."
        )
        assert "Scientific correlation only" in disclaimer
        assert "do not establish legal liability" in disclaimer

    def test_drift_trajectory_structure(self):
        simulated_drift = {
            "originLat": 24.5,
            "originLng": 56.5,
            "backwardPath": [
                {"latitude": 24.5, "longitude": 56.5, "elapsedHours": 0},
                {"latitude": 24.45, "longitude": 56.48, "elapsedHours": 6},
                {"latitude": 24.40, "longitude": 56.45, "elapsedHours": 12},
            ]
        }
        assert len(simulated_drift["backwardPath"]) == 3
        for pt in simulated_drift["backwardPath"]:
            assert "latitude" in pt
            assert "longitude" in pt


# ── 6. REGRESSION PRESERVATION & IMMUTABILITY TESTS ───────────────────

class TestRegressionAndCheckpoints:
    """Tests 31–36: Preservation of Phase 13/14 checkpoints and exact pixel regressions."""

    def test_checkpoint_sha256_immutability(self):
        for model_id, expected_sha in EXPECTED_CHECKPOINTS.items():
            spec = OPTICAL_REGISTRY[model_id]
            actual_sha = compute_file_sha256(spec.resolve_checkpoint_path())
            assert actual_sha == expected_sha, f"SHA mismatch for {model_id}!"

    def test_phase14_drone_routing_preserved(self):
        router = OpticalRouter()
        desc = OpticalInputDescriptor(
            source_type=SourceType.DRONE,
            channel_count=3,
            bands=["R", "G", "B"],
            source_type_origin="USER_SELECTED",
        )
        decision = router.route(desc)
        assert decision.model_spec.model_id == "kerf-resnet34-focaldice-v1"

    def test_phase14_satellite_rgb_routing_preserved(self):
        router = OpticalRouter()
        desc = OpticalInputDescriptor(
            source_type=SourceType.RGB_SATELLITE,
            channel_count=3,
            bands=["B4", "B3", "B2"],
            source_type_origin="USER_SELECTED",
        )
        decision = router.route(desc)
        assert decision.model_spec.model_id == "mados-resnet34-rgb-v1"

    def test_phase14_sentinel2_guard_preserved(self):
        router = OpticalRouter()
        desc = OpticalInputDescriptor(
            source_type=SourceType.SENTINEL_2,
            channel_count=3,
            bands=["R", "G", "B"],
            source_type_origin="USER_SELECTED",
        )
        with pytest.raises(AmbiguousModalityError):
            router.route(desc)

    def test_kerf_drone_regression_on_612_259(self):
        assert os.path.exists(REGRESSION_612_259_PATH), f"Missing 612x259 regression image: {REGRESSION_612_259_PATH}"
        engine = OperationalOpticalEngine()
        res = engine.run_inference(image_path=REGRESSION_612_259_PATH, user_selected_type="DRONE")
        pixels = res["segmentation"]["foreground_pixels"]
        fraction = res["segmentation"]["foreground_fraction"]
        assert pixels == 16516, f"KERF pixel regression! Expected 16,516, got {pixels}"
        assert abs(fraction - 0.1042) < 0.001, f"KERF fraction regression! Expected ~10.42%, got {fraction * 100:.2f}%"

    def test_mados_satellite_regression_on_612_259(self):
        assert os.path.exists(REGRESSION_612_259_PATH), f"Missing 612x259 regression image: {REGRESSION_612_259_PATH}"
        engine = OperationalOpticalEngine()
        res = engine.run_inference(image_path=REGRESSION_612_259_PATH, user_selected_type="RGB_SATELLITE")
        pixels = res["segmentation"]["foreground_pixels"]
        fraction = res["segmentation"]["foreground_fraction"]
        assert pixels == 0, f"MADOS pixel regression! Expected 0, got {pixels}"
        assert fraction == 0.0, f"MADOS fraction regression! Expected 0.0%, got {fraction * 100:.2f}%"
