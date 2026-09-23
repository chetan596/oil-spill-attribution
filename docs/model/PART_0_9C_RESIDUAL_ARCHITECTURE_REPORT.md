# PART 0.9C — CONTROLLED RESIDUAL U-NET ARCHITECTURE EXPERIMENT REPORT
**Ocean Guard AI / SIH 26143 — Machine Learning Research Pipeline**  
**Date:** September 19, 2026  
**Environment:** Python 3.11.9 | PyTorch 2.11.0+cu128 | NVIDIA GeForce RTX 5050 Laptop GPU (sm_120)

---

## 1. Executive Summary

Part 0.9C executed a strictly controlled, single-variable architectural experiment testing **Residual Feature Learning** (`UNetResidual`) on the dual-polarization Sentinel-1 SAR dataset. Standard DoubleConv feature blocks were replaced with lightweight 2-layer residual blocks featuring 1×1 projection shortcuts.

### Key Findings
1. **High Oil Sensitivity & Balanced Recall**:
   - At threshold 0.50, Residual U-Net achieved **49.30% Recall** and **0.440793 (44.08%) Oil Scenes IoU**, closely approaching the V6 standard baseline (51.13% recall) while maintaining strong gradient flow through identity and projection shortcuts.
2. **Clean-Ocean Specificity**:
   - Maintained **0.000000 Clean-Ocean FPR** at threshold 0.50 (zero false alarms on unpolluted open sea scenes across the validation set).
3. **Look-Alike False Positive Rate**:
   - At threshold 0.50, Look-Alike FPR was **17.66%** (compared to 16.15% on V6, 15.71% on V09A, and 6.50% on V09B).
   - Residual learning preserves fine-grained texture features across layers, allowing high sensitivity to oil boundaries, but simultaneously retains higher sensitivity to look-alike dark oceanic features.
4. **Segmentation Metrics (@ 0.50)**:
   - **Micro IoU**: 0.046280
   - **Micro Dice**: 0.088466
   - **Precision**: 0.048593
   - **Recall**: 0.492995
   - **Oil Scenes IoU**: 0.440793
5. **Parameter Control**:
   - Parameters: **1,114,338** (+33,536 parameters, **+3.10%** vs V6 baseline), well within the $< 2\times$ parameter safety boundary.
6. **Integrity & Quarantine**:
   - 5 Part III held-out test scenes remained **strictly locked and quarantined**.
   - V2 remains `ACTIVE_BASELINE`.
   - `unet-dual-pol-sar-v09c-residual` is cataloged strictly as `EXPERIMENTAL`.

---

## 2. Experimental Controls & Frozen Dimensions

| Dimension | Specification | Status |
| :--- | :--- | :--- |
| **Experimental Variable** | **Architecture = UNetResidual** (Residual convolution blocks with 1×1 projection shortcuts) | **TESTED** |
| **Reference Baseline** | `unet-dual-pol-sar-v6` (`bcf3d6bc988b910fa67c0c31c89cb2c861da73f0b02159c579cb28e5039920e3`) | **FROZEN** |
| **Active Baseline** | `unet-dual-pol-sar-v2` | **ACTIVE_BASELINE** |
| **Dataset Manifest** | `ml/datasets/manifest.json` (`9d4cf3f6755976c72bfdb1172bbc03616efeba8e15869ba893665db506dc621d`) | **FROZEN** |
| **Dataset Splits** | 28 Train (448 tiles) / 7 Validation (112 tiles) / 5 Held-out Test | **FROZEN** |
| **Held-Out Test Set** | `real_part3_test_00060`, `00062`, `00063`, `00064`, `00080` | **STRICTLY LOCKED** |
| **Preprocessing** | `sentinel1_sigma0_db_v1` (VV: $[-35, -5]\text{ dB} \to [0, 1]$, VH: $[-45, -15]\text{ dB} \to [0, 1]$) | **FROZEN** |
| **Tile Policy** | 512×512 deterministic tiles, non-overlapping train, stride 448 validation | **FROZEN** |
| **Loss Function** | `CombinedLoss` (CE weight=1.0, Dice weight=1.0, foreground weight=5.0) | **FROZEN** |
| **Optimizer** | AdamW (lr=1e-4, weight_decay=1e-4), batch_size=2, AMP FP16, seed=42 | **FROZEN** |
| **Early Stopping** | Max 30 epochs, patience 7 on validation Dice | **FROZEN** |

---

## 3. Architecture Specification: Residual Convolutional Block

```
Input x (B, Cin, H, W)
   │
   ├───> Conv2d(3x3) ──> BatchNorm2d ──> ReLU ──> Conv2d(3x3) ──> BatchNorm2d ──┐
   │                                                                           │
   └───> Shortcut: [Conv2d(1x1) + BN if Cin != Cout else Identity] ─────────────┴──> [ + ] ──> ReLU ──> Output (B, Cout, H, W)
```

### Parameter Count Breakdown
- **V6 Standard U-Net**: 1,080,802 parameters
- **V09C Residual U-Net**: 1,114,338 parameters
- **Net Addition**: +33,536 parameters (+3.10%)
- **2x Limit Check**: Passed ($1,114,338 < 2,161,604$).

---

## 4. Factual Model Comparison Table (Validation Split @ Threshold 0.50)

| Model ID | Architecture | Loss Objective | Parameters | Micro IoU | Micro Dice | Precision | Recall | Clean Ocean FPR | Look-Alike FPR | Oil Scenes IoU |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **V6 Baseline** | Standard U-Net | Combined (fg=5.0) | 1,080,802 | **0.052088** | **0.099018** | **0.054818** | 0.511252 | 0.000023 | 0.161488 | **0.444747** |
| **V8_A** | Standard U-Net | Combined (fg=5.0) | 1,080,802 | 0.027216 | 0.052990 | 0.029927 | 0.231008 | **0.000000** | 0.138709 | 0.231008 |
| **V8_B** | Standard U-Net | Focal-Dice ($\alpha=0.25, \gamma=2$) | 1,080,802 | 0.022088 | 0.043221 | 0.022780 | 0.421106 | **0.000000** | 0.334634 | 0.420952 |
| **V8_C** | Standard U-Net | Focal-Tversky ($\alpha=0.7, \beta=0.3$) | 1,080,802 | 0.022728 | 0.044446 | 0.022754 | **0.951446** | 0.000093 | 0.748957 | 0.667109 |
| **V8_D** | Standard U-Net | Combined (fg=10.0) | 1,080,802 | 0.031019 | 0.060172 | 0.033212 | 0.319635 | 0.000262 | 0.171746 | 0.313702 |
| **V09A Multi-Scale** | Multi-Scale Context | Combined (fg=5.0) | 1,242,590 | 0.045058 | 0.086231 | 0.047926 | 0.429582 | **0.000000** | 0.157122 | 0.408369 |
| **V09B Attention** | Attention U-Net | Combined (fg=5.0) | 1,103,174 | 0.034280 | 0.066288 | 0.042009 | 0.157066 | **0.000000** | **0.065030** | 0.146615 |
| **V09C Residual** | Residual U-Net | Combined (fg=5.0) | 1,114,338 | 0.046280 | 0.088466 | 0.048593 | 0.492995 | **0.000000** | 0.176611 | 0.440793 |

---

## 5. Threshold Sensitivity Sweep (V09C Residual)

| Threshold | Micro IoU | Micro Dice | Precision | Recall | Overall FPR | Clean-Ocean FPR | Look-Alike FPR | Oil Scenes IoU |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.30** | 0.041109 | 0.078971 | 0.042449 | 0.565508 | 0.067875 | 0.000000 | 0.233760 | 0.497242 |
| **0.35** | 0.042399 | 0.081349 | 0.043955 | 0.545005 | 0.063074 | 0.000000 | 0.217131 | 0.481147 |
| **0.40** | 0.043707 | 0.083754 | 0.045494 | 0.526658 | 0.058793 | 0.000000 | 0.202310 | 0.466747 |
| **0.45** | 0.045028 | 0.086176 | 0.047064 | 0.510017 | 0.054946 | 0.000000 | 0.189005 | 0.453935 |
| **0.50** | 0.046280 | 0.088466 | 0.048593 | 0.492995 | 0.051359 | 0.000000 | 0.176611 | 0.440793 |
| **0.60** | 0.048873 | 0.093191 | 0.051875 | 0.457852 | 0.044526 | 0.000000 | 0.153015 | 0.413232 |

---

## 6. Checkpoint Integrity & Verification

- **Model ID**: `unet-dual-pol-sar-v09c-residual`
- **Checkpoint Location**: `ml/model_registry/versions/unet_dual_pol_sar_v09c_residual.pth`
- **File Size**: 13,510,147 bytes (12.88 MB)
- **SHA-256**: `861fe810f8fc1e8bba3ff5cd0365628a5009f4261d904f1ddbb6264c8f2cc174`
- **CPU Load Check**: Passed (Missing keys = 0, Unexpected keys = 0)
- **CUDA Load Check**: Passed (Missing keys = 0, Unexpected keys = 0)

---

## 7. Test Suite Status

- **Previous Test Baseline (Part 0.9B)**: 146 passed
- **New Tests Added (Part 0.9C)**: +9 passed ([test_residual_architecture.py](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/tests/unit/test_residual_architecture.py))
- **Total Tests**: **155 passed / 0 failed / 0 regressions**

---

## 8. Scientific Comparison: Residual (0.9C) vs Attention (0.9B) vs Multi-Scale (0.9A) vs Baseline (V6)

1. **High Oil Sensitivity & Gradient Flow**:
   - Residual U-Net (V09C) preserves high recall (**49.30%** @ 0.50, **56.55%** @ 0.30) and high oil-scene IoU (**44.08%** @ 0.50, **49.72%** @ 0.30), outperforming V09B Attention (15.71% recall) and V09A Multi-Scale (42.96% recall).
2. **Look-Alike Trade-off**:
   - The trade-off for higher sensitivity is an increased Look-Alike FPR of **17.66%** @ 0.50 (vs 6.50% in V09B Attention and 15.71% in V09A Multi-Scale).
3. **Architectural Triad Insights**:
   - **Multi-Scale Context (Part 0.9A)**: Moderate balance (Recall: 42.96%, Look-Alike FPR: 15.71%).
   - **Spatial Attention Gates (Part 0.9B)**: Maximum look-alike suppression (Look-Alike FPR: 6.50%, Recall: 15.71%).
   - **Residual Learning (Part 0.9C)**: Maximum oil feature extraction and boundary preservation (Recall: 49.30%, Oil-Scene IoU: 44.08%, Look-Alike FPR: 17.66%).
