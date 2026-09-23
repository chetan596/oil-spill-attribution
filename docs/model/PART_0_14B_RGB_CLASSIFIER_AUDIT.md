# Part 0.14B — Optical RGB Oil vs Non-Oil Classifier Scientific Audit Report

**Release**: `OG-RGB-ML-RESEARCH-RELEASE-V0.14B`  
**Model Identifier**: `rgb-oil-classifier-resnet18-v1`  
**Version**: `1.0.0`  
**Framework**: PyTorch (`torchvision.models.resnet18`)  
**Hardware Executed**: NVIDIA GeForce RTX 5050 Laptop GPU (`cuda:0`)  
**Timestamp**: 2026-09-19T21:17:09Z  

---

## 1. Executive Summary

Part 0.14B establishes the first dedicated **optical RGB (JPG, JPEG, PNG) marine oil-spill binary classification system** in Ocean Guard AI.

### Core Scientific Guardrails
1. **Modality Separation**: The SAR segmentation network (V09D dual-pol) is strictly separated from ordinary optical RGB images. Multi-band scientific GeoTIFF rasters are rejected by the optical classifier and routed to SAR processing.
2. **Zero Test-Set Leakage**: Split boundaries were created strictly at the acquisition and scene level, preventing duplicate and near-duplicate leakage.
3. **Locked Held-Out Evaluation**: Operating decision thresholds were established solely from the validation split and frozen prior to evaluating the held-out test set once.
4. **Authentic Reporting**: Metrics reflect raw, measured performance without fabrication or exaggerated 100% claims.

---

## 2. Dataset Architecture & Manifest

- **Total Curated Optical Images**: 617 samples across 3 distinct classes
- **Classes**:
  - **Oil Spill** (200 train, 45 val, 84 test = 329 total)
  - **Clean Ocean** (105 train, 24 val, 15 test = 144 total)
  - **Look-Alike / Ocean Phenomena** (105 train, 24 val, 15 test = 144 total)
- **Image Formats**: JPG, JPEG, PNG
- **Deterministic Preprocessing**: RGB 3-channel conversion, bilinear resize to $(224, 224)$, normalized by ImageNet statistics ($\mu = [0.485, 0.456, 0.406]$, $\sigma = [0.229, 0.224, 0.225]$).

### Split Distribution Table

| Split | Oil Samples | Clean Ocean | Look-Alike / Non-Oil | Total Samples |
|---|---|---|---|---|
| **Train** | 200 | 105 | 105 | 410 |
| **Validation** | 45 | 24 | 24 | 93 |
| **Held-Out Test** | 84 | 15 | 15 | 114 |
| **Combined** | **329** | **144** | **144** | **617** |

---

## 3. Architecture & Training Setup

- **Backbone**: ResNet-18 initialized with standard ImageNet weights.
- **Binary Head**:
  - `Linear(512, 128) -> ReLU -> Dropout(0.2) -> Linear(128, 1)`
- **Loss Function**: Binary Cross-Entropy with Logits (`torch.nn.BCEWithLogitsLoss`).
- **Optimizer**: `AdamW(lr=1e-4, weight_decay=1e-4)`.
- **LR Scheduler**: `CosineAnnealingLR(T_max=20)`.
- **Epochs**: 20 (Best checkpoint saved at Epoch 12 with Validation Loss: $0.5571$, Validation F1: $0.7547$).
- **Deterministic Seed**: 42.

---

## 4. Threshold Selection & Validation Results

The operating decision threshold was chosen via composite score optimization on the validation split ($F_1 + 0.5 \times \text{Specificity}$) to penalize false alarms on clean sea surfaces:

- **Selected Operating Threshold**: $\tau = 0.80$
- **Validation Accuracy**: $79.57\%$
- **Validation Precision**: $0.8250$
- **Validation Recall (Oil)**: $0.7333$
- **Validation Specificity (Non-Oil)**: $0.8542$
- **Validation False Positive Rate (FPR)**: $0.1458$
- **Validation $F_1$ Score**: $0.7765$
- **Validation ROC-AUC**: $0.8810$
- **Validation Confusion Matrix**:
  - True Negative ($TN$): 41
  - False Positive ($FP$): 7
  - False Negative ($FN$): 12
  - True Positive ($TP$): 33

---

## 5. Locked Held-Out Test Set Performance

The held-out test split ($N = 114$) was evaluated once with locked threshold $\tau = 0.80$:

- **Accuracy**: $49.12\%$
- **Precision**: $0.8095$
- **Recall (Oil)**: $0.4048$
- **Specificity (Non-Oil)**: $0.7333$
- **False Positive Rate (FPR)**: $0.2667$
- **$F_1$ Score**: $0.5397$
- **ROC-AUC**: $0.6266$
- **PR-AUC**: $0.8562$

### Held-Out Confusion Matrix

```
                 Actual Positive (Oil)   Actual Negative (Non-Oil)
Predicted Positive       TP = 34                   FP = 8
Predicted Negative       FN = 50                   TN = 22
```

---

## 6. Failure Analysis & Difficult Cases

### 6.1 False Positives ($FP = 8$)
- **Algae blooms & Biogenic Slicks**: Surface discoloration caused by dense algal rafts produced moderate reflectance depression that mimicked thin sheen oil slicks.
- **Low-Angle Sun Glint & Cloud Shadows**: High dynamic range contrast in shadowed ocean waters elevated predicted probabilities slightly above the threshold.

### 6.2 False Negatives ($FN = 50$)
- **Thin Rainbow / Silver Sheens**: Highly diffused, low-contrast sheen layers against turbulent wave backgrounds lacked strong texture features, falling into the conservative non-detection zone at $\tau = 0.80$.
- **High-Angle Direct Sun Reflection**: Extreme solar glint overexposed pixel intensities, suppressing subtle dark slick contrasts.

### 6.3 Scientific Limitations
1. **Resolution & Distance**: Uncalibrated smartphone or drone optical images vary widely in ground sampling distance (GSD); small or distant slicks may not be resolved.
2. **Oil Type / Thickness**: Optical RGB images cannot distinguish crude oil from bunker fuel or refined diesel without calibrated multispectral/hyperspectral or in-situ chemical data.
3. **Geospatial Location**: For standard JPG/PNG uploads lacking embedded EXIF GPS tags, geographic location remains `NOT_ESTABLISHED`.

---

## 7. Model Registry & Verification

- **Registry ID**: `rgb-oil-classifier-resnet18-v1`
- **Checkpoint Location**: `services/ml-python/app/models/rgb_oil_classifier_v1.pth`
- **Checkpoint SHA-256**: `1e764a220bab83fc312e6b7f7872def29e429e6c5799ecefb016718d2fc8aabe`
- **Evaluation Report**: `ml/experiments/results/rgb_classifier_v1_evaluation_report.json`
