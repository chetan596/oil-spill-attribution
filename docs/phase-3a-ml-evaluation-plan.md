# Phase 3A — Machine Learning Evaluation Plan

**System:** AI-Powered Oil Spill Detection & Vessel Attribution System (SIH26143)  
**Document:** Model Evaluation Protocols & Validation Metrics  
**Date:** September 2026  

---

## 1. Overview

Accurate evaluation of SAR oil spill segmentation models requires metrics that account for severe class imbalance (spill pixels typically represent < 1% of the total SAR sea area) and look-alike discrimination.

---

## 2. Core Quantitative Metrics

### 2.1 Intersection over Union (IoU / Jaccard Index)
Measures the spatial overlap between predicted spill mask $P$ and ground-truth mask $G$:
$$\text{IoU} = \frac{|P \cap G|}{|P \cup G|} = \frac{\text{TP}}{\text{TP} + \text{FP} + \text{FN}}$$
- **Target Benchmark:** $\text{IoU} \ge 0.75$ for oil spill class.

### 2.2 Dice Similarity Coefficient (F1-Score)
Harmonic mean of precision and recall:
$$\text{Dice} = \frac{2 |P \cap G|}{|P| + |G|} = \frac{2 \cdot \text{TP}}{2 \cdot \text{TP} + \text{FP} + \text{FN}}$$
- **Target Benchmark:** $\text{Dice} \ge 0.85$.

### 2.3 Precision and Recall
$$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}, \quad \text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}}$$
- High Recall ensures no spills are missed. High Precision ensures maritime agencies are not sent false alarms.

### 2.4 Look-Alike False Positive Rate (LFPR)
Evaluates model discrimination against low-wind natural slicks and biogenic films:
$$\text{LFPR} = \frac{\text{False Spill Detections on Look-alike Regions}}{\text{Total Look-alike Regions}}$$
- **Target Benchmark:** $\text{LFPR} \le 0.15$ (Look-alike rejection $\ge 85\%$).

### 2.5 Area Estimation Error (AEE)
Measures the absolute percentage error between predicted polygon area $A_P$ and true slick area $A_G$:
$$\text{AEE} = \frac{|A_P - A_G|}{A_G} \times 100\%$$
- **Target Benchmark:** $\text{AEE} \le 10\%$.

---

## 3. Spatial Cross-Validation Strategy

Standard random tile splitting causes spatial data leakage because overlapping tiles from the same SAR scene share identical sea surface features.

### Validation Protocol:
1. **Scene-Level Splitting**: Entire SAR scenes are allocated strictly to either Train (70%), Validation (15%), or Test (15%). No tiles from the same acquisition are shared across splits.
2. **5-Fold Geographic Cross-Validation**: Folds are stratified by geographical region (e.g., Arabian Sea, Bay of Bengal, Mediterranean) to test model generalization to varying sea states.

---

## 4. Evaluation Suite Implementation (`ml/evaluation/`)

The evaluation pipeline will run automated validation reports producing:
- Per-class confusion matrices (Clean Sea, Oil Spill, Look-alike, Ship, Land)
- Precision-Recall curves across decision thresholds ($0.1$ to $0.9$)
- Vector boundary Hausdorff distance comparing predicted GeoJSON polygons against ground truth.
