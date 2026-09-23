"""
Unit tests for RGB Oil Spill Classifier V2 (Part 0.14B.3)
"""

import os
import json
import torch
import numpy as np
from PIL import Image
from pathlib import Path
import pytest

from app.models.rgb_classifier_v2 import (
    RgbOilClassifierV2,
    load_rgb_classifier_v2,
    predict_optical_image,
    CLASS_NAMES,
    CLASS_TO_IDX,
    INFERENCE_TRANSFORMS,
    MODEL_ID,
    MODEL_VERSION
)
from app.models.rgb_classifier import load_rgb_classifier as load_v1_classifier


def test_v2_model_initialization_and_architecture():
    model = RgbOilClassifierV2(pretrained=False, num_classes=3)
    assert isinstance(model, torch.nn.Module)
    dummy_input = torch.randn(2, 3, 224, 224)
    output = model(dummy_input)
    assert output.shape == (2, 3), f"Expected shape (2, 3), got {output.shape}"


def test_v2_checkpoint_loading_and_metadata():
    model, meta = load_rgb_classifier_v2()
    assert meta["model_id"] == "rgb-oil-classifier-resnet18-v2"
    assert meta["version"] == "2.0.0"
    assert meta["num_classes"] == 3
    assert meta["classes"] == ["CLEAN_OCEAN", "LOOK_ALIKE", "OIL_SPILL"]
    assert os.path.exists(meta["checkpoint_path"])
    assert len(meta["checkpoint_sha256"]) == 64


def test_v2_inference_probability_properties():
    model, _ = load_rgb_classifier_v2()
    img = Image.fromarray(np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8))
    result = predict_optical_image(model, img, decision_threshold=0.30)

    assert result["model_id"] == "rgb-oil-classifier-resnet18-v2"
    assert result["predicted_class"] in CLASS_NAMES
    probs = result["probabilities"]

    # Softmax probabilities must sum to 1.0
    prob_sum = probs["clean_ocean"] + probs["look_alike"] + probs["oil_spill"]
    assert abs(prob_sum - 1.0) < 1e-5, f"Probabilities do not sum to 1.0: {prob_sum}"

    assert 0.0 <= result["oil_probability"] <= 1.0
    assert 0.0 <= result["confidence"] <= 1.0
    assert result["binary_decision"] in ["OIL_SPILL_DETECTED", "NO_OIL_SPILL_DETECTED"]
    assert result["is_oil_spill"] == (result["oil_probability"] >= 0.30)


def test_v2_deterministic_preprocessing():
    img = Image.fromarray(np.ones((300, 400, 3), dtype=np.uint8) * 128)
    t1 = INFERENCE_TRANSFORMS(img)
    t2 = INFERENCE_TRANSFORMS(img)
    assert torch.allclose(t1, t2), "Inference transform is non-deterministic!"
    assert t1.shape == (3, 224, 224)


def test_v1_checkpoint_remains_intact_and_unmodified():
    v1_model, v1_meta = load_v1_classifier()
    assert v1_meta["model_id"] == "rgb-oil-classifier-resnet18-v1"
    assert v1_meta["version"] == "1.0.0"
    assert os.path.exists(v1_meta["checkpoint_path"])
