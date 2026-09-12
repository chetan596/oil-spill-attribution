"""
Unit Tests for Model Registry & Weight Loader.
Tests registry schema, untrained model exception raising, and fallback behavior.
"""

import pytest
from app.models.registry import ModelRegistry, ModelNotTrainedError, ModelNotFoundError


def test_registry_loading():
    registry = ModelRegistry()
    entry = registry.get_model_entry("unet-sar-oil-spill-v1")
    assert entry["architecture"] == "UNet"
    assert entry["status"] == "untrained"
    assert entry["in_channels"] == 1


def test_registry_unknown_model():
    registry = ModelRegistry()
    with pytest.raises(ModelNotFoundError):
        registry.get_model_entry("non_existent_model_id")


def test_registry_untrained_model_raises_error():
    registry = ModelRegistry()
    with pytest.raises(ModelNotTrainedError) as exc:
        registry.load_model("unet-sar-oil-spill-v1", allow_untrained=False)
    assert "untrained" in str(exc.value)


def test_registry_allow_untrained():
    registry = ModelRegistry()
    model, entry = registry.load_model("unet-sar-oil-spill-v1", allow_untrained=True)
    assert model is not None
    assert entry["model_id"] == "unet-sar-oil-spill-v1"
