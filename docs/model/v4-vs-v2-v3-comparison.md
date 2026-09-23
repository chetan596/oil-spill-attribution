# Head-to-Head Benchmark Comparison: `V2` vs `V3` vs `V4`

**Evaluation Date**: September 14, 2026  
**Evaluation Scope**: Dual-Polarization (VV+VH) Sentinel-1 SAR Marine Oil Slick Segmentation  
**Benchmark Corpus**: Zenodo Sentinel-1 SAR Oil Spill Dataset (40 verified scenes, 640 tiles)  

---

## 1. Executive Summary

This evaluation benchmarks the baseline model (**`unet-dual-pol-sar-v2`**), the historical experimental model (**`unet-dual-pol-sar-v3`**), and the corrected-input model (**`unet-dual-pol-sar-v4`**).

* **V4 Primary Breakthrough**: Correcting the decibel normalization bug allowed the U-Net architecture to learn genuine spatial radar gradients. True positive pixel recovery on the held-out test set surged from **`0` in V2** and **`9` in V3** to **`73,886` in V4** (and `68,342` with overlapping inference).
* **Test Recall Surge**: Test recall improved from **`0.00%`** (V2) to **`35.9968%`** (V4 Stride 512) and **`33.2958%`** (V4 Overlapping 256).
* **Overlapping Inference Effect**: Using $50\%$ tile overlap (stride $256$) with Gaussian window blending improved Test Dice to **`3.4151%`** (vs $3.1106\%$ in non-overlapping) and reduced False Positive Rate from **`21.53%`** to **`17.96%`**.
* **Scientific Status**: While V4 achieves real spatial learning and substantial pixel recovery over V2/V3, precision remains low ($1.63\% - 1.80\%$) due to dark ocean clutter and biogenic look-alike confusion. Therefore, **V4 remains classified as an experimental model requiring auxiliary meteorological conditioning for production deployment.**

---

## 2. Head-to-Head Metric Comparison Table

| Metric | V2 Baseline ($\tau = 0.35$) | V3 Experimental ($\tau = 0.25$) | V4 Stride 512 ($\tau = 0.50$) | V4 Overlap 256 ($\tau = 0.50$) |
| :--- | :--- | :--- | :--- | :--- |
| **Input Normalization** | Flawed (Zero-Filled) | Flawed (Zero-Filled) | **Corrected Decibel (dB)** | **Corrected Decibel (dB)** |
| **Inference Strategy** | Stride 512 | Stride 512 | Stride 512 (Standard) | Stride 256 (50% Overlap + Gaussian) |
| **IoU (%)** | **0.0000%** | **0.0043%** | **1.5799%** | **1.7372%** |
| **Dice / F1 Score (%)** | **0.0000%** | **0.0087%** | **3.1106%** | **3.4151%** |
| **Precision (%)** | **0.0000%** | **0.4440%** | **1.6255%** | **1.7999%** |
| **Recall (Sensitivity) (%)** | **0.0000%** | **0.0044%** | **35.9968%** | **33.2958%** |
| **Overall Test FPR (%)** | **0.0002%** | **0.0097%** | **21.5325%** | **17.9555%** |
| **True Positives (TP)** | 0 | 9 | **73,886** | **68,342** |
| **False Positives (FP)** | 44 | 2,018 | 4,471,489 | 3,728,686 |
| **False Negatives (FN)** | 205,257 | 205,248 | 131,371 | 136,915 |
| **True Negatives (TN)** | 20,766,219 | 20,764,245 | 16,294,774 | 17,037,577 |

---

## 3. Look-Alike & Clean Ocean Benchmark Performance

* **Look-Alike Benchmark (10 Scenes, $41,943,040$ pixels)**:
  * V2: $\text{FPR} = 0.0824\%$
  * V3: $\text{FPR} = 10.4539\%$
  * V4: $\text{FPR} = 22.8410\%$ (High sensitivity to all dark oceanic backscatter signatures)
* **Clean Ocean Benchmark (10 Scenes, $41,943,040$ pixels)**:
  * V2: $\text{FPR} = 0.0595\%$
  * V3: $\text{FPR} = 10.4434\%$
  * V4: $\text{FPR} = 19.8320\%$

---

## 4. Key Takeaways & Deployment Strategy

1. **Retain `unet-dual-pol-sar-v2` as Baseline Operational Model**:
   * Ensures near-zero false alarms ($< 0.1\%$ FPR) for current production and demonstration scenarios.
2. **Expose `unet-dual-pol-sar-v4` for Experimental Inspection in SAR Evidence Viewer**:
   * Enables researchers and operators to inspect true spatial candidate detections with full decibel dynamic range.
3. **Roadmap to Production Grade**:
   * Integrate GFS/ERA5 wind speed surface conditioning into the dual-pol U-Net to filter low-wind look-alikes ($< 3\text{ m/s}$) from real mineral slicks.
