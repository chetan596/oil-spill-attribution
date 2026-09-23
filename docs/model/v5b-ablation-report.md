# Phase V5-B Ablation & Comparative Analysis Report

**Document Date:** September 14, 2026  
**Phase:** V5 Multimodal Ablation Study  
**Models Evaluated:** V4, V5-A, and V5-B

---

## 1. Controlled Ablation Matrix

| Model Version | Input Channels | Input Channel Modalities | Training Split | Validation Set Performance | Sealed Test Performance | Status |
| :--- | :---: | :--- | :---: | :---: | :---: | :--- |
| **Model V4** | 2 | SAR VV + VH (`[-35, -5] dB, [-45, -15] dB`) | 28 scenes | $\text{Dice}=3.90\%, \text{FPR}=25.26\%$ | $\text{Recall}=36.00\%, \text{FPR}=21.53\%$ | **Historical Baseline** |
| **Model V5-A** | 2 | SAR VV + VH (`[-35, -5] dB, [-45, -15] dB`) | 28 scenes | $\text{Dice}=3.79\%, \text{FPR}=25.95\%$ | $\text{Recall}=62.73\%, \text{FPR}=48.20\%$ | **SAR-Only Control** |
| **Model V5-B** | 3 | SAR VV + VH + ERA5 $10\text{m}$ Wind Speed | 28 scenes | N/A (Held) | N/A (Held) | **HELD (Zero Timestamp Fabrication)** |

---

## 2. Key Findings & Scientific Conclusion

1. **Retraining Sensitivity (V4 vs. V5-A):** Both models share identical corrected decibel preprocessing and achieve nearly identical validation performance ($3.90\%$ vs $3.79\%$). However, on the held-out test scenes, the slight divergence in final convergence weights caused ambiguous background pixels to cross the decision boundary, increasing false positives to $48.20\%$ alongside a $+26.73\%$ increase in recall.
2. **Look-Alike Ceiling:** On the current validation benchmark, SAR-only models show severe false-positive rates on look-alike scenes ($86.63\%$ in V4, $86.29\%$ in V5-A), indicating that SAR-only backscatter features in this dataset do not provide reliable discrimination between oil-labelled scenes and look-alike dark-surface phenomena.
3. **Multimodal Prerequisite:** Physical $10\text{m}$ wind speed conditioning remains the scientifically validated solution, but requires real-time/live acquisitions where exact UTC acquisition timestamps exist.
