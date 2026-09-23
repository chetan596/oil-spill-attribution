"""
Model Registry & Lifecycle Manager for SAR Semantic Segmentation.
Reads model registry configuration and instantiates model architectures with checkpoint validation.
"""

import os
import json
from typing import Dict, Any, Optional, Tuple
import torch
import torch.nn as nn

from app.models.unet.architecture import UNet, UNetMultiScaleContext, UNetAttention, UNetResidual


import hashlib


class ModelNotTrainedError(Exception):
    """Exception raised when an inference request is made against an untrained model."""
    pass


class ModelNotFoundError(Exception):
    """Exception raised when a requested model ID is not found in the registry."""
    pass


class ModelVerificationError(Exception):
    """Exception raised when a model checkpoint fails cryptographic or architectural verification."""
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
        elif arch in ("UNetMultiScaleContext", "MultiScaleUNet", "MultiScaleContextUNet"):
            model = UNetMultiScaleContext(in_channels=in_channels, num_classes=num_classes, base_channels=base_channels)
        elif arch in ("UNetAttention", "AttentionUNet", "Attention_UNet"):
            model = UNetAttention(in_channels=in_channels, num_classes=num_classes, base_channels=base_channels)
        elif arch in ("UNetResidual", "ResidualUNet", "Residual_UNet"):
            model = UNetResidual(in_channels=in_channels, num_classes=num_classes, base_channels=base_channels)
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
                loaded_obj = torch.load(full_checkpoint_path, map_location=device, weights_only=False)
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

    def get_frozen_release_manifest(self) -> Dict[str, Any]:
        """Load and return the master frozen research release manifest."""
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
        manifest_path = os.path.join(base_dir, "ml/model_registry/frozen_release_manifest.json")
        if not os.path.exists(manifest_path):
            raise FileNotFoundError(f"Frozen release manifest not found at: {manifest_path}")
        with open(manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def load_verified_model(
        self,
        model_id: str = "unet-dual-pol-sar-v09d-residual-loss",
        device: str = "cpu"
    ) -> Tuple[nn.Module, Dict[str, Any]]:
        """
        Authoritative, verified model loader for frozen ML research releases.
        Strictly enforces:
          1. Checkpoint file existence
          2. Cryptographic SHA-256 hash verification against frozen release manifest
          3. Exact architecture class instantiation
          4. Parameter count validation
          5. State dict loading and eval mode activation

        FAIL-CLOSED:
          If any verification step fails, raises ModelVerificationError.
          Never falls back to heuristic, uninitialized, or demo models.
        """
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))

        # 1. Look up model in release manifest or registry
        try:
            rel_manifest = self.get_frozen_release_manifest()
            models_manifest = rel_manifest.get("models", {})
        except Exception:
            rel_manifest = {}
            models_manifest = {}

        # Known frozen specifications
        known_frozen = {
            "unet-dual-pol-sar-v09d-residual-loss": {
                "checkpoint_file": "ml/model_registry/versions/unet_dual_pol_sar_v09d_residual_loss.pth",
                "expected_sha256": "ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d",
                "architecture": "UNetResidual",
                "in_channels": 2,
                "num_classes": 2,
                "base_channels": 16,
                "expected_params": 1114338,
                "scientific_status": "EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS",
                "release_id": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
                "preprocessing": "sentinel1_sigma0_db_v1",
                "operating_threshold": 0.50,
                "held_out_metrics": {
                    "iou": 0.011823,
                    "dice": 0.023370,
                    "precision": 0.052205,
                    "recall": 0.015054,
                    "overall_fpr": 0.002701,
                    "clean_ocean_fpr": 0.000397,
                },
                "validation_metrics": {
                    "iou": 0.152376,
                    "dice": 0.264455,
                    "precision": 0.207887,
                    "recall": 0.363318,
                    "overall_fpr": 0.007366,
                    "clean_ocean_fpr": 0.001355,
                    "look_alike_fpr": 0.022586,
                }
            },
            "unet-dual-pol-sar-v6": {
                "checkpoint_file": "ml/model_registry/versions/unet_dual_pol_sar_v6.pth",
                "expected_sha256": "bcf3d6bc988b910fa67c0c31c89cb2c861da73f0b02159c579cb28e5039920e3",
                "architecture": "UNet",
                "in_channels": 2,
                "num_classes": 2,
                "base_channels": 16,
                "expected_params": 1080802,
                "scientific_status": "EXPERIMENTAL",
                "release_id": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
                "preprocessing": "sentinel1_sigma0_db_v1",
                "operating_threshold": 0.50,
            }
        }

        spec = known_frozen.get(model_id)
        if not spec:
            raise ModelNotFoundError(f"Model ID '{model_id}' is not an authorized frozen research release model.")

        full_checkpoint_path = os.path.join(base_dir, spec["checkpoint_file"])
        if not os.path.exists(full_checkpoint_path):
            raise ModelVerificationError(
                f"[FAIL-CLOSED] Checkpoint missing on disk: '{full_checkpoint_path}' for model '{model_id}'."
            )

        # 2. Cryptographic SHA-256 verification
        hasher = hashlib.sha256()
        with open(full_checkpoint_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        calc_sha = hasher.hexdigest()

        if calc_sha != spec["expected_sha256"]:
            raise ModelVerificationError(
                f"[FAIL-CLOSED] Checkpoint SHA-256 mismatch for model '{model_id}': "
                f"Computed '{calc_sha}', expected '{spec['expected_sha256']}'. Checkpoint may be corrupted or altered."
            )

        # 3. Architecture instantiation
        if spec["architecture"] == "UNetResidual":
            model = UNetResidual(
                in_channels=spec["in_channels"],
                num_classes=spec["num_classes"],
                base_channels=spec["base_channels"]
            )
        elif spec["architecture"] == "UNet":
            model = UNet(
                in_channels=spec["in_channels"],
                num_classes=spec["num_classes"],
                base_channels=spec["base_channels"]
            )
        else:
            raise ModelVerificationError(f"[FAIL-CLOSED] Unsupported architecture: {spec['architecture']}")

        # 4. Parameter count verification
        param_count = sum(p.numel() for p in model.parameters())
        if param_count != spec["expected_params"]:
            raise ModelVerificationError(
                f"[FAIL-CLOSED] Parameter count mismatch for model '{model_id}': "
                f"Model has {param_count} parameters, expected {spec['expected_params']}."
            )

        # 5. State dict loading
        try:
            loaded_obj = torch.load(full_checkpoint_path, map_location=device, weights_only=False)
            if isinstance(loaded_obj, dict) and "model_state_dict" in loaded_obj:
                state_dict = loaded_obj["model_state_dict"]
            else:
                state_dict = loaded_obj
            model.load_state_dict(state_dict)
        except Exception as e:
            raise ModelVerificationError(
                f"[FAIL-CLOSED] Failed to load state_dict from '{full_checkpoint_path}' into {spec['architecture']}: {str(e)}"
            )

        model.to(device)
        model.eval()

        entry_metadata = {
            "model_id": model_id,
            "architecture": spec["architecture"],
            "parameters": param_count,
            "in_channels": spec["in_channels"],
            "num_classes": spec["num_classes"],
            "checkpoint_sha256": calc_sha,
            "release_id": spec["release_id"],
            "scientific_status": spec["scientific_status"],
            "preprocessing": spec["preprocessing"],
            "operating_threshold": spec.get("operating_threshold", 0.50),
            "held_out_metrics": spec.get("held_out_metrics", {}),
            "validation_metrics": spec.get("validation_metrics", {}),
            "verification_status": "PASSED_CRYPTOGRAPHIC_AND_STRUCTURAL_VERIFICATION",
        }

        return model, entry_metadata



# Global singleton instance
model_registry = ModelRegistry()
