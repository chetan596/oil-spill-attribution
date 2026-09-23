# Part 0.14B.3 — Real Optical Oil-Spill Classifier Training & Internal Validation Report

**Part**: `0.14B.3`  
**Status**: `COMPLETE`  
**Timestamp**: 2026-09-20T03:19Z  
**Model ID**: `rgb-oil-classifier-resnet18-v2`  
**Model Version**: `2.0.0`  
**Registry Status**: `EXPERIMENTAL`  
**External Test Set**: `SEALED — NOT EVALUATED`  
**V1 Model**: `FROZEN & PRESERVED` (`rgb-oil-classifier-resnet18-v1`)  

---

## 1. Executive Summary

This report documents the training, validation, threshold optimization, and independent single-pass internal testing of `rgb-oil-classifier-resnet18-v2`, a 3-class transfer learning model built on genuine optical remote sensing and drone imagery (MADOS and Kerf datasets).

The model was evaluated on the locked **708-image internal test benchmark** (`internal_test_manifest.json`), achieving:
- **Accuracy (3-class)**: 81.21%
- **Macro Precision**: 81.84%
- **Macro Recall**: 72.52%
- **Macro F1**: 0.7579
- **Oil Precision**: 92.86%
- **Oil Recall**: 65.00%
- **Oil F1**: 0.7647
- **Oil Specificity**: 99.36%
- **Overall False Positive Rate (FPR)**: 0.64% (Clean FPR: 1.85%, Look-Alike FPR: 0.21%)
- **ROC-AUC**: 0.9047
- **PR-AUC**: 0.8016

> [!IMPORTANT]
> The independent external test benchmark (130 images from `external_test_manifest.json`) remained strictly **SEALED** and was not accessed or evaluated during model training, hyperparameter tuning, or threshold selection.

---

## 2. Dataset & Split Composition

The model was developed strictly using verified real optical data partitioned in Part 0.14B.2:

```
Dataset Inventory:
- TRAIN:         1,961 images (Oil: 602, Clean: 361, Look-Alike: 998)
- VALIDATION:      730 images (Oil: 153, Clean: 165, Look-Alike: 412)
- INTERNAL TEST:   708 images (Oil: 80,  Clean: 162, Look-Alike: 466)
- EXTERNAL TEST:   130 images (Oil: 86,  Clean: 11,  Look-Alike: 33) — SEALED
```

---

## 3. Architecture & Training Protocol

- **Backbone**: ResNet-18 initialized with standard ImageNet weights (`torchvision.models.ResNet18_Weights.DEFAULT`)
- **Classification Head**:
  - `Linear(512, 128)` -> `ReLU` -> `Dropout(0.2)` -> `Linear(128, 3)`
  - Outputs 3 logits corresponding to: `CLEAN_OCEAN` (0), `LOOK_ALIKE` (1), `OIL_SPILL` (2)
- **Class Weights** (Calculated strictly from TRAIN counts):
  - $w_{\text{clean}} = 1.8107$
  - $w_{\text{look-alike}} = 0.6550$
  - $w_{\text{oil}} = 1.0858$
- **Loss Function**: `CrossEntropyLoss(weight=class_weights)`
- **Optimizer**: AdamW ($\text{lr} = 1\times 10^{-4}$, $\text{weight\_decay} = 1\times 10^{-4}$)
- **Scheduler**: `ReduceLROnPlateau(mode='max', factor=0.5, patience=2)` monitoring validation Oil F1
- **Hardware**: NVIDIA GeForce RTX 5050 Laptop GPU (PyTorch CUDA 12.8)
- **Batch Size**: 32 | **Random Seed**: 42

---

## 4. Training History & Early Stopping

The training ran for 14 epochs before early stopping (patience = 5 epochs without improvement on validation Oil F1):

| Epoch | Train Loss | Val Accuracy | Val Macro F1 | Val Oil F1 | Val Oil Recall | Val Oil Precision | Val Oil FPR |
|---|---|---|---|---|---|---|---|
| 1 | 0.7605 | 76.03% | 0.7489 | 0.7816 | 66.7% | 94.4% | 1.0% |
| 4 | 0.4150 | 80.00% | 0.7845 | 0.8226 | 71.2% | 97.3% | 0.5% |
| 5 | 0.3856 | 81.92% | 0.7977 | 0.8258 | 71.2% | 98.2% | 0.3% |
| **9 (Best)** | **0.2827** | **81.78%** | **0.8006** | **0.8421** | **73.2%** | **99.1%** | **0.2%** |
| 14 | 0.1868 | 80.96% | 0.7901 | 0.8309 | 73.9% | 95.0% | 1.0% |

---

## 5. Threshold Optimization on Validation Set

Candidate decision thresholds for binary detection ($\text{oil\_probability} \ge \tau$) were evaluated strictly on the **Validation Set**:

| Threshold ($\tau$) | Oil Recall | Oil Precision | Oil F1 | Clean FPR | Look-Alike FPR | Overall FPR | Selection Score |
|---|---|---|---|---|---|---|---|
| 0.20 | 83.66% | 90.14% | 0.8678 | 2.42% | 2.43% | 2.43% | 0.8829 |
| 0.25 | 79.74% | 93.85% | 0.8622 | 1.82% | 1.21% | 1.39% | 0.8739 |
| **0.30 (Selected)** | **77.12%** | **95.93%** | **0.8551** | **1.21%** | **0.73%** | **0.87%** | **0.8667** |
| 0.50 | 73.20% | 99.12% | 0.8421 | 0.00% | 0.24% | 0.17% | 0.8510 |
| 0.80 | 60.13% | 100.00% | 0.7510 | 0.00% | 0.00% | 0.00% | 0.7708 |

**Locked Decision Threshold**: $\tau = 0.30$

---

## 6. Locked Internal Test Benchmark Results (708 Images)

### 6.1 Multi-Class & Binary Metrics

- **3-Class Accuracy**: **81.21%**
- **Macro F1**: **0.7579** | **Weighted F1**: **0.8101**
- **Oil Precision**: **92.86%**
- **Oil Recall**: **65.00%** (52 of 80 real oil samples detected)
- **Oil F1**: **0.7647**
- **Oil Specificity**: **99.36%**
- **False Positive Rate**: **0.64%** (Only 4 false positives out of 628 non-oil images!)
- **Clean Ocean FPR**: **1.85%** (3 of 162 clean ocean scenes)
- **Look-Alike FPR**: **0.21%** (1 of 466 marine look-alike scenes)
- **ROC-AUC**: **0.9047** | **PR-AUC**: **0.8016**

### 6.2 Confusion Matrices

**3-Class Confusion Matrix (Row: Actual, Column: Predicted)**:

| | Pred Clean Ocean | Pred Look-Alike | Pred Oil Spill | Total |
|---|---|---|---|---|
| **Actual Clean Ocean** | 113 | 47 | 2 | 162 |
| **Actual Look-Alike** | 50 | 415 | 1 | 466 |
| **Actual Oil Spill** | 7 | 26 | 47 | 80 |

**Binary Matrix (Oil vs Non-Oil at $\tau = 0.30$)**:
- **True Positives (TP)**: 52
- **False Positives (FP)**: 4
- **True Negatives (TN)**: 624
- **False Negatives (FN)**: 28

---

## 7. Comparison: V1 vs V2

| Metric | V1 Classifier (`rgb-oil-classifier-resnet18-v1`) | V2 Classifier (`rgb-oil-classifier-resnet18-v2`) | Status |
|---|---|---|---|
| **Training Data** | SAR-derived pseudo-RGB patches (Domain gap) | Genuine Optical Satellite & Drone imagery | **Resolved** |
| **Classes** | Binary (Oil vs Non-Oil) | 3-Class (Clean, Look-Alike, Oil) | **Expanded** |
| **Decision Threshold** | 0.800 (Over-conservative) | 0.300 (Validation-optimized) | **Optimized** |
| **Internal Test Oil Precision** | 80.95% | **92.86%** | **+11.91%** |
| **Internal Test Oil Recall** | 40.48% (50/84 missed) | **65.00%** (52/80 detected) | **+24.52%** |
| **Internal Test Oil F1** | 53.97% | **76.47%** | **+22.50%** |
| **Internal Test Specificity** | 73.33% | **99.36%** | **+26.03%** |
| **False Positive Rate (FPR)** | 26.67% | **0.64%** | **-26.03%** |
| **ROC-AUC** | 0.6266 | **0.9047** | **+0.2781** |

---

## 8. Failure Analysis

On the 708-sample internal test set:
- **False Positives (4 samples)**:
  - 3 clean ocean scenes with high-contrast sun glint / specular reflection.
  - 1 heavy sediment plume near coastline.
- **False Negatives (28 samples)**:
  - Highly diffuse / thin sheen signatures with low optical contrast against dark water.
  - Sparse pixel coverage (<1% of scene patch).

---

## 9. Model Artifacts & Registry Entry

1. **Model Checkpoint**:
   - Path: [`services/ml-python/app/models/rgb_oil_classifier_v2/rgb_oil_classifier_v2.pth`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/app/models/rgb_oil_classifier_v2/rgb_oil_classifier_v2.pth)
   - SHA-256: `6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84`
2. **Registry Status**: `EXPERIMENTAL` in [`ml/experiments/results/model_registry_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/model_registry_audit.json)
3. **V1 Checkpoint**: Untouched and preserved at [`services/ml-python/app/models/rgb_oil_classifier_v1.pth`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/app/models/rgb_oil_classifier_v1.pth)
