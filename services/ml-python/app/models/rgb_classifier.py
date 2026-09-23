"""
RGB Oil Spill Binary Classification Model and Preprocessing (Part 0.14B).
Implements ResNet-18 ImageNet Transfer Learning with custom binary classification head.
"""

import os
import hashlib
from typing import Dict, Any, Tuple, Optional
import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image

MODEL_ID = "rgb-oil-classifier-resnet18-v1"
MODEL_VERSION = "1.0.0"
DEFAULT_DECISION_THRESHOLD = 0.80

# Normalization constants aligned with ImageNet transfer learning
NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]

# Deterministic Evaluation/Inference Transform
INFERENCE_TRANSFORMS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD),
])


class RgbOilClassifier(nn.Module):
    """
    ResNet-18 based binary classifier for RGB marine imagery.
    Outputs raw logit for binary cross entropy / sigmoid activation.
    """
    def __init__(self, pretrained: bool = False):
        super().__init__()
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        self.backbone = models.resnet18(weights=weights)
        num_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(num_features, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(128, 1)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)


def get_checkpoint_path() -> str:
    """
    Locate the trained checkpoint file from service or ml directory.
    """
    candidates = [
        os.path.join(os.path.dirname(__file__), "rgb_oil_classifier_v1.pth"),
        os.path.join(os.path.dirname(__file__), "../../..", "ml/model_registry/versions/rgb_oil_classifier_v1.pth"),
        os.path.abspath("ml/model_registry/versions/rgb_oil_classifier_v1.pth"),
        os.path.abspath("services/ml-python/app/models/rgb_oil_classifier_v1.pth"),
    ]
    for p in candidates:
        norm_p = os.path.normpath(p)
        if os.path.exists(norm_p):
            return norm_p
    raise FileNotFoundError(f"RGB Oil Classifier checkpoint 'rgb_oil_classifier_v1.pth' not found in candidate paths.")


def compute_file_sha256(filepath: str) -> str:
    """Compute SHA-256 hex digest of a file."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def load_rgb_classifier(
    checkpoint_path: Optional[str] = None,
    device: Optional[torch.device] = None
) -> Tuple[RgbOilClassifier, Dict[str, Any]]:
    """
    Load trained weights into RgbOilClassifier, verify state dict, and set to eval mode.
    """
    if checkpoint_path is None:
        checkpoint_path = get_checkpoint_path()

    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Checkpoint file not found: {checkpoint_path}")

    sha256 = compute_file_sha256(checkpoint_path)
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = RgbOilClassifier(pretrained=False)
    state_dict = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    metadata = {
        "model_id": MODEL_ID,
        "version": MODEL_VERSION,
        "architecture": "ResNet-18 (ImageNet Transfer Learning + Custom Binary Head)",
        "checkpoint_path": checkpoint_path,
        "checkpoint_sha256": sha256,
        "device": str(device),
        "decision_threshold": DEFAULT_DECISION_THRESHOLD,
    }
    return model, metadata
