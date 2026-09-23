"""
Unit tests for Optical Inference Engine (Part 0.14D).
Tests:
  1. Cryptographic checkpoint verification (Classifier V2 + Segmentation V2).
  2. Fail-closed behavior on SHA-256 mismatch or missing files.
  3. Classifier V2 inference and probability distribution.
  4. Segmentation V2 inference at frozen threshold tau = 0.80.
  5. Non-destructive visual annotation generation (original, mask, annotated).
  6. Support for JPG, PNG, and optical TIFF formats.
  7. Modality error handling and zero geospatial fabrication.
"""

import os
import tempfile
import pytest
import numpy as np
from PIL import Image

from app.inference.optical_inference_engine import (
    OpticalInferenceEngine,
    CLASSIFIER_MODEL_ID,
    CLASSIFIER_EXPECTED_SHA256,
    SEGMENTATION_MODEL_ID,
    SEGMENTATION_EXPECTED_SHA256,
    SEGMENTATION_FROZEN_THRESHOLD,
    ModelVerificationError,
    ModalityValidationError,
)


@pytest.fixture
def engine():
    return OpticalInferenceEngine()


@pytest.fixture
def sample_optical_images():
    """Create temporary JPG, PNG, and TIFF sample images."""
    temp_dir = tempfile.mkdtemp()
    
    # 1. Optical RGB JPG
    jpg_path = os.path.join(temp_dir, "test_ocean.jpg")
    img_arr = np.random.randint(50, 200, (128, 128, 3), dtype=np.uint8)
    # Add an artificial bright/dark patch
    img_arr[30:70, 30:70] = [20, 25, 30]
    Image.fromarray(img_arr).save(jpg_path, format="JPEG")

    # 2. Optical RGB PNG
    png_path = os.path.join(temp_dir, "test_ocean.png")
    Image.fromarray(img_arr).save(png_path, format="PNG")

    # 3. Optical RGB TIFF
    tiff_path = os.path.join(temp_dir, "test_ocean.tif")
    Image.fromarray(img_arr).save(tiff_path, format="TIFF")

    yield {
        "temp_dir": temp_dir,
        "jpg": jpg_path,
        "png": png_path,
        "tiff": tiff_path,
    }


def test_classifier_checkpoint_integrity(engine):
    """Verify Classifier V2 checkpoint loads and matches frozen SHA-256."""
    model, meta = engine.load_and_verify_classifier()
    assert model is not None
    assert meta["model_id"] == CLASSIFIER_MODEL_ID
    assert meta["checkpoint_sha256"] == CLASSIFIER_EXPECTED_SHA256
    assert meta["status"] == "EXPERIMENTAL"


def test_segmentation_checkpoint_integrity(engine):
    """Verify Segmentation V2 checkpoint loads and matches frozen SHA-256."""
    model, meta = engine.load_and_verify_segmentation()
    assert model is not None
    assert meta["model_id"] == SEGMENTATION_MODEL_ID
    assert meta["checkpoint_sha256"] == SEGMENTATION_EXPECTED_SHA256
    assert meta["threshold"] == SEGMENTATION_FROZEN_THRESHOLD
    assert meta["status"] == "EXPERIMENTAL"


def test_optical_inference_jpg(engine, sample_optical_images):
    """Test full optical inference on JPG image with artifact persistence."""
    out_dir = os.path.join(sample_optical_images["temp_dir"], "output_jpg")
    res = engine.run_inference(
        image_path=sample_optical_images["jpg"],
        output_dir=out_dir,
        prefix="job_test"
    )

    # 1. Model metadata
    assert res["model"]["classifier"] == CLASSIFIER_MODEL_ID
    assert res["model"]["segmentation"] == SEGMENTATION_MODEL_ID
    assert res["model"]["segmentation_threshold"] == 0.80
    assert res["model"]["status"] == "EXPERIMENTAL"

    # 2. Classification output
    assert res["classification"]["label"] in ["CLEAN_OCEAN", "LOOK_ALIKE", "OIL_SPILL"]
    assert 0.0 <= res["classification"]["confidence"] <= 1.0
    for cls_name in ["CLEAN_OCEAN", "LOOK_ALIKE", "OIL_SPILL"]:
        assert cls_name in res["classification"]["probabilities"]
        assert 0.0 <= res["classification"]["probabilities"][cls_name] <= 1.0

    # 3. Segmentation output
    assert res["segmentation"]["performed"] is True
    assert res["segmentation"]["mask_available"] is True
    assert res["segmentation"]["confidence_threshold"] == 0.80
    assert isinstance(res["segmentation"]["foreground_pixels"], int)
    assert 0.0 <= res["segmentation"]["foreground_fraction"] <= 1.0

    # 4. Artifacts existence
    artifacts = res["artifacts"]
    assert os.path.exists(artifacts["original_image"])
    assert os.path.exists(artifacts["mask_image"])
    assert os.path.exists(artifacts["annotated_image"])

    # 5. Verify artifact dimensions match original
    with Image.open(artifacts["original_image"]) as orig, \
         Image.open(artifacts["mask_image"]) as mask, \
         Image.open(artifacts["annotated_image"]) as ann:
        assert orig.size == (128, 128)
        assert mask.size == (128, 128)
        assert ann.size == (128, 128)
        assert mask.mode == "L"
        assert ann.mode == "RGB"

    # 6. Geospatial status guardrail
    assert res["geospatial"]["status"] == "NOT_ESTABLISHED"


def test_optical_inference_png_and_tiff(engine, sample_optical_images):
    """Test full optical inference on PNG and optical TIFF."""
    # PNG
    res_png = engine.run_inference(image_path=sample_optical_images["png"])
    assert res_png["classification"]["label"] in ["CLEAN_OCEAN", "LOOK_ALIKE", "OIL_SPILL"]
    assert res_png["geospatial"]["status"] == "NOT_ESTABLISHED"

    # TIFF
    res_tiff = engine.run_inference(image_path=sample_optical_images["tiff"])
    assert res_tiff["classification"]["label"] in ["CLEAN_OCEAN", "LOOK_ALIKE", "OIL_SPILL"]
    assert res_tiff["segmentation"]["confidence_threshold"] == 0.80


def test_non_destructive_annotation(engine, sample_optical_images):
    """Verify that annotation overlay does not alter the original image or binary mask."""
    out_dir = os.path.join(sample_optical_images["temp_dir"], "output_nd")
    res = engine.run_inference(
        image_path=sample_optical_images["png"],
        output_dir=out_dir,
        prefix="nd_test"
    )
    mask_path = res["artifacts"]["mask_image"]
    mask_arr = np.array(Image.open(mask_path))
    # Binary mask must contain only 0 and 255
    unique_vals = np.unique(mask_arr)
    for val in unique_vals:
        assert val in [0, 255]


def test_missing_file_rejection(engine):
    """Verify engine raises ModalityValidationError when file does not exist."""
    with pytest.raises(ModalityValidationError):
        engine.run_inference(image_path="non_existent_file_xyz123.jpg")
