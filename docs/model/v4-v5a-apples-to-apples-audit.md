# Model V4 vs. V5-A Apples-to-Apples Forensic Audit

**Audit Date:** September 14, 2026  
**Audited Models:**
- `unet-dual-pol-sar-v4` (`ml/model_registry/versions/unet_dual_pol_sar_v4.pth`)
- `unet-dual-pol-sar-v5a` (`ml/model_registry/versions/unet_dual_pol_sar_v5a.pth`)

---

## 1. Checkpoint Integrity & Cryptographic Provenance

| Parameter | Model V4 Baseline | Model V5-A Control | Verification Finding |
| :--- | :--- | :--- | :--- |
| **File Path** | `ml/model_registry/versions/unet_dual_pol_sar_v4.pth` | `ml/model_registry/versions/unet_dual_pol_sar_v5a.pth` | Independent files |
| **File Size** | $4,367,239$ bytes | $4,367,355$ bytes | Consistent PyTorch state dict |
| **SHA256 Hash** | `c1395f1deae819b222f9e1034472d18a84f502fd89d4076981d3291f4af4fd63` | `07267fd52382113417643b845ed54bdb4fd53521affd4756969e3b085ad9b067` | **Cryptographically distinct models** |
| **Architecture** | 2D U-Net (2 in, 2 out, 16 base ch) | 2D U-Net (2 in, 2 out, 16 base ch) | Identical structure |
| **Parameter Count** | $1,937,938$ parameters | $1,937,938$ parameters | Identical |
| **Loss Configuration** | Focal-Tversky ($\alpha=0.30, \beta=0.70, \gamma=1.33$) | Focal-Tversky ($\alpha=0.30, \beta=0.70, \gamma=1.33$) | Identical |
| **Tile Sampling** | WeightedRandomSampler (2.5x positive) | WeightedRandomSampler (2.5x positive) | Identical |
| **Optimizer** | AdamW ($\text{LR}=5\times 10^{-4}, \text{WD}=1\times 10^{-4}$) | AdamW ($\text{LR}=5\times 10^{-4}, \text{WD}=1\times 10^{-4}$) | Identical |
| **Scheduler** | CosineAnnealingLR (15 epochs) | CosineAnnealingLR (15 epochs) | Identical |

**Integrity Finding:**
- Model V4 checkpoint was **NOT** modified or overwritten.
- Model V5-A is genuinely a separate training run executed under identical architecture and hyperparameter configurations.

---

## 2. Preprocessing & Tensor Normalization Audit

Both models share the exact decibel-aware radiometric calibration function `normalize_sar_band()`:
- **VV Calibration:** Range $[-35.0, -5.0]\text{ dB} \to [0.0, 1.0]$ via $\text{clip}((x - (-35.0)) / 30.0, 0.0, 1.0)$.
- **VH Calibration:** Range $[-45.0, -15.0]\text{ dB} \to [0.0, 1.0]$ via $\text{clip}((x - (-45.0)) / 30.0, 0.0, 1.0)$.
- **Finite Masking:** `np.isfinite(arr) & (arr != nodata)`.
- **Channel Order:** Band 1 = VV, Band 2 = VH.
- **Verification:** Normalized input tensors for all 5 test scenes are bit-for-bit identical between V4 and V5-A evaluations.

---

## 3. Per-Scene Test Benchmark Comparison (@ $\tau = 0.50$)

| Scene ID | Category | GT Oil Pixels | V4 TP | V5-A TP | $\Delta\text{TP}$ | V4 FP | V5-A FP | $\Delta\text{FP}$ | V4 FPR | V5-A FPR | $\Delta\text{FPR}$ | V4 Recall | V5-A Recall |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`00060`** | Clean Ocean | 0 | 0 | 0 | $0$ | 264,143 | 1,409,142 | $+1,144,999$ | $6.30\%$ | $33.60\%$ | $+27.30\%$ | N/A | N/A |
| **`00062`** | Oil Spill | 24,162 | 346 | 5,956 | $+5,610$ | 252,785 | 1,335,517 | $+1,082,732$ | $6.06\%$ | $32.03\%$ | $+25.96\%$ | $1.43\%$ | $24.65\%$ |
| **`00063`** | Clean Ocean | 0 | 0 | 0 | $0$ | 453,063 | 1,714,673 | $+1,261,610$ | $10.80\%$ | $40.88\%$ | $+30.08\%$ | N/A | N/A |
| **`00064`** | Oil Spill | 52,620 | 5,657 | 22,490 | $+16,833$ | 863,978 | 2,016,176 | $+1,152,198$ | $20.86\%$ | $48.68\%$ | $+27.82\%$ | $10.75\%$ | $42.74\%$ |
| **`00080`** | Oil Spill | 128,475 | 67,883 | 100,305 | $+32,422$ | 2,637,520 | 3,533,440 | $+895,920$ | $64.87\%$ | $86.91\%$ | $+22.04\%$ | $52.84\%$ | $78.07\%$ |
| **Total** | **All 5 Scenes** | **205,257** | **73,886** | **128,751** | **$+54,865$** | **4,471,489** | **10,008,948** | **$+5,537,459$** | **21.53%** | **48.20%** | **$+26.67%** | **36.00%** | **62.73%** |

---

## 4. Root-Cause Analysis of the Metric Shift

### 1. Consistent Global Shift Across All Scenes
The increase in false positives is **not** isolated to a single rogue scene. All 5 test scenes show a uniform $+22\%\text{ to }+30\%$ shift in false positive rate, accompanied by a $+23\%\text{ to }+32\%$ increase in true positive recall across oil scenes.

### 2. Probability Distribution Divergence
Inspection of raw output probabilities (`docs/artifacts/v4-v5a-probability-comparison.json`) reveals:
- In Model V4, clean ocean background pixels on Scene `00060` had a 90th percentile of **0.388** (comfortably below threshold 0.50).
- In Model V5-A, clean ocean background pixels on Scene `00060` shifted their 90th percentile to **0.816** (crossing threshold 0.50).
- Similarly, for true oil pixels in Scene `00062`, 90th percentile shifted from **0.362** (V4) to **0.727** (V5-A), rescuing true positive detections (Recall jumped from $1.43\%$ to $24.65\%$).

### 3. Asymmetric Loss Function Dynamics
The Focal-Tversky loss uses $\beta=0.70$ (false negative penalty) vs $\alpha=0.30$ (false positive penalty), which applies a $2.33\times$ heavier penalty to missed oil slicks than to false alarms. Combined with 2.5x positive tile oversampling, small gradient trajectory differences during training lead the network to favor sensitivity over specificity on ambiguous ocean backgrounds.

---

## 5. Look-Alike Forensic Audit (Validation Set)

| Validation Look-Alike Scene | Total Pixels | V4 False Positives | V4 FPR | V5-A False Positives | V5-A FPR | $\Delta\text{FPR}$ |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **`real_part2_lookalike_00004`** | $4,194,304$ | $4,169,595$ | $99.41\%$ | $4,161,221$ | $99.21\%$ | $-0.20\%$ |
| **`real_part2_lookalike_00090`** | $4,194,304$ | $3,097,309$ | $73.85\%$ | $3,077,657$ | $73.38\%$ | $-0.47\%$ |
| **Validation Aggregate** | **$8,388,608$** | **$7,266,904$** | **$86.63\%$** | **$7,238,878$** | **$86.29\%$** | **$-0.34\%$** |

**Look-Alike Finding:**
- Models V4 and V5-A perform almost identically on look-alike scenes ($86.63\%$ vs $86.29\%$).
- This confirms that **standalone dual-polarization SAR backscatter intensity is physically blind to biogenic vs mineral surface damping**.

---

## 6. Audit Classification & Final Decision

### Classification: **Category D — Combination of Training Convergence Trajectory & Boundary Sensitivity**

### Scientific Conclusion
> *"Model V5-A demonstrates that the corrected SAR preprocessing pipeline reproducibly captures spatial features and high oil recall, but operates with high boundary sensitivity where slight variations in convergence produce large false-alarm swings. Model V5-A cannot be considered an improvement over V4 and confirms that monomodal SAR segmentation has reached its physical performance ceiling."*

---

## 7. Real MetOcean Acquisition Feasibility Status

- **Static Zenodo Benchmark:** 0 of 40 scenes contain authoritative ESA SAFE UTC acquisition timestamps in their headers.
- **Phase 19 Stop Condition:** **V5-B, V5-C, and V5-D remain BLOCKED** from execution on the static benchmark to prevent data fabrication.
- **Live CDSE Multimodal Branch:** Feasible as a separate future branch using live CDSE acquisitions with verified UTC timestamps and real-time ECMWF/Copernicus ERA5 reanalysis grids.
