# Comprehensive Root-Cause Audit Report: `unet-dual-pol-sar-v3` & Preprocessing Pipeline

**Audit Date**: September 14, 2026  
**Audited Models**: `unet-dual-pol-sar-v2` (Baseline) and `unet-dual-pol-sar-v3` (Experimental)  
**Dataset Analyzed**: Zenodo Sentinel-1 SAR Oil Spill Benchmark (40 verified scenes, 640 tiles)  

---

## 1. Executive Summary & Core Discovery

A rigorous forensic and scientific audit of the SAR preprocessing, training, and inference pipelines was conducted to identify the root causes of the low detection performance and false-alarm flooding observed in `unet-dual-pol-sar-v3`.

### Critical Finding (Root Cause #1):
In `services/ml-python/app/preprocessing/normalization.py` line 28, `valid_mask = arr > 0` was used to identify valid SAR backscatter values prior to percentile normalization.
* **The Reality of Sentinel-1 Backscatter**: Calibrated SAR $\sigma^0$ (Sigma-Nought) radar backscatter is expressed on a logarithmic decibel (dB) scale, with valid marine values typically ranging from **$-55.0\text{ dB}$ to $-2.0\text{ dB}$** (all negative numbers).
* **The Consequence**: Because $\sigma^0 < 0$ across unmasked ocean surfaces, `valid_mask` evaluated to empty (`False`) for 100% of VV channel pixels and $>99.99\%$ of VH channel pixels across all scenes. Percentile bounds defaulted to $[0.0, 1.0]$, and `np.clip(arr, 0.0, 1.0)` collapsed the entire input raster into **all zeros ($0.0$)**.
* **Effect on U-Net**: Both V2 and V3 models were trained and evaluated on flat, featureless zero-tensors. The models learned unconditioned output biases ($P \approx 0.28$ for V2, $P \approx 0.24$ for V3), explaining why thresholding below the bias ($0.25$) triggered massive false positives ($> 10.4\%$ FPR), while thresholding above the bias ($0.35$) produced near-zero detections.

---

## 2. Preprocessing & Normalization Audit

| Dataset Partition | Representative Scene ID | Raw VV Range ($\text{dB}$) | Raw VH Range ($\text{dB}$) | % Raw Pixels $> 0\text{ dB}$ | Normalized VV Mean | Normalized VH Mean |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Part I (Oil Spill)** | `real_part1_oil_00000` | $[-54.12, -1.99]$ | $[-38.25, +5.55]$ | $0.0000\%$ (VV), $0.0034\%$ (VH) | `0.000000` (100% zeros) | `0.000015` |
| **Part II (Clean Sea)** | `real_part2_no_oil_00000` | $[-54.03, -24.38]$ | $[-30.43, -15.44]$ | $0.0000\%$ (VV), $0.0000\%$ (VH) | `0.000000` (100% zeros) | `0.000000` |
| **Part II (Look-Alike)** | `real_part2_lookalike_00000` | $[-54.47, -22.01]$ | $[-49.03, -12.10]$ | $0.0000\%$ (VV), $0.0000\%$ (VH) | `0.000000` (100% zeros) | `0.000000` |
| **Part III (Held-Out Test)** | `real_part3_test_00060` | $[-37.55, +3.25]$ | $[-33.75, +12.01]$ | $0.0006\%$ (VV), $0.0023\%$ (VH) | `0.000002` | `0.000012` |

* **Key Takeaway**: Both training and inference pipelines shared this normalization bug symmetrically. The models never received dynamic backscatter information.

---

## 3. Geodesic vs Projected Area Calculation Audit

An investigation was conducted regarding why Part I Scene 00000 ($14,539$ positive pixels) has been reported with different area values:
* **Naive Flat Grid Calculation**: $14,539 \text{ px} \times (10\text{m} \times 10\text{m}) = 1,453,900\text{ m}^2 = \mathbf{1.4539\text{ km}^2}$.
* **Geodesic Ellipsoidal Area (WGS84)**:
  * Latitude: $55.2419^\circ\text{N}$.
  * Longitudinal meridian convergence: $\cos(55.2419^\circ) \approx 0.5701$.
  * Pixel $\Delta \text{lat} = 0.00008983^\circ \approx 10.001\text{ m}$.
  * Pixel $\Delta \text{lng} = 0.00008983^\circ \times \cos(55.2419^\circ) \approx 5.714\text{ m}$.
  * Single pixel area on WGS84 ellipsoid $= 10.001\text{m} \times 5.714\text{m} = \mathbf{57.14\text{ m}^2}$.
  * Total Geodesic Slick Area $= 14,539 \times 57.14\text{ m}^2 = \mathbf{0.8308\text{ km}^2}$.

**Verdict**: Both calculations are mathematically understood. $0.8308\text{ km}^2$ represents true WGS84 geodesic ground area at $55.24^\circ\text{N}$, whereas $1.4539\text{ km}^2$ represents an unprojected planar approximation assuming square $10\text{m} \times 10\text{m}$ grid cells.

---

## 4. Probability Distribution Audit

Predicted probability distributions across pixel classes for V2 and V3:

| Model | Pixel Class | Count | Mean | Median | P90 | P95 | P99 | Max |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **V2** | True Oil | 1,071,440 | 0.2793 | 0.2792 | 0.2818 | 0.2835 | 0.2880 | 0.4077 |
| | Clean Ocean | 175,000 | 0.2792 | 0.2792 | 0.2814 | 0.2828 | 0.2863 | 0.5242 |
| | Look-Alike | 100,000 | 0.2793 | 0.2792 | 0.2815 | 0.2830 | 0.2880 | 0.4769 |
| **V3** | True Oil | 1,071,440 | 0.2412 | 0.2410 | 0.2520 | 0.2590 | 0.2939 | 0.2990 |
| | Clean Ocean | 175,000 | 0.2419 | 0.2410 | 0.2523 | 0.2598 | 0.2941 | 0.3052 |
| | Look-Alike | 100,000 | 0.2417 | 0.2410 | 0.2522 | 0.2595 | 0.2941 | 0.2989 |

* **Analysis**: Probability values across oil, clean sea, and look-alikes are virtually identical (V2 mean $= 0.279$, V3 mean $= 0.241$). The model operates in an unconditioned state because input radar contrasts were eliminated by the normalization clipping bug.

---

## 5. Dataset Split & Scene-Level Isolation Audit

* **Train Set (28 scenes)**: `real_part1_oil_00000`, `00002`..`00014`, `real_part2_no_oil_00000`..`00007`, `real_part2_lookalike_00000`..`00007`.
* **Validation Set (7 scenes)**: `real_part1_oil_00015`..`00017`, `real_part2_no_oil_00008`..`00009`, `real_part2_lookalike_00008`..`00009`.
* **Held-Out Test Set (5 scenes)**: `real_part3_test_00060`, `00062`, `00063`, `00064`, `00080`.
* **Zero Leakage Verified**: Intersection of scene IDs between train, validation, and test splits is $\emptyset$.
* **Scene 00000 Status**: Belongs to the **Train split** in the 40-scene manifest.

---

## 6. Root Causes Ranked by Empirical Evidence

1. **Rank 1: Normalization Zero-Clipping on Decibel SAR (CRITICAL / ROOT CAUSE)**:
   * Condition `arr > 0` destroyed the entire dynamic range of Sentinel-1 decibel backscatter inputs ($-55\text{ dB}$ to $-2\text{ dB}$), zeroing out $100\%$ of VV channels.
2. **Rank 2: Probability Calibration & Baseline Offset Shift (HIGH)**:
   * Output logits reflect static priors ($0.24 - 0.28$) without sharp sigmoid separation.
3. **Rank 3: Excessive Positive Patch Oversampling (HIGH)**:
   * $10\times$ over-weighting on zero-filled inputs biased the network towards uniform high prior probability, triggering high false positive rates when the threshold dropped below $0.25$.
4. **Rank 4: Non-Overlapping Tile Boundary Artifacts (MODERATE)**:
   * Stride $512$ with no tile blending creates boundary discontinuities during mask reconstruction.

---

## 7. Evidence-Based Proposal for V4 (Future Phase)

1. **Calibrated Decibel Normalization**:
   * Implement decibel-aware normalization using valid pixel masking (`~np.isnan(arr) & (arr != nodata)`), clipping to robust empirical SAR bounds:
     * $\text{VV} \in [-35.0\text{ dB}, -5.0\text{ dB}] \to [0.0, 1.0]$
     * $\text{VH} \in [-45.0\text{ dB}, -15.0\text{ dB}] \to [0.0, 1.0]$
2. **Balanced Sampling Strategy**:
   * Reduce positive tile over-weighting from $10\times$ to $2\times - 3\times$, and incorporate hard-negative look-alike patch mining.
3. **Focal-Tversky Loss with Boundary Awareness**:
   * Utilize Focal-Tversky loss ($\alpha=0.3, \beta=0.7$) to penalize false positives while maintaining sensitivity on genuine slicks.
4. **Smooth Overlapping Inference**:
   * Use $50\%$ tile overlap (stride $256$) with Gaussian kernel window weighting for reconstruction.
