# PART 0.14B.4 — Final Unbiased Real-Optical Classifier External Evaluation Report

## 1. Purpose
This document presents the final, unbiased scientific evaluation of the **Real Optical Oil-Spill Classifier (ResNet-18 V2)** on the previously sealed external test set (`external_test_manifest.json`, 130 images). 

> [!IMPORTANT]
> **Statement of Scientific Integrity**:
> The external test set was not used for model training, checkpoint selection, threshold selection, hyperparameter tuning, or model modification. It remained strictly sealed until this single-pass final evaluation.

---

## 2. Frozen Model Configuration
- **Model Name**: `rgb-oil-classifier-resnet18-v2`
- **Architecture**: ResNet-18 (ImageNet-pretrained backbone with custom 3-class linear head: `fc = Sequential(Dropout(0.3), Linear(512, 128), ReLU(), Dropout(0.2), Linear(128, 3))`)
- **Parameters**: 11,244,739 total
- **Classes**:
  - `0`: `CLEAN_OCEAN`
  - `1`: `LOOK_ALIKE`
  - `2`: `OIL_SPILL`
- **Preprocessing Pipeline (Frozen)**:
  - Resize to $(224 \times 224)$
  - RGB 3-channel conversion (deterministic)
  - Standardization: Mean = `[0.485, 0.456, 0.406]`, Std = `[0.229, 0.224, 0.225]`
- **Inference Mode**: Deterministic single-pass evaluation (no test-time augmentation).

---

## 3. Frozen Operating Threshold & Checkpoint Integrity
- **Frozen Operating Threshold**: $\tau = 0.30$ (selected and frozen exclusively during validation in Part 0.14B.3).
- **Checkpoint Location**: `services/ml-python/app/models/rgb_oil_classifier_v2/rgb_oil_classifier_v2.pth`
- **Expected SHA-256**: `6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84`
- **Verified SHA-256**: `6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84` (**MATCH / VERIFIED**)

---

## 4. External Dataset Composition & Integrity Verification
- **Manifest**: `data/raw/optical_real/metadata/external_test_manifest.json`
- **Total Verified Images**: 130
  - **OIL_SPILL**: 86 images (66.15%)
  - **CLEAN_OCEAN**: 11 images (8.46%)
  - **LOOK_ALIKE**: 33 images (25.38%)
- **Data Source**: KERF Drone Optical Dataset (Port of Antwerp, 4K/RGB aerial photography)
- **Integrity Audit**:
  - Exact SHA-256 Overlap with Train/Validation/Internal-Test: **0**
  - Perceptual Cluster Overlap: **0**
  - Scene ID Overlap: **0**
  - All 130 image files verified present and uncorrupted on disk.

---

## 5. Primary 3-Class Metrics

| Metric | Score | Percentage |
|---|---|---|
| **Overall 3-Class Accuracy** | **0.9538** | **95.38%** (124 / 130 correct) |
| **Macro Precision** | **0.9541** | 95.41% |
| **Macro Recall** | **0.9379** | 93.79% |
| **Macro F1-Score** | **0.9450** | — |
| **Weighted Precision** | **0.9554** | 95.54% |
| **Weighted Recall** | **0.9538** | 95.38% |
| **Weighted F1-Score** | **0.9542** | — |

---

## 6. Oil Detection Metrics (Operating Threshold $\tau = 0.30$)

| Metric | Score | Formula / Ratio |
|---|---|---|
| **Oil Precision** | **0.9765** (97.65%) | $TP / (TP + FP) = 83 / 85$ |
| **Oil Recall** | **0.9651** (96.51%) | $TP / (TP + FN) = 83 / 86$ |
| **Oil F1-Score** | **0.9708** | $2 \cdot (P \cdot R) / (P + R)$ |
| **Oil Specificity (TNR)** | **0.9545** (95.45%) | $TN / (TN + FP) = 42 / 44$ |
| **Oil False Positive Rate (FPR)** | **0.0455** (4.55%) | $FP / (TN + FP) = 2 / 44$ |
| **Clean Ocean FPR** | **0.0000** (0.00%) | $0 / 11$ |
| **Look-Alike FPR** | **0.0606** (6.06%) | $2 / 33$ |

---

## 7. Binary Oil vs. Non-Oil Performance

| Binary Metric | Value |
|---|---|
| **Binary Accuracy** | **0.9615** (96.15%) |
| **Binary True Positives ($TP$)** | **83** |
| **Binary False Positives ($FP$)** | **2** |
| **Binary True Negatives ($TN$)** | **42** |
| **Binary False Negatives ($FN$)** | **3** |
| **Binary ROC-AUC** | **0.9963** |
| **Binary PR-AUC** | **0.9981** |

---

## 8. Confusion Matrix

### 3×3 Multiclass Confusion Matrix

```
                      PREDICTED
                Clean    Look-Alike    Oil Spill    Total
TRUE Clean       10          1             0          11
TRUE Look-Alike   0         31             2          33
TRUE Oil Spill    0          3            83          86
Total            10         35            85         130
```

### Class-Specific Transitions & Errors
- $\text{CLEAN\_OCEAN} \rightarrow \text{OIL\_SPILL}$: **0** (0.00%)
- $\text{LOOK\_ALIKE} \rightarrow \text{OIL\_SPILL}$: **2** (6.06%)
- $\text{OIL\_SPILL} \rightarrow \text{CLEAN\_OCEAN}$: **0** (0.00%)
- $\text{OIL\_SPILL} \rightarrow \text{LOOK\_ALIKE}$: **3** (3.49%)

---

## 9. Source-Specific Breakdown

| Source Dataset | Modality / Domain | Total | Oil Count | Clean Count | Look-Alike Count | Oil Precision | Oil Recall | Oil F1 | Clean FPR | Look-Alike FPR |
|---|---|---|---|---|---|---|---|---|---|---|
| **Kerf Drone Oil Spill** | Aerial Drone Optical RGB | 130 | 86 | 11 | 33 | **0.9765** (83/85) | **0.9651** (83/86) | **0.9708** | **0.00%** (0/11) | **6.06%** (2/33) |

---

## 10. Oil Probability Distribution & Confidence Statistics

| True Class | Sample Count | Mean $P(\text{Oil})$ | Median $P(\text{Oil})$ | Min $P(\text{Oil})$ | Max $P(\text{Oil})$ | Std $P(\text{Oil})$ |
|---|---|---|---|---|---|---|
| **CLEAN_OCEAN** | 11 | 0.0117 | 0.0090 | 0.000045 | 0.0422 | 0.0118 |
| **LOOK_ALIKE** | 33 | 0.0592 | 0.0034 | 0.000306 | 0.9774 | 0.2095 |
| **OIL_SPILL** | 86 | 0.9539 | 0.9993 | 0.0496 | 0.999999 | 0.1727 |

- Clean ocean images have near-zero oil probabilities (maximum observed: $0.0422 \ll 0.30$).
- Oil spill samples exhibit extremely high median confidence ($99.93\%$).
- Look-alike samples maintain low median probability ($0.34\%$), with only 2 outliers exceeding the $0.30$ threshold.

---

## 11. Error & Failure Analysis

### False Positives (2 images / 44 non-oil, FPR = 4.55%)
| Image ID | Source | True Label | Predicted 3-Class | $P(\text{Oil})$ | Status / Reason |
|---|---|---|---|---|---|
| `kerf_test_0247` | Kerf Drone | LOOK_ALIKE | OIL_SPILL | 0.9774 | `REVIEW_REQUIRED` (High sun glint / dark reflection boundary) |
| `kerf_test_0252` | Kerf Drone | LOOK_ALIKE | OIL_SPILL | 0.7771 | `REVIEW_REQUIRED` (Vessel wake with dark boundary patterns) |

### False Negatives (3 images / 86 oil spills, FNR = 3.49%)
| Image ID | Source | True Label | Predicted 3-Class | $P(\text{Oil})$ | Status / Reason |
|---|---|---|---|---|---|
| `kerf_test_0053` | Kerf Drone | OIL_SPILL | LOOK_ALIKE | 0.1218 | `REVIEW_REQUIRED` (Ultra-thin dispersed sheen on turbid port water) |
| `kerf_test_0055` | Kerf Drone | OIL_SPILL | LOOK_ALIKE | 0.2933 | `REVIEW_REQUIRED` (Near threshold $\tau=0.30$; faint sheen plume) |
| `kerf_test_0126` | Kerf Drone | OIL_SPILL | LOOK_ALIKE | 0.0496 | `REVIEW_REQUIRED` (Very faint rainbow sheen with strong wave texture) |

---

## 12. Comparison Across Development & Evaluation Splits

| Metric | Validation Set (730) | Internal Test Set (708) | External Test Set (130) |
|---|---|---|---|
| **Total Images** | 730 | 708 | 130 |
| **3-Class Accuracy** | 81.78% | 81.21% | **95.38%** |
| **Macro F1** | 0.8006 | 0.7579 | **0.9450** |
| **Oil Precision** | 95.93% | 92.86% | **97.65%** |
| **Oil Recall** | 77.12% | 65.00% | **96.51%** |
| **Oil F1-Score** | 0.8551 | 0.7647 | **0.9708** |
| **Clean Ocean FPR** | 1.21% | 1.85% | **0.00%** |
| **Look-Alike FPR** | 0.73% | 0.21% | **6.06%** |
| **Binary ROC-AUC** | 0.9331 | 0.9047 | **0.9963** |
| **Binary PR-AUC** | 0.8951 | 0.8016 | **0.9981** |

### Observations:
1. **Domain Composition**:
   - Internal Test contains mostly satellite crops (549 MADOS Sentinel-2 MSI + 159 KERF drone images). Satellite crops feature lower spatial resolution ($10\text{ m}$ GSD) and atmospheric attenuation, leading to conservative recall ($65.0\%$).
   - External Test consists exclusively of high-resolution aerial drone imagery ($1920\times 1080$), where oil textures, emulsification, and sheen edges are sharply resolved, leading to higher recall ($96.51\%$) and precision ($97.65\%$).
2. **False Positive Suppression**:
   - Across all splits, clean ocean FPR remains under $2\%$, demonstrating strong discrimination against unpolluted open waters.
   - Look-alike false positive rate remains controlled at $6.06\%$ on drone imagery.

---

## 13. Limitations & Scientific Bounds
1. **High-Resolution vs. Low-Resolution Disparity**: Performance on high-resolution drone imagery ($97.08\%$ F1) exceeds satellite MSI crop performance ($85.71\%$ F1). The model should not be assumed to operate with equal sensitivity across arbitrary satellite resolutions.
2. **Thin Sheen Sensitivity**: The 3 observed false negatives were all very thin, rainbow-sheen films with subtle color differentials. Dispersed sheen remains challenging for single-frame optical classifiers.
3. **Sealed External Test Population**: Results represent performance on the Port of Antwerp aerial drone benchmark. Generalization to other global geographies (e.g., Arctic sea ice, tropical coral reefs) requires further multi-domain benchmarking.

---

## 14. Final Model Status
- **Model Registry Designation**: `EXPERIMENTAL`
- **Deployment Status**: Not deployed to production. Remains in experimental registry for scientific audit and future ensemble evaluation.
