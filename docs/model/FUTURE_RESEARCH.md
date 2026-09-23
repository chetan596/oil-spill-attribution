# Ocean Guard AI — Future ML Research Boundary

## Status: Future Research Roadmap (Post-Part 0.12)

> [!IMPORTANT]
> **Boundary Notice**: This document outlines potential research directions and methodology enhancements for future research cycles. These items are strictly separated from the frozen Part 0.12 research release (`OG-SAR-ML-RESEARCH-RELEASE-V0.12`) and must **NOT** be executed within the current frozen phase.

---

## 1. Context & Motivation

The formal Part 0.11 sealed held-out benchmark established that while `unet-dual-pol-sar-v09d-residual-loss` (V09D) achieved controlled improvements over baseline V6 (+26.8% higher held-out Micro IoU, higher precision, and 28.6% fewer false positive pixels), absolute held-out performance on low-contrast Pacific Northwest and complex Gulf of Mexico scenes remained low (Micro IoU ~0.0118, Recall ~0.0151).

This performance gap illustrates domain generalization challenges inherent in single-source SAR segmentation when trained on a modest 28-scene training partition.

---

## 2. Research Trajectories for Future Cycles

### A. Geographically Diverse Large-Scale Dataset Expansion
- **Current Limitation**: Training set comprised 28 scenes predominantly clustered in specific oceanographic zones.
- **Future Objective**: Incorporate diverse SAR datasets across varied oceanic regimes (e.g., North Sea, Mediterranean, Malacca Strait, Arabian Sea, South China Sea).
- **Target**: Expand from 40 to 200+ fully verified Sentinel-1 SLC/GRD scenes with multi-annotator consensus masks.

### B. Dedicated Look-Alike & Negative Scene Curation
- **Current Limitation**: Look-alike phenomena (low-wind zones, internal waves, biogenic slicks, algae, upwelling) were under-represented in the held-out test partition.
- **Future Objective**: Curate dedicated hard-negative partitions containing verified natural look-alikes to train discriminant classifiers specifically tuned for look-alike suppression.

### C. Metocean & Environmental Auxiliary Conditioning
- **Current Limitation**: Segmentation operates purely on static 2-channel SAR radar backscatter ($[\sigma^0_{VV}, \sigma^0_{VH}]$) without knowledge of ambient physical forcing.
- **Future Objective**:
  - Integrate co-located ECMWF / ERA5 / NOAA GFS 10-meter wind speed and direction vectors.
  - Integrate GHRSST sea surface temperature and ocean current velocity fields.
  - Multi-modal conditioning via feature concatenation or cross-attention fusion.

### D. Thin & Diffuse Slick Sensitivity Enhancement
- **Current Limitation**: Low-damping, thin, or weathered diffuse slicks exhibit small backscatter contrast ($\Delta \sigma^0 < 2\text{ dB}$) relative to ambient sea clutter, leading to false negatives at standard thresholds.
- **Future Objective**:
  - Investigate multi-scale wavelet / texture decomposition (e.g., GLCM, Gabor filters).
  - Test adaptive local contrast normalization and background-subtracted backscatter anomaly maps.

### E. Foundation Model Backbone & Self-Supervised Pretraining
- **Current Limitation**: Models were trained from scratch on 28 scenes.
- **Future Objective**:
  - Leverage geospatial foundation backbones pretrained on massive SAR archives (e.g., Prithvi, SatMAE, DOFA).
  - Self-supervised masked autoencoder (MAE) pretraining on unannotated global Sentinel-1 SAR scenes prior to fine-tuning on annotated oil spill masks.

### F. Calibrated Uncertainty Estimation & Evidential Deep Learning
- **Current Limitation**: Output probabilities are deterministic and subject to overconfidence in unseen domain regimes.
- **Future Objective**:
  - Implement Monte Carlo Dropout, Deep Ensembles, or Evidential Deep Learning for pixel-wise aleatoric and epistemic uncertainty quantification.
  - Surface low-confidence detections to human radar analysts rather than forcing binary decisions.

---

## 3. Governance & Anti-Contamination Protocols for Future Cycles

1. **Independent Test Benchmarks**: Any new research cycle must construct a fresh, untouched test partition from new satellite acquisitions. The Part III test scenes (`00060`, `00062`, `00063`, `00064`, `00080`) remain permanently burned as an evaluation benchmark and cannot be reused for training or iterative model selection.
2. **Pre-Registration Requirement**: All loss configurations, architectural hypotheses, and operating threshold selection rules must be pre-registered prior to opening any subsequent test set.
3. **Neutral Scientific Reporting**: Future reports must maintain strict adherence to descriptive metrics without manufacturing production-readiness claims without extensive multi-basin validation.
