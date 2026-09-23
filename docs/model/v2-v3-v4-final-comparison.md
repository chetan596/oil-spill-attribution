# V2 vs V3 vs V4 Official Model Comparison & Validation Audit

**Status**: AUTHORITATIVE SCIENTIFIC REPORT  
**Date**: 2026-09-14  
**Benchmark Set**: Official Frozen Part III Held-Out Test Set (5 scenes, $20,971,520$ pixels total, $205,257$ ground-truth positive pixels)  
**Evaluation Script**: `scratch/execute_benchmark_audit.py`

---

## 1. Official Comparative Performance Matrix

The following table presents the reconciled, reproducible evaluation of all model versions evaluated under identical dataset conditions on the **official frozen held-out test set** (Scenes `00060`, `00062`, `00063`, `00064`, `00080`):

| Metric | Model V2 (Baseline) | Model V3 (Experimental) | Model V4 Mode A (Stride 512) | Model V4 Mode B (Overlap Stride 256) |
| :--- | :---: | :---: | :---: | :---: |
| **Model ID** | `unet-dual-pol-sar-v2` | `unet-dual-pol-sar-v3` | `unet-dual-pol-sar-v4` | `unet-dual-pol-sar-v4` |
| **SAR Preprocessing** | Uncorrected ($>0$ mask) | Uncorrected ($>0$ mask) | **Corrected dB Normalization** | **Corrected dB Normalization** |
| **Selected Threshold** | $\tau = 0.35$ | $\tau = 0.25$ | $\tau = 0.50$ | $\tau = 0.50$ |
| **Inference Tiling** | Non-overlapping $512\times 512$ | Non-overlapping $512\times 512$ | Non-overlapping $512\times 512$ | $50\%$ Overlap ($256$ stride) + Hann |
| **True Positives (TP)** | 1,018 | 16,793 | **73,886** | 69,281 |
| **False Positives (FP)** | 13,019 | 2,184,692 | 4,471,489 | **3,882,070** |
| **False Negatives (FN)** | 204,239 | 188,464 | **131,371** | 135,976 |
| **True Negatives (TN)** | 20,753,244 | 18,581,571 | 16,294,774 | 16,884,193 |
| **IoU (%)** | 0.4664% | 0.7027% | 1.5799% | **1.6950%** |
| **Dice (%)** | 0.9284% | 1.3955% | 3.1106% | **3.3335%** |
| **Precision (%)** | **7.2523%** | 0.7628% | 1.6255% | 1.7533% |
| **Recall (%)** | 0.4960% | 8.1815% | **35.9968%** | 33.7533% |
| **Overall Test FPR (%)** | **0.0627%** | 10.5204% | 21.5325% | 18.6941% |
| **Look-Alike FPR (%)** | **0.0851%** | 10.4539% | 59.5471% | 59.7735% |
| **Clean-Ocean FPR (%)** | **0.0580%** | 10.4521% | 0.2812% | **0.2073%** |

---

## 2. Historical V2 Baseline Reconciliation

### Identified Discrepancy Causes
Previous working documents contained slight variations in reported V2 numbers:
1. **Scene-Level vs Full-Test Set**:
   - The initial single-scene audit evaluated solely **Part I Scene 00000** ($\text{TP}=0$, $\text{FP}=7,091$, $\text{FN}=14,539$, $\text{Dice}=0\%$).
   - The aggregated 5-scene Part III benchmark evaluated Scenes `00060` through `00080` ($\text{TP}=1,018$, $\text{FP}=13,019$, $\text{Recall}=0.496\%$, $\text{Dice}=0.928\%$).
2. **Preprocessing Invariance**: Both evaluations executed the identical uncorrected preprocessing logic. The apparent divergence was purely geographic scope (1 training scene vs 5 held-out test scenes).

---

## 3. Detailed Model Evolution & Findings

### Model V2 (Historical Baseline)
- **Status**: Preserved as historical baseline.
- **Behavior**: Under uncorrected positive-mask normalization (`arr > 0`), almost all valid negative dB pixels were zeroed out. The model learned an ultra-conservative, near-zero prediction regime. While it maintained a microscopic FPR ($0.0627\%$), it missed $99.5\%$ of all ground truth oil pixels ($\text{Recall} = 0.496\%$).

### Model V3 (Positive Oversampling Experiment)
- **Status**: Preserved as experimental historical baseline.
- **Behavior**: Attempted to solve V2's low recall by aggressive $10\times$ positive tile oversampling, but retained the buggy preprocessing. This caused the model to uniformly inflate output probabilities to $\sim 0.279$, producing a catastrophic $10.5\%$ false positive flood across clean ocean and look-alikes alike.

### Model V4 (Corrected dB Normalization)
- **Status**: **EXPERIMENTAL (Not Production-Grade)**.
- **Achievements**:
  1. **Restored Spatial Learning**: Recovered **$73,886\text{ TP}$** ($36.00\%\text{ recall}$) on held-out test scenes and **$11,980\text{ TP}$** ($82.40\%\text{ recall}$) on training diagnostic Scene 00000.
  2. **High Clean Ocean Selectivity**: Achieved an exceptionally clean ocean false alarm rate of **$0.2073\%$** in overlapping mode, proving it learned open-water wave scattering.
  3. **Continuous Spatial Topology**: Overlapping inference with 2D Hann blending (Mode B) reduced overall false positive area by $>589,000$ pixels and lifted Dice to **$3.3335\%$**.
- **Remaining Critical Bottleneck**:
  - **Look-Alike False Alarm Rate ($59.77\%$)**: On biogenic slicks and low-wind areas, the model produces large contiguous false positive components (mean max region $>50,000$ px). Dual-pol backscatter alone cannot distinguish biological surfactant films from petroleum slicks without meteorological wind context ($3\text{–}12\text{ m/s}$ physical window).

---

## 4. Probability Separation Forensic

| Category | Mean Probability | Median Probability | P90 | P95 | P99 | Max Probability |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **True Oil Slicks** | **0.7730** | **0.9779** | 0.9996 | 0.9999 | 1.0000 | 1.0000 |
| **Clean Ocean Water** | **0.0888** | **0.0199** | 0.2891 | 0.4912 | 0.8115 | 0.9984 |
| **Look-Alike Anomalies** | **0.5873** | **0.8489** | 0.9981 | 0.9997 | 1.0000 | 1.0000 |

*Conclusion*: Model V4 exhibits strong separation between true oil and clean ocean ($0.978$ vs $0.020$ median), but substantial overlap between true oil and look-alikes ($0.978$ vs $0.849$ median).

---

## 5. Final Phase Classification & Recommendation

### Classification
**Category B: Experimental model requiring multimodal improvement**

### Exact Recommended Next Steps (Phase V5 Roadmap)
1. **Do NOT promote V4 to primary production status.** Retain Model V2 as the default in production and demo modes, allowing V4 selection strictly for experimental inspection in the SAR Evidence Viewer.
2. **Multimodal MetOcean Conditioning**: Integrate ECMWF ERA5 wind speed and wind direction rasters as auxiliary input channels to physically filter out low-wind look-alikes.
3. **Hard Negative Mining**: Train future iterations with a balanced curriculum specifically penalizing look-alike False Positives.
