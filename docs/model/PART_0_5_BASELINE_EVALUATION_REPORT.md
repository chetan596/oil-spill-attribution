# PART 0.5 — REPRODUCIBLE BASELINE EVALUATION AUDIT REPORT
**Project**: Ocean Guard AI / SIH 26143  
**Repository**: `oil-spill-attribution`  
**Execution Timestamp**: `2026-09-19T05:24:56Z`  
**Evaluator Status**: `BASELINE_EVALUATION_COMPLETE`  

---

## 1. Executive Summary & Audit Status

| Dimension | Audit Finding |
| :--- | :--- |
| **Audit Status** | **COMPLETE** (`BASELINE_EVALUATION_COMPLETE`) |
| **Dataset Evaluated** | 40-Scene Real Sentinel-1 SAR Verified Subset (`ml/datasets/manifest.json`) |
| **Hardware Environment** | NVIDIA GeForce RTX 5050 Laptop GPU (`sm_120` / CC 12.0) |
| **Software Environment** | PyTorch `2.11.0+cu128`, CUDA `12.8`, Python `3.11.9` |
| **Registered Checkpoints** | V2 (`ACTIVE_BASELINE`), V4 (`EXPERIMENTAL`) |
| **Integrity Checks** | 100% SHA-256 match, 0% scene leakage, 0 heuristic/fallback substitutions |
| **Test Suite** | **100 / 100 PASSED** (Unit + Integration) |

> [!IMPORTANT]
> **Empirical Evaluation Disclaimer**: These results are empirical benchmark measurements on the available 40-scene subset and are not a production performance guarantee. The 40-scene subset represents a verified geographic benchmark and must not be confused with the full 3,020-scene Zenodo archive.

---

## 2. Dataset Scope & Split Isolation

The evaluation was strictly partitioned according to the canonical dataset manifest ([manifest.json](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/manifest.json)):

| Partition | Scene Count | Category Composition | Purpose in Part 0.5 |
| :--- | :---: | :--- | :--- |
| **Train** | 28 | 12 Oil, 8 Look-Alike, 8 No-Oil | **ISOLATED** (Zero evaluation leakage, omitted from test scoring) |
| **Validation** | 7 | 3 Oil, 2 Look-Alike, 2 No-Oil | Model evaluation & Category FPR isolation |
| **Held-Out Test** | 5 | 5 Part III Held-Out Test Scenes | Independent unbiased evaluation |
| **Total** | **40** | **15 Oil, 10 Look-Alike, 10 No-Oil, 5 Test** | **100% Verified Real GeoTIFF Rasters** |

### Part III Held-Out Test Isolation
The 5 held-out test scenes originate exclusively from `data/raw/satellite/real/part3_test/`:
- `real_part3_test_00060` (Clean sea / no oil)
- `real_part3_test_00062` (Verified oil slick: 24,162 positive px)
- `real_part3_test_00063` (Look-alike dark patch)
- `real_part3_test_00064` (Verified oil slick: 52,620 positive px)
- `real_part3_test_00080` (Verified oil slick: 128,475 positive px)

These scenes were strictly quarantined: zero threshold tuning, zero model selection, zero hyperparameter fitting.

---

## 3. Evaluated Model Checkpoints & Preprocessing Contracts

| Attribute | Model V2 (`ACTIVE_BASELINE`) | Model V4 (`EXPERIMENTAL`) |
| :--- | :--- | :--- |
| **Model ID** | `unet-dual-pol-sar-v2` | `unet-dual-pol-sar-v4` |
| **Checkpoint Path** | [`ml/model_registry/versions/unet_dual_pol_sar_v2.pth`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/model_registry/versions/unet_dual_pol_sar_v2.pth) | [`ml/model_registry/versions/unet_dual_pol_sar_v4.pth`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/model_registry/versions/unet_dual_pol_sar_v4.pth) |
| **SHA-256 Digest** | `905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd` | `c1395f1deae819b222f9e1034472d18a84f502fd89d4076981d3291f4af4fd63` |
| **Size on Disk** | 13,066,175 bytes | 4,367,239 bytes |
| **Architecture** | `UNet(in_channels=2, num_classes=2, base_channels=16)` | `UNet(in_channels=2, num_classes=2, base_channels=16)` |
| **Preprocessing Lineage** | **Historical Uncorrected Positive Mask**<br>`norm = arr * (arr > 0)` | **Decibel Calibrated Clipping**<br>VV: $[-35.0, -5.0]\text{ dB} \to [0,1]$<br>VH: $[-45.0, -15.0]\text{ dB} \to [0,1]$ |
| **Output Semantics** | Unnormalized logits `(B, 2, H, W)`<br>Ch0: Background, Ch1: Oil Spill<br>`P(oil) = softmax(logits, dim=1)[:, 1, :, :]` | Unnormalized logits `(B, 2, H, W)`<br>Ch0: Background, Ch1: Oil Spill<br>`P(oil) = softmax(logits, dim=1)[:, 1, :, :]` |

---

## 4. Tiling & Full-Scene Reconstruction Strategy

Full-scene evaluations operate on the real $2048 \times 2048$ SAR scenes using the production tiler ([tiling.py](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/app/preprocessing/tiling.py)):
1. **Tile Geometry**: $512 \times 512$ chips with a stride of $448$ ($64\text{ px}$ overlap), yielding exactly $25$ chips per $2048 \times 2048$ scene ($5 \times 5$ grid).
2. **Inference**: Batched tensor evaluation on CUDA with `torch.no_grad()` and `model.eval()`.
3. **Reconstruction**: Blended continuous $2048 \times 2048$ probability surface using a 2D Hann window weighting function:
   $$W(x, y) = \text{Hann}_{2D}(x, y) \ge 0.05$$
4. **Metric Frame**: Binarized prediction against full-scene $2048 \times 2048$ ground-truth GeoTIFF rasters (no artificial sub-chip truncation).

---

## 5. Measured Baseline Results: Model V2 (`ACTIVE_BASELINE`)

### A. Validation Split (7 Scenes: 3 Oil, 2 Look-Alike, 2 No-Oil | 29,358,872 Total Pixels)

| Threshold | TP | FP | FN | TN | IoU (Micro) | Dice / F1 | Precision | Recall | Overall FPR | Clean Ocean FPR | Look-Alike FPR |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.30** | 114 | 154,942 | 155,279 | 29,049,793 | 0.000367 | 0.000734 | 0.000735 | 0.000734 | 0.005305 | 0.000975 | 0.015170 |
| **0.35** | 0 | 27,623 | 155,393 | 29,177,112 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000946 | 0.000000 | 0.003016 |
| **0.40** | 0 | 2,411 | 155,393 | 29,202,324 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000083 | 0.000000 | 0.000255 |
| **0.45** | 0 | 1,596 | 155,393 | 29,203,139 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000055 | 0.000000 | 0.000162 |
| **0.50** | 0 | 1,256 | 155,393 | 29,203,479 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000043 | **0.000000** | **0.000125** |
| **0.60** | 0 | 806 | 155,393 | 29,203,929 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000028 | 0.000000 | 0.000076 |

### B. Held-Out Test Split (5 Part III Scenes | 20,971,520 Total Pixels)

| Threshold | TP | FP | FN | TN | IoU (Micro) | Dice / F1 | Precision | Recall | Overall FPR | Clean Ocean FPR | Look-Alike FPR |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.30** | 1,942 | 39,282 | 203,315 | 20,726,981 | 0.007941 | 0.015758 | 0.047108 | 0.009461 | 0.001892 | N/A* | N/A* |
| **0.35** | 215 | 3,916 | 205,042 | 20,762,347 | 0.001028 | 0.002054 | 0.052046 | 0.001047 | 0.000189 | N/A* | N/A* |
| **0.40** | 1 | 260 | 205,256 | 20,766,003 | 0.000005 | 0.000010 | 0.003831 | 0.000005 | 0.000013 | N/A* | N/A* |
| **0.45** | 0 | 180 | 205,257 | 20,766,083 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000009 | N/A* | N/A* |
| **0.50** | 0 | 156 | 205,257 | 20,766,107 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000008 | N/A* | N/A* |
| **0.60** | 0 | 119 | 205,257 | 20,766,144 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000006 | N/A* | N/A* |

*\*Note: Part III test scenes are categorized under `test_set` in the Zenodo benchmark.*

---

## 6. Measured Baseline Results: Model V4 (`EXPERIMENTAL`)

### A. Validation Split (7 Scenes: 3 Oil, 2 Look-Alike, 2 No-Oil | 29,358,872 Total Pixels)

| Threshold | TP | FP | FN | TN | IoU (Micro) | Dice / F1 | Precision | Recall | Overall FPR | Clean Ocean FPR | Look-Alike FPR |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.30** | 153,494 | 8,188,186 | 1,899 | 21,016,549 | 0.018397 | 0.036129 | 0.018401 | 0.987779 | 0.280372 | 0.064171 | 0.897427 |
| **0.35** | 152,503 | 7,638,768 | 2,890 | 21,565,967 | 0.019566 | 0.038382 | 0.019574 | 0.981402 | 0.261559 | 0.015729 | 0.889448 |
| **0.40** | 151,360 | 7,470,100 | 4,033 | 21,734,635 | 0.019849 | 0.038926 | 0.019860 | 0.974046 | 0.255784 | 0.004852 | 0.881102 |
| **0.45** | 150,332 | 7,390,753 | 5,061 | 21,813,982 | 0.019922 | 0.039066 | 0.019935 | 0.967431 | 0.253067 | 0.003185 | 0.873634 |
| **0.50** | 149,282 | 7,336,670 | 6,111 | 21,868,065 | **0.019925** | **0.039072** | **0.019942** | **0.960674** | 0.251215 | **0.002460** | **0.868254** |
| **0.60** | 146,825 | 7,243,365 | 8,568 | 21,961,370 | 0.019845 | 0.038918 | 0.019868 | 0.944862 | 0.248021 | 0.001691 | 0.859666 |

### B. Held-Out Test Split (5 Part III Scenes | 20,971,520 Total Pixels)

| Threshold | TP | FP | FN | TN | IoU (Micro) | Dice / F1 | Precision | Recall | Overall FPR | Clean Ocean FPR | Look-Alike FPR |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.30** | 86,647 | 4,736,756 | 118,610 | 16,029,507 | 0.017533 | 0.034461 | 0.017964 | 0.422139 | 0.228100 | N/A* | N/A* |
| **0.35** | 81,421 | 4,374,271 | 123,836 | 16,391,992 | 0.017779 | 0.034937 | 0.018274 | 0.396678 | 0.210643 | N/A* | N/A* |
| **0.40** | 79,252 | 4,263,732 | 126,005 | 16,502,531 | 0.017734 | 0.034849 | 0.018248 | 0.386111 | 0.205320 | N/A* | N/A* |
| **0.45** | 77,597 | 4,217,358 | 127,660 | 16,548,905 | 0.017546 | 0.034487 | 0.018067 | 0.378048 | 0.203086 | N/A* | N/A* |
| **0.50** | 76,131 | 4,184,282 | 129,126 | 16,581,981 | **0.017344** | **0.034096** | **0.017869** | **0.370906** | 0.201494 | N/A* | N/A* |
| **0.60** | 73,439 | 4,136,548 | 131,818 | 16,629,715 | 0.016914 | 0.033265 | 0.017444 | 0.357791 | 0.199195 | N/A* | N/A* |

---

## 7. Side-by-Side Model Comparison (Threshold = 0.50)

| Evaluation Split | Model | IoU (Micro) | Dice / F1 | Precision | Recall | Overall FPR | Clean-Ocean FPR | Look-Alike FPR |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Validation (7 scenes)** | **V2** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000043 | **0.000000** | **0.000125** |
| | **V4** | 0.019925 | 0.039072 | 0.019942 | 0.960674 | 0.251215 | **0.002460** | **0.868254** |
| **Held-Out Test (5 scenes)** | **V2** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000008 | N/A | N/A |
| | **V4** | 0.017344 | 0.034096 | 0.017869 | 0.370906 | 0.201494 | N/A | N/A |

### Scientific Forensic Observations:
1. **Model V2 Under-Sensitivity**:
   - V2 with historical uncorrected positive-masking ($arr \times (arr > 0)$) suffers from extreme dB truncation (calibrated SAR backscatter in dB is negative, e.g. $[-35, -5]\text{ dB}$). Because negative values are zeroed, V2 predicts near-zero probability across scenes, producing zero detections at default thresholds ($\text{Recall} = 0\%$, $\text{FPR} \approx 0\%$).
2. **Model V4 High Sensitivity vs Look-Alike Vulnerability**:
   - V4 with calibrated decibel clipping detects positive slicks effectively ($\text{Recall} = 96.07\%$ on Validation Oil scenes), but triggers heavy false alarms on dark look-alike formations ($\text{Look-Alike FPR} = 86.83\%$). Pure clean ocean false alarms remain low ($\text{Clean-Ocean FPR} = 0.25\%$).

---

## 8. Runtime & Hardware Performance Profile

Hardware: **NVIDIA GeForce RTX 5050 Laptop GPU** (`sm_120`, 8150.56 MiB VRAM).

| Run Scenario | Evaluated Scenes | Total 512x512 Tiles | Total Duration | Avg Tile Latency | Peak CUDA VRAM |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **V2 Validation** | 7 | 175 | 5.651 s | 32.29 ms | 157.55 MiB |
| **V2 Held-Out Test** | 5 | 125 | 3.205 s | 25.64 ms | 156.68 MiB |
| **V4 Validation** | 7 | 175 | 5.171 s | 29.55 ms | 156.68 MiB |
| **V4 Held-Out Test** | 5 | 125 | 3.101 s | 24.81 ms | 156.68 MiB |
| **Total Benchmark Run** | **24 scene passes** | **600 tiles** | **17.128 s** | **28.55 ms** | **157.55 MiB** |

---

## 9. Generated Reproducibility Artifacts

All baseline results are archived in machine-readable JSON format:
- [`ml/experiments/results/baseline_evaluation/v2_validation.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/v2_validation.json)
- [`ml/experiments/results/baseline_evaluation/v2_held_out_test.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/v2_held_out_test.json)
- [`ml/experiments/results/baseline_evaluation/v4_validation.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/v4_validation.json)
- [`ml/experiments/results/baseline_evaluation/v4_held_out_test.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/v4_held_out_test.json)
- [`ml/experiments/results/baseline_evaluation/v2_aggregate.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/v2_aggregate.json)
- [`ml/experiments/results/baseline_evaluation/v4_aggregate.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/v4_aggregate.json)
- [`ml/experiments/results/baseline_evaluation/threshold_sweep.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/threshold_sweep.json)
- [`ml/experiments/results/baseline_evaluation/runtime_summary.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/runtime_summary.json)
- [`ml/experiments/results/baseline_evaluation/summary.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/baseline_evaluation/summary.json)

Historical evaluation files (e.g., `docs/model/v2-v3-v4-final-comparison.md`) have been strictly preserved without modification.

---

## 10. Audit Checklist & Verification Summary

- [x] **Real Data**: Verified 40 Sentinel-1 SAR scenes with real VV/VH bands and masks.
- [x] **Real Checkpoints**: V2 and V4 weights loaded from disk; verified SHA-256 hashes.
- [x] **No Training / No Weight Modification**: Zero optimizer calls or gradient steps.
- [x] **No Heuristic Fallback**: Zero synthetic metric generation or demo substitutions.
- [x] **Split Isolation**: 28 train scenes excluded; 5 Part III test scenes quarantined as held-out.
- [x] **Full-Scene Tiling**: $2048 \times 2048$ Hann window blended reconstruction.
- [x] **Genuine Metrics**: Part 0.1 exact mathematical formulations ($TP, FP, FN, TN, \text{IoU}, \text{Dice}, \text{Precision}, \text{Recall}, \text{FPR}$).
- [x] **Category FPR Isolation**: Clean ocean and look-alike FPRs reported independently.
- [x] **Threshold Sweeps**: Full $0.30 - 0.60$ sweep executed.
- [x] **Unit & Integration Tests**: 100/100 tests passed.

---

## 11. Readiness Assessment

### What is READY:
1. Deterministic baseline evaluation runner and full-scene reconstruction harness.
2. Verified ground-truth benchmark metrics across all thresholds on real Sentinel-1 data.
3. Quantified baseline characteristics for both V2 and V4.

### What is NOT Ready:
1. Full 3,020-scene Zenodo benchmark evaluation (local storage limited to 40-scene verified subset).
2. Look-alike dark patch discrimination in V4 ($86.83\%$ look-alike FPR indicates need for contextual / auxiliary look-alike filtering or retrained model).
3. Production deployment of V4 without look-alike suppression mechanisms.

---

## 12. Exact Next Step

**PART 0.5 IS COMPLETE.**  
Awaiting instructions for **PART 0.6** (or subsequent planned milestone).
