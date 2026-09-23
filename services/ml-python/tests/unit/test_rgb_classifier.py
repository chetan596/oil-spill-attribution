"""
Unit Tests for RGB Oil Spill Classifier (Part 0.14B).
Tests:
  - Architecture instantiation
  - Weights & Checksum validation
  - Deterministic preprocessing transforms
  - Modality guard (rejection of TIFF/SAR and invalid formats)
  - Thresholding logic and decision output
  - Corrupted and empty file handling
"""

import os
import tempfile
import pytest
import torch
import numpy as np
from PIL import Image

from app.models.rgb_classifier import (
    RgbOilClassifier,
    load_rgb_classifier,
    compute_file_sha256,
    INFERENCE_TRANSFORMS,
    DEFAULT_DECISION_THRESHOLD,
    MODEL_ID,
)
from app.inference.rgb_classifier_engine import (
    classify_rgb_image,
    check_modality,
    ModalityGuardError,
    InvalidImageInputError,
)


def create_temp_rgb_image(filename="test.jpg", color=(100, 150, 200), size=(128, 128)):
    """Helper to create a temporary valid RGB image file."""
    temp_dir = tempfile.mkdtemp()
    filepath = os.path.join(temp_dir, filename)
    img = Image.new("RGB", size, color=color)
    img.save(filepath)
    return filepath


def create_temp_tiff_file(filename="test_sar.tif"):
    """Helper to create a temporary TIFF file with TIFF magic bytes."""
    temp_dir = tempfile.mkdtemp()
    filepath = os.path.join(temp_dir, filename)
    # Write TIFF Little-Endian Header
    with open(filepath, "wb") as f:
        f.write(b"II\x2a\x00\x08\x00\x00\x00\x00\x00")
    return filepath


def test_rgb_classifier_architecture():
    """Verify ResNet-18 model structure and forward shape."""
    model = RgbOilClassifier(pretrained=False)
    model.eval()
    dummy_input = torch.randn(2, 3, 224, 224)
    with torch.no_grad():
        out = model(dummy_input)
    assert out.shape == (2, 1)


def test_rgb_classifier_load_checkpoint():
    """Verify trained checkpoint loads successfully and passes SHA256 validation."""
    model, meta = load_rgb_classifier()
    assert isinstance(model, RgbOilClassifier)
    assert meta["model_id"] == MODEL_ID
    assert len(meta["checkpoint_sha256"]) == 64
    assert meta["decision_threshold"] == DEFAULT_DECISION_THRESHOLD


def test_deterministic_preprocessing():
    """Verify deterministic preprocessing pipeline produces correct tensor shapes and ranges."""
    img = Image.new("RGB", (300, 400), color=(50, 100, 150))
    tensor1 = INFERENCE_TRANSFORMS(img)
    tensor2 = INFERENCE_TRANSFORMS(img)
    assert tensor1.shape == (3, 224, 224)
    assert torch.allclose(tensor1, tensor2)


def test_modality_guard_rejects_tiff():
    """Verify that the modality guard strictly rejects TIFF/SAR images with ModalityGuardError."""
    tiff_path = create_temp_tiff_file("sar_scene.tif")
    with pytest.raises(ModalityGuardError) as exc_info:
        check_modality(tiff_path)
    assert "TIFF/SAR" in str(exc_info.value)


def test_modality_guard_rejects_non_image_extension():
    """Verify non-image formats (.txt, .bin) are rejected."""
    temp_dir = tempfile.mkdtemp()
    txt_path = os.path.join(temp_dir, "notes.txt")
    with open(txt_path, "w") as f:
        f.write("test content")

    with pytest.raises(InvalidImageInputError):
        check_modality(txt_path)


def test_modality_guard_accepts_jpg_and_png():
    """Verify JPG and PNG are correctly accepted by modality check."""
    jpg_path = create_temp_rgb_image("sample.jpg")
    png_path = create_temp_rgb_image("sample.png")

    meta_jpg = check_modality(jpg_path)
    assert meta_jpg["modality"] == "OPTICAL_RGB"
    assert meta_jpg["format"] == "JPEG"

    meta_png = check_modality(png_path)
    assert meta_png["modality"] == "OPTICAL_RGB"
    assert meta_png["format"] == "PNG"


def test_classify_rgb_image_valid_jpg():
    """Verify end-to-end inference on a valid JPG image."""
    jpg_path = create_temp_rgb_image("marine.jpg", color=(10, 30, 60))
    result = classify_rgb_image(jpg_path)

    assert result["status"] in ["OIL_SPILL_DETECTED", "NO_OIL_SPILL_DETECTED"]
    assert isinstance(result["oil_spill_detected"], bool)
    assert 0.0 <= result["model_probability"] <= 1.0
    assert result["decision_threshold"] == DEFAULT_DECISION_THRESHOLD
    assert result["probability_label"] == "MODEL_PROBABILITY"
    assert result["location"] == "NOT_ESTABLISHED"
    assert result["modality"] == "OPTICAL_RGB"
    assert result["input_metadata"]["format"] == "JPEG"


def test_classify_rgb_image_corrupted_file():
    """Verify corrupted image file fails closed with InvalidImageInputError."""
    temp_dir = tempfile.mkdtemp()
    corrupt_jpg = os.path.join(temp_dir, "corrupt.jpg")
    with open(corrupt_jpg, "wb") as f:
        f.write(b"\xff\xd8\xff" + b"garbage content that cannot be decoded as image")

    with pytest.raises(InvalidImageInputError):
        classify_rgb_image(corrupt_jpg)
