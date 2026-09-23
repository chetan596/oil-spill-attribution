"""
RGB Oil Spill 3-Class Classification Model and Preprocessing (Part 0.14B.3 - V2).
Implements ResNet-18 ImageNet Transfer Learning with 3-class classification head:
  Class 0: CLEAN_OCEAN
  Class 1: LOOK_ALIKE
  Class 2: OIL_SPILL
"""

import os
import hashlib
from typing import Dict, Any, Tuple, Optional, List
import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image

MODEL_ID = "rgb-oil-classifier-resnet18-v2"
MODEL_VERSION = "2.0.0"
DEFAULT_DECISION_THRESHOLD = 0.50

CLASS_NAMES = ["CLEAN_OCEAN", "LOOK_ALIKE", "OIL_SPILL"]
CLASS_TO_IDX = {"CLEAN_OCEAN": 0, "LOOK_ALIKE": 1, "OIL_SPILL": 2}
IDX_TO_CLASS = {0: "CLEAN_OCEAN", 1: "LOOK_ALIKE", 2: "OIL_SPILL"}

NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]

INFERENCE_TRANSFORMS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD),
])


class RgbOilClassifierV2(nn.Module):
    """
    ResNet-18 based 3-class classifier for genuine optical marine imagery.
    Outputs raw 3-class logits.
    """
    def __init__(self, pretrained: bool = False, num_classes: int = 3):
        super().__init__()
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        self.backbone = models.resnet18(weights=weights)
        num_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(num_features, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(128, num_classes)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)


def compute_file_sha256(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def get_v2_checkpoint_path() -> str:
    candidates = [
        os.path.join(os.path.dirname(__file__), "rgb_oil_classifier_v2/rgb_oil_classifier_v2.pth"),
        os.path.join(os.path.dirname(__file__), "rgb_oil_classifier_v2.pth"),
        os.path.abspath("services/ml-python/app/models/rgb_oil_classifier_v2/rgb_oil_classifier_v2.pth"),
        os.path.abspath("ml/experiments/results/rgb_oil_classifier_v2/rgb_oil_classifier_v2.pth"),
    ]
    for p in candidates:
        norm_p = os.path.normpath(p)
        if os.path.exists(norm_p):
            return norm_p
    raise FileNotFoundError("RGB Oil Classifier v2 checkpoint 'rgb_oil_classifier_v2.pth' not found.")


def load_rgb_classifier_v2(
    checkpoint_path: Optional[str] = None,
    device: Optional[torch.device] = None,
    decision_threshold: float = DEFAULT_DECISION_THRESHOLD
) -> Tuple[RgbOilClassifierV2, Dict[str, Any]]:
    if checkpoint_path is None:
        checkpoint_path = get_v2_checkpoint_path()

    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Checkpoint file not found: {checkpoint_path}")

    sha256 = compute_file_sha256(checkpoint_path)
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = RgbOilClassifierV2(pretrained=False, num_classes=3)
    state_dict = torch.load(checkpoint_path, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()

    metadata = {
        "model_id": MODEL_ID,
        "version": MODEL_VERSION,
        "architecture": "ResNet-18 (ImageNet Pretrained Transfer Learning + 3-Class Head)",
        "num_classes": 3,
        "classes": CLASS_NAMES,
        "checkpoint_path": checkpoint_path,
        "checkpoint_sha256": sha256,
        "device": str(device),
        "decision_threshold": decision_threshold,
    }
    return model, metadata


def predict_optical_image(
    model: RgbOilClassifierV2,
    image: Image.Image,
    decision_threshold: float = DEFAULT_DECISION_THRESHOLD,
    device: Optional[torch.device] = None
) -> Dict[str, Any]:
    """
    Deterministic inference function returning 3-class probabilities and binary oil decision.
    """
    if device is None:
        device = next(model.parameters()).device

    image_rgb = image.convert("RGB")
    tensor = INFERENCE_TRANSFORMS(image_rgb).unsqueeze(0).to(device)

    model.eval()
    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()

    clean_prob = float(probs[0])
    look_alike_prob = float(probs[1])
    oil_prob = float(probs[2])
    non_oil_prob = float(clean_prob + look_alike_prob)

    pred_class_idx = int(probs.argmax())
    pred_class_name = CLASS_NAMES[pred_class_idx]
    confidence = float(probs[pred_class_idx])

    # Binary classification decision based on tuned threshold
    is_oil = oil_prob >= decision_threshold
    binary_decision = "OIL_SPILL_DETECTED" if is_oil else "NO_OIL_SPILL_DETECTED"

    return {
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "predicted_class": pred_class_name,
        "confidence": confidence,
        "probabilities": {
            "clean_ocean": clean_prob,
            "look_alike": look_alike_prob,
            "oil_spill": oil_prob,
            "non_oil": non_oil_prob
        },
        "oil_probability": oil_prob,
        "clean_probability": clean_prob,
        "look_alike_probability": look_alike_prob,
        "oil_vs_non_oil_probability": oil_prob,
        "decision_threshold": decision_threshold,
        "binary_decision": binary_decision,
        "is_oil_spill": is_oil
    }
