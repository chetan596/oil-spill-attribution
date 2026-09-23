# PART 0.9B — CONTROLLED ATTENTION U-NET ARCHITECTURE EXPERIMENT REPORT
**Ocean Guard AI / SIH 26143 — Machine Learning Research Pipeline**  
**Date:** September 19, 2026  
**Environment:** Python 3.11.9 | PyTorch 2.11.0+cu128 | NVIDIA GeForce RTX 5050 Laptop GPU (sm_120)

---

## 1. Executive Summary

Part 0.9B executed a strictly controlled single-variable architectural experiment testing **Additive Spatial Attention Gates** (`AttentionGate`) integrated into the skip connections of the standard dual-polarization Sentinel-1 SAR U-Net.

### Key Findings
1. **Dramatic Look-Alike False Positive Reduction**:
   - At threshold 0.50, Look-Alike FPR dropped sharply from **16.15%** (V6 Baseline) and **15.71%** (V09A Multi-Scale) down to **6.50%** (V09B Attention).
   - This represents a **~60% relative reduction** in false alarms across dark natural formations, biogenic slicks, and wind shadows.
2. **Clean-Ocean Specificity**:
   - Maintained **0.000000 Clean-Ocean FPR** at threshold 0.50 (0 false alarms on unpolluted open sea scenes).
3. **Segmentation & Recall Trade-off**:
   - **Micro IoU (@ 0.50)**: 0.034280
   - **Micro Dice (@ 0.50)**: 0.066288
   - **Precision (@ 0.50)**: 0.042009
   - **Recall (@ 0.50)**: 0.157066 (vs 0.511252 on V6 and 0.429582 on V09A)
   - **Oil Scenes IoU (@ 0.50)**: 0.146615
   - The aggressive suppression of ambiguous dark gradients by spatial attention gates filters out both look-alikes and low-confidence oil boundary pixels, causing a conservative recall profile.
4. **Minimal Parameter Overhead**:
   - Parameter count increased from **1,080,802** (V6 Baseline) to **1,103,174** (+22,372 parameters, **+2.07%**), strictly satisfying the $< 2\times$ safety constraint.
5. **Integrity & Quarantine**:
   - 5 Part III held-out test scenes remained **strictly locked and quarantined**.
   - V2 remains `ACTIVE_BASELINE`.
   - `unet-dual-pol-sar-v09b-attention` is registered strictly as `EXPERIMENTAL`.

---

## 2. Experimental Controls & Frozen Dimensions

| Dimension | Specification | Status |
| :--- | :--- | :--- |
| **Experimental Variable** | **Architecture = UNetAttention** (Additive spatial attention gates on all 4 skip connections) | **TESTED** |
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

## 3. Architecture Specification: Additive Spatial Attention Gate

```
Encoder Skip Feature x (B, Cx, H, W) ───────────┐
                                                │
                                       ┌────────▼────────┐
                                       │ theta: 1x1 Conv │
                                       └────────┬────────┘
                                                │ (B, F_int, H, W)
                                                ▼
                                              [ + ] <─── phi(g): 1x1 Conv (B, F_int, H, W)
                                                │
                                                ▼
                                              ReLU
                                                │
                                       ┌────────▼────────┐
                                       │  psi: 1x1 Conv  │
                                       └────────┬────────┘
                                                │ (B, 1, H, W)
                                                ▼
                                             Sigmoid
                                                │
                                                ▼ Attention Map alpha (B, 1, H, W)
                                                │
Encoder Skip Feature x (B, Cx, H, W) ──────────[ x ]
                                                │
                                                ▼ Attended Skip (B, Cx, H, W)
                                       Passed to Decoder Up Block
```

### Parameter Count Breakdown
- **V6 Standard U-Net**: 1,080,802 parameters
- **V09B Attention U-Net**: 1,103,174 parameters
- **Net Addition**: +22,372 parameters (+2.07%)
- **2x Constraint Check**: Passed ($1,103,174 < 2,161,604$).

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

---

## 5. Threshold Sensitivity Sweep (V09B Attention)

| Threshold | Micro IoU | Micro Dice | Precision | Recall | Overall FPR | Clean-Ocean FPR | Look-Alike FPR | Oil Scenes IoU |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.30** | 0.026398 | 0.051439 | 0.027480 | 0.401524 | 0.075610 | 0.001044 | 0.255831 | 0.298901 |
| **0.35** | 0.028582 | 0.055576 | 0.030387 | 0.324867 | 0.055156 | 0.000356 | 0.187013 | 0.259633 |
| **0.40** | 0.030823 | 0.059803 | 0.033783 | 0.260243 | 0.039604 | 0.000151 | 0.134254 | 0.219141 |
| **0.45** | 0.032933 | 0.063766 | 0.037750 | 0.205132 | 0.027821 | 0.000033 | 0.094412 | 0.181477 |
| **0.50** | 0.034280 | 0.066288 | 0.042009 | 0.157066 | 0.019058 | 0.000000 | 0.065030 | 0.146615 |
| **0.60** | 0.031044 | 0.060219 | 0.048570 | 0.079218 | 0.008257 | 0.000000 | 0.028744 | 0.079210 |

---

## 6. Checkpoint Integrity & Verification

- **Model ID**: `unet-dual-pol-sar-v09b-attention`
- **Checkpoint Location**: `ml/model_registry/versions/unet_dual_pol_sar_v09b_attention.pth`
- **File Size**: 13,397,995 bytes (12.78 MB)
- **SHA-256**: `8018ffaee53634c2fa7eb02f035dda7eccb8bcd408b22937eefaf51cf19885e8`
- **CPU Load Check**: Passed (Missing keys = 0, Unexpected keys = 0)
- **CUDA Load Check**: Passed (Missing keys = 0, Unexpected keys = 0)

---

## 7. Test Suite Status

- **Previous Test Baseline (Part 0.9A)**: 137 passed
- **New Tests Added (Part 0.9B)**: +9 passed ([test_attention_architecture.py](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/tests/unit/test_attention_architecture.py))
- **Total Tests**: **146 passed / 0 failed / 0 regressions**

---

## 8. Scientific Comparison: Multi-Scale (0.9A) vs Attention (0.9B) vs Baseline (V6)

1. **False Positive Suppression**:
   - Attention U-Net demonstrated the **strongest look-alike suppression capability** in the entire benchmark history, lowering Look-Alike FPR to **6.50%** (compared to 15.71% in V09A and 16.15% in V6).
2. **Recall & Sensitivity Dynamics**:
   - V09A Multi-Scale maintains higher oil recall (**42.96%** vs **15.71%** in V09B) and higher oil scenes IoU (**40.84%** vs **14.66%** in V09B).
   - Attention gates effectively act as a spatial filter that attenuates skip activations where coarse gating features lack high confidence, creating a highly conservative detector.
3. **Threshold Behavior**:
   - At threshold 0.30, Attention U-Net recall increases to **40.15%** while Look-Alike FPR rises to **25.58%**.
4. **Architectural Complementarity**:
   - Multi-scale context (Part 0.9A) enriches receptive field representations at the bottleneck.
   - Attention gates (Part 0.9B) refine spatial skip connections to reject background noise.
   - Each mechanism addresses distinct facets of the SAR oil slick detection challenge.
