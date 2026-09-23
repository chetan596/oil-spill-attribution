# PART 0.12 — MODEL FREEZE & SCIENTIFIC AUDIT REPORT

**Project**: Ocean Guard AI / SIH 26143  
**Repository**: `oil-spill-attribution`  
**Phase**: PART 0.12 (Model Freeze & Scientific Audit)  
**Release Identifier**: `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Date**: 2026-09-19  
**Status**: `FROZEN_RESEARCH_RELEASE`  
**Scientific Classification**: `EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS (NOT PRODUCTION-READY)`

---

## 1. Research Objective

The objective of this phase is to establish a permanent, immutable scientific freeze for the complete SAR marine oil spill segmentation research cycle (Parts 0.1 through 0.11).

Following the formal sealed benchmark on the held-out Part III test set (Part 0.11), this phase creates a frozen release manifest, validates cryptographic integrity across all checkpoints and dataset manifests, verifies registry immutability, audits scientific claims across documentation, and delineates the boundary between this frozen research release and future research trajectories.

> [!IMPORTANT]
> **No Model Retraining or Post-Hoc Tuning**:
> No additional training, fine-tuning, threshold optimization, architecture modification, or dataset adjustments are permitted. The sealed benchmark results are recorded honestly without distortion.

---

## 2. Dataset Provenance & Frozen Splits

The research cycle utilized the curated Zenodo Sentinel-1 Real SAR Marine Oil Spill dataset ([DOI: 10.5281/zenodo.13761290](https://doi.org/10.5281/zenodo.13761290)), comprising 40 verified dual-polarization SAR scenes ($2048 \times 2048$ pixels each, total 167,772,160 pixels):

- **Dataset Manifest**: [`ml/datasets/manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/manifest.json)
- **Dataset Manifest SHA-256**: `9d4cf3f6755976c72bfdb1172bbc03616efeba8e15869ba893665db506dc621d`
- **Splits**:
  1. **Training Set (28 scenes)**: Real Sentinel-1 scenes used for model training across baseline V6 and experimental iterations V8A–V8D, V09A–V09D.
  2. **Validation Set (7 scenes)**: Frozen validation partition used exclusively for checkpoint selection, loss evaluation, and hyperparameter characterization.
  3. **Held-Out Test Set (5 scenes)**: Quarantined test partition (`real_part3_test_00060`, `real_part3_test_00062`, `real_part3_test_00063`, `real_part3_test_00064`, `real_part3_test_00080`), opened strictly once for the sealed Part 0.11 benchmark.

> [!CAUTION]
> **Permanent Test Set Quarantine**: The 5 Part III test scenes have been evaluated once. They are permanently locked against further model selection or training to preserve future scientific validity.

---

## 3. Preprocessing Specification

The validated preprocessing pipeline is frozen as `sentinel1_sigma0_db_v1`:

- **Input Format**: 2-channel C-Band SAR in calibrated radar cross-section $\sigma^0$ in decibels ($\text{dB}$).
- **Channel 0 (VV Polarization)**: Range $[-35.0\text{ dB}, -5.0\text{ dB}] \to [0.0, 1.0]$ via linear scaling:
  $$\text{VV}_{\text{norm}} = \text{clip}\left(\frac{\sigma^0_{\text{VV}} - (-35.0)}{-5.0 - (-35.0)}, 0.0, 1.0\right)$$
- **Channel 1 (VH Polarization)**: Range $[-45.0\text{ dB}, -15.0\text{ dB}] \to [0.0, 1.0]$ via linear scaling:
  $$\text{VH}_{\text{norm}} = \text{clip}\left(\frac{\sigma^0_{\text{VH}} - (-45.0)}{-15.0 - (-45.0)}, 0.0, 1.0\right)$$
- **Non-Finite Handling**: `NaN` replaced with minimum decibel value ($-35\text{ dB}$ for VV, $-45\text{ dB}$ for VH).

### Historical Preprocessing Flaw Audit
Part 0.7 established that historical models V1, V2, and V3 utilized the preprocessing line `arr * (arr > 0)`, which truncated 100% of negative calibrated decibel values ($\sigma^0 < 0\text{ dB}$) to zero. This removed virtually all ocean backscatter and slick signal, rendering V2 predictions near-zero. V2 is retained solely as a historical baseline.

---

## 4. Experiment History Summary

```
Part 0.1 - 0.6: Diagnostics & Dataset Verification (Discovered negative-dB zeroing flaw)
      │
Part 0.7: Corrected Preprocessing & Retrained Baseline (V6, Standard U-Net)
      │
Part 0.8: Loss Experiments (V8A Baseline, V8B Focal-Dice, V8C Focal-Tversky, V8D High-FG-Weight)
      │
Part 0.9A-C: Single-Variable Architecture Experiments (V09A Multi-Scale, V09B Attention, V09C Residual)
      │
Part 0.9D: Architecture + Loss Synthesis (V09D: Residual U-Net + High FG Loss)
      │
Part 0.10: Pre-Benchmark Synthesis & Ablation Audit
      │
Part 0.11: Sealed Held-Out Benchmark Evaluation (5 Test Scenes)
      │
Part 0.12: Final Model Freeze & Scientific Audit (FROZEN_RESEARCH_RELEASE)
```

---

## 5. Final Model Specification

The primary experimental candidate resulting from the research pipeline is:

- **Model ID**: `unet-dual-pol-sar-v09d-residual-loss` (V09D)
- **Architecture**: `UNetResidual` (Encoder/Decoder with Residual Convolutional Blocks)
- **Parameter Count**: 1,114,338 parameters
- **Input Channels**: 2 ($\text{VV} + \text{VH}$)
- **Output Classes**: 2 (Class 0: Clean Sea Surface, Class 1: Marine Oil Spill)
- **Base Channels**: 16 ($16 \to 32 \to 64 \to 128 \to 256$)
- **Loss Function**: `CombinedLoss` ($1.0 \times \text{Weighted CE}(\text{fg}=10.0) + 1.0 \times \text{SoftDice}$)
- **Checkpoint File**: [`ml/model_registry/versions/unet_dual_pol_sar_v09d_residual_loss.pth`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/model_registry/versions/unet_dual_pol_sar_v09d_residual_loss.pth)
- **Checkpoint SHA-256**: `ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d`
- **Scientific Status**: `EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS`

---

## 6. Frozen Validation Results (@ Pre-Registered Threshold 0.50)

| Model ID | Micro IoU | Micro Dice | Precision | Recall | Overall FPR | Clean Ocean FPR | Look-Alike FPR |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **V09D (`UNetResidual` + High FG Loss)** | **0.152376** | **0.264455** | **0.207887** | 0.363318 | **0.007366** | 0.001355 | **0.022586** |
| **V6 (Standard U-Net Baseline)** | 0.052088 | 0.099018 | 0.054818 | **0.511252** | 0.020297 | **0.000023** | 0.161488 |
| **V2 (Historical Reference)** | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000000 |

*Validation Takeaway*: V09D achieved a $+192.5\%$ relative increase in validation IoU and an $86.0\%$ reduction in look-alike false positive rate over baseline V6 on the validation split.

---

## 7. Frozen Held-Out Benchmark Results (@ Pre-Registered Threshold 0.50)

| Model ID | Micro IoU | Micro Dice | Precision | Recall | Overall FPR | Clean Ocean FPR | TP (px) | FP (px) | FN (px) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **V09D (Primary Candidate)** | **0.011823** | **0.023370** | **0.052205** | **0.015054** | **0.002701** | 0.000397 | **3,090** | **56,100** | 202,167 |
| **V6 (Controlled Baseline)** | 0.009323 | 0.018474 | 0.032585 | 0.012891 | 0.003783 | **0.000372** | 2,646 | 78,558 | **202,611** |
| **V2 (Historical / Non-Comparable)**| 0.000000 | 0.000000 | 0.000000 | 0.000000 | 0.000008 | 0.000007 | 0 | 156 | 205,257 |

*Held-Out Benchmark Takeaway*: In the direct controlled test comparison, V09D achieved $+26.8\%$ higher Micro IoU, $+60.2\%$ higher precision, and suppressed 22,458 false positive pixels ($-28.6\%$) compared to baseline V6.

---

## 8. Generalization Gap Analysis

- **V09D Validation $\to$ Held-Out Test**: Micro IoU $0.1524 \to 0.0118$ ($\Delta = -0.1406$, $-92.2\%$ relative change); Recall $0.3633 \to 0.0151$ ($\Delta = -0.3483$).
- **V6 Validation $\to$ Held-Out Test**: Micro IoU $0.0521 \to 0.0093$ ($\Delta = -0.0428$, $-82.1\%$ relative change); Recall $0.5113 \to 0.0129$ ($\Delta = -0.4984$).

### Scientific Interpretation
These observations are consistent with substantial geographic and scene-domain variation across oceanic regions, but the benchmark does not establish a single causal source for the generalization gap. Potential factors include:
1. **Low-Contrast Diffuse Boundaries**: Test scenes `00062` and `00064` in the Pacific Northwest feature weathered, thin slicks with subtle damping contrast that fall below the $0.50$ probability threshold.
2. **Regional Sediment & River Outflow**: Test scene `00080` in the northern Gulf of Mexico exhibits strong coastal river plume gradients and altered background backscatter regimes.
3. **Clutter in Low-Wind Conditions**: Localized calm ocean patches in scene `00060` produced false positive clusters.

---

## 9. Error Analysis & Scene Breakdown

- **Clean Ocean Scenes (`00060`, `00063`)**: Both models maintained very low false positive rates ($<0.065\%$). V09D produced 3,331 FP pixels vs V6's 3,117 FP pixels across 8,388,608 clean ocean pixels.
- **Pacific Northwest Slicks (`00062`, `00064`)**: Both models failed to detect the diffuse slick bodies at threshold $0.50$ (0 TP pixels), reflecting severe damping contrast attenuation.
- **Gulf of Mexico Complex Slick (`00080`)**: V09D detected 3,090 true positive pixels with 38,186 FP pixels (IoU 0.0189, Precision 7.37%), outperforming V6 (2,646 TP pixels, 60,082 FP pixels, IoU 0.0140, Precision 4.41%).

---

## 10. Limitations

1. **Not Production Ready**: The low absolute recall ($1.51\%$) on unseen geographic test scenes prevents deployment as an autonomous alert system without human expert review.
2. **Diffuse Slick Vulnerability**: Thin or weathered slicks with backscatter contrast $<2\text{ dB}$ are frequently missed.
3. **Domain Sensitivity**: Models trained on modest geographic sample sizes show sensitivity to background sea state and sediment boundaries.
4. **Lack of Metocean Context**: Inability to incorporate dynamic wind fields or sea surface temperature leads to ambiguity in low-wind conditions.

---

## 11. Checkpoint Cryptographic Hashes

| Model Version | Architecture | Checkpoint File | Parameter Count | SHA-256 Hash |
| :--- | :--- | :--- | :---: | :--- |
| **V09D** | `UNetResidual` | `unet_dual_pol_sar_v09d_residual_loss.pth` | 1,114,338 | `ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d` |
| **V6** | `UNet` | `unet_dual_pol_sar_v6.pth` | 1,080,802 | `bcf3d6bc988b910fa67c0c31c89cb2c861da73f0b02159c579cb28e5039920e3` |
| **V2** | `UNet` | `unet_dual_pol_sar_v2.pth` | 1,080,802 | `905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd` |

---

## 12. Dataset Hash

- **Manifest**: `ml/datasets/manifest.json`
- **SHA-256**: `9d4cf3f6755976c72bfdb1172bbc03616efeba8e15869ba893665db506dc621d`
- **Verified Scenes**: 40 GeoTIFFs (28 Train, 7 Validation, 5 Held-Out Test)

---

## 13. Test Suite Verification

- **Total Tests**: 173 passed
- **Regressions**: 0
- **Coverage**: Model loading, architecture dimensions, preprocessing math, drift simulation, geospatial projection, REST API integration, test lock release schema, checkpoint cryptographic hashes.

---

## 14. Scientific Claims Policy & Legal Guardrails

1. **No Autonomous Proof of Discharge**: SAR detection and AIS vessel drift analysis provide spatio-temporal proximity correlation only. Correlation does not establish legal liability or criminal responsibility.
2. **Neutral Descriptive Reporting**: Prohibit superlatives ("best", "perfect", "100% accurate").
3. **Honest Error Documentation**: Always report both positive detections and false alarm rates.

---

## 15. Frozen Release Definition

- **Release Name**: `OG-SAR-ML-RESEARCH-RELEASE-V0.12`
- **Model Registry State**:
  - `active_model_id`: `unet-dual-pol-sar-v2` (Historical Baseline Artifact)
  - `research_candidate_model_id`: `unet-dual-pol-sar-v09d-residual-loss` (Experimental Research Candidate)
- **Master Manifest**: [`ml/model_registry/frozen_release_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/model_registry/frozen_release_manifest.json)

---

## 16. Future Research Boundary

Future research directions are documented in [`docs/model/FUTURE_RESEARCH.md`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/model/FUTURE_RESEARCH.md) and include:
- Multi-basin global SAR dataset expansion (200+ scenes).
- Metocean feature fusion (ECMWF 10m wind vectors, GHRSST).
- Pretrained geospatial foundation model backbones.
- Evidential deep learning for pixel-level uncertainty calibration.

---

## 17. Reproducibility Instructions

To reproduce the frozen benchmarks and verify all hashes:
```bash
# 1. Activate environment
source services/ml-python/.venv/Scripts/activate

# 2. Run Part 0.12 Model Freeze Verification
python scripts/run_part012_model_freeze.py

# 3. Run full test suite
python -m pytest services/ml-python/tests/unit services/ml-python/tests/integration
```
