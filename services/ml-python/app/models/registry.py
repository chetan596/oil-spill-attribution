"""
Model Registry & Lifecycle Manager for SAR Semantic Segmentation.
Reads model registry configuration and instantiates model architectures with checkpoint validation.
"""

import os
import json
from typing import Dict, Any, Optional, Tuple
import torch
import torch.nn as nn

from app.models.unet.architecture import UNet


class ModelNotTrainedError(Exception):
    """Exception raised when an inference request is made against an untrained model."""
    pass


class ModelNotFoundError(Exception):
    """Exception raised when a requested model ID is not found in the registry."""
    pass


class ModelRegistry:
    def __init__(self, registry_path: Optional[str] = None):
        if registry_path is None:
            # Look in ml/model_registry/registry.json relative to repository root
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
            registry_path = os.path.join(base_dir, "ml/model_registry/registry.json")
        self.registry_path = registry_path
        self._registry_data = self._load_registry()

    def _load_registry(self) -> Dict[str, Any]:
        if os.path.exists(self.registry_path):
            try:
                with open(self.registry_path, "r") as f:
                    return json.load(f)
            except Exception as e:
                print(f"[ModelRegistry] Warning: Could not parse registry JSON: {e}")
        return {
            "registry_version": "1.0",
            "active_model_id": "unet-sar-oil-spill-v1",
            "models": [
                {
                    "model_id": "unet-sar-oil-spill-v1",
                    "architecture": "UNet",
                    "in_channels": 1,
                    "num_classes": 2,
                    "status": "untrained",
                    "checkpoint_path": "ml/model_registry/versions/unet_sar_oil_spill_v1.pth",
                }
            ],
        }

    def get_model_entry(self, model_id: Optional[str] = None) -> Dict[str, Any]:
        target_id = model_id or self._registry_data.get("active_model_id", "unet-sar-oil-spill-v1")
        for entry in self._registry_data.get("models", []):
            if entry.get("model_id") == target_id:
                return entry
        raise ModelNotFoundError(f"Model '{target_id}' not found in registry.")

    def load_model(
        self,
        model_id: Optional[str] = None,
        device: str = "cpu",
        allow_untrained: bool = False
    ) -> Tuple[nn.Module, Dict[str, Any]]:
        """
        Load model instance and optionally weights from checkpoint.

        Args:
            model_id: Registry model ID.
            device: 'cpu' or 'cuda'.
            allow_untrained: If True, returns uninitialized model without weights for testing.

        Returns:
            Tuple of (model: nn.Module, model_entry: Dict)

        Raises:
            ModelNotTrainedError: If checkpoint is missing and allow_untrained is False.
        """
        entry = self.get_model_entry(model_id)
        arch = entry.get("architecture", "UNet")
        in_channels = entry.get("in_channels", 1)
        num_classes = entry.get("num_classes", 2)
        status = entry.get("status", "untrained")
        checkpoint_path = entry.get("checkpoint_path", "")

        # Resolve relative checkpoint path
        if checkpoint_path and not os.path.isabs(checkpoint_path):
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
            full_checkpoint_path = os.path.join(base_dir, checkpoint_path)
        else:
            full_checkpoint_path = checkpoint_path

        # Extract hyperparameters
        base_channels = entry.get("hyperparameters", {}).get("base_channels", entry.get("base_channels", 32))

        # Check weights existence first so we can extract architecture metadata if saved
        weights_exist = os.path.exists(full_checkpoint_path) and os.path.isfile(full_checkpoint_path)
        loaded_obj = None

        if weights_exist:
            try:
                loaded_obj = torch.load(full_checkpoint_path, map_location=device)
                if isinstance(loaded_obj, dict) and "hyperparameters" in loaded_obj:
                    ckpt_hp = loaded_obj["hyperparameters"]
                    if "base_channels" in ckpt_hp:
                        base_channels = ckpt_hp["base_channels"]
            except Exception as e:
                pass

        # Instantiate architecture
        if arch == "UNet":
            model = UNet(in_channels=in_channels, num_classes=num_classes, base_channels=base_channels)
        else:
            raise ValueError(f"Unsupported architecture: {arch}")

        if not weights_exist:
            if not allow_untrained and status != "production":
                raise ModelNotTrainedError(
                    f"Model '{entry.get('model_id')}' status is '{status}'. "
                    f"Trained checkpoint '{checkpoint_path}' is not present on disk. "
                    "Real ML inference requires trained weights. "
                    "Set DEMO_MODE=true in environment to use deterministic demonstration scenario."
                )

        if weights_exist:
            try:
                loaded_obj = torch.load(full_checkpoint_path, map_location=device)
                if isinstance(loaded_obj, dict) and "model_state_dict" in loaded_obj:
                    state_dict = loaded_obj["model_state_dict"]
                else:
                    state_dict = loaded_obj
                model.load_state_dict(state_dict)
                print(f"[ModelRegistry] Successfully loaded weights from {full_checkpoint_path}")
            except Exception as e:
                if not allow_untrained:
                    raise RuntimeError(f"Failed to load state_dict from {full_checkpoint_path}: {e}")

        model.to(device)
        model.eval()
        return model, entry


# Global singleton instance
model_registry = ModelRegistry()
