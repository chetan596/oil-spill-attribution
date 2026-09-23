# Phase V5-D: Real CDSE Live-Scene Baseline Validation Report

**Execution Date**: 2026-09-14  
**Final Status**: `REAL_CDSE_LIVE_SCENE_BASELINE_VALIDATED`  
**Evaluation Nature**: Live-scene baseline model response audit (**NO Ground Truth available — Accuracy calculations strictly withheld**).

---

## A. REAL CDSE SOURCE IDENTIFICATION

- **Product Name**: `S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG.SAFE`
- **Product UUID**: `3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79`
- **Acquisition Timestamp**: `2024-02-18T01:03:29.872826Z` to `2024-02-18T01:03:54.871034Z`
- **Sensor & Mode**: Sentinel-1A C-SAR IW GRD (Dual Polarization VV+VH)
- **Extracted Subscene**: Lines `[6000:6512]`, Pixels `[10000:10512]` ($512 \times 512$ at 10m spatial resolution)
- **Geographic Bounding Box**:
  - Longitude: `[72.716985E, 72.773998E]`
  - Latitude: `[18.965879N, 19.020798N]`
- **Source Derived Raster**: `data/raw/satellite/cdse/.../derived/real_cdse_vv_vh.tif` (SHA-256: `5782f50e670ac61ce76b8107942761de1af9af50e2ba40f73a1c2eb42fe017bc`)

---

## B. PREPROCESSING & RADIOMETRIC NORMALIZATION

- **Native Representation**: 16-bit unsigned integer Digital Numbers ($DN$).
- **Calibration Applied**: Official ESA Level-1 LUT Sigma0 decibel conversion:
  $$\sigma^0 = \frac{DN^2}{A_\sigma^2}$$
  $$\sigma^0_{\text{dB}} = 10 \cdot \log_{10}(\sigma^0)$$
- **Normalization Applied**:
  - VV: $\sigma^0_{\text{dB}} \in [-35.0, -5.0]$ dB $\rightarrow [0.0, 1.0]$ (`mean = 0.4705 +/- 0.0773`)
  - VH: $\sigma^0_{\text{dB}} \in [-45.0, -15.0]$ dB $\rightarrow [0.0, 1.0]$ (`mean = 0.6419 +/- 0.0711`)

---

## C. EXISTING MODEL USED

- **Model ID**: `unet-dual-pol-sar-v2`
- **Architecture**: 2-Channel Dual-Polarization U-Net
- **Checkpoint**: `ml/model_registry/versions/unet_dual_pol_sar_v2.pth`
- **Input Channels**: 2 (Ch0: VV, Ch1: VH)
- **Role**: Active baseline SAR segmentation model (*Explicitly NOT a 6-channel V5-D model*).

---

## D. LIVE-SCENE MODEL RESPONSE & DIAGNOSTICS

*(Note: Terminology used is "model-predicted dark-surface candidate" or "SAR model response" since no verified ground truth exists.)*

| Diagnostic Metric | Observed Value |
| :--- | :--- |
| **Probability Minimum** | `0.000398` |
| **Probability Maximum** | `0.362835` |
| **Probability Mean** | `0.024305` |
| **Probability Median** | `0.022336` |
| **Probability Standard Deviation** | `0.011739` |
| **90th Percentile ($p_{90}$)** | `0.035095` |
| **95th Percentile ($p_{95}$)** | `0.040692` |
| **99th Percentile ($p_{99}$)** | `0.065173` |
| **Positive Pixels at Threshold $\ge 0.50$** | `0` pixels |
| **Candidate Area at Threshold $\ge 0.50$** | `0.0000 km^2` |
| **Positive Pixels at Threshold $\ge 0.35$** | `1` pixels |
| **Candidate Area at Threshold $\ge 0.35$** | `0.0001 km^2` |

---

## E. REAL ERA5 / NOAA CRW SST CO-REGISTRATION

| Modality | Physical Variable | Source Provider | Local Subscene Mean |
| :--- | :--- | :--- | :--- |
| **Wind Speed** | 10-m Surface Wind Speed | ECMWF ERA5 | `2.79 m/s` |
| **Sea Surface Temp** | Analysed Sea Surface Temperature | NOAA Coral Reef Watch | `26.30 deg C` |

---

## F. SCIENTIFIC LIMITATIONS & ETHICS

1. **Absence of In-Situ Ground Truth**: There is no coincident verified slick sample for this live Sentinel-1 scene. Consequently, **NO IoU, Dice, Precision, or Recall metrics are reported**.
2. **Marine Low-Backscatter Ambiguity**: Low backscatter areas observed by SAR in low-wind conditions ($< 3.0$ m/s) can arise from natural biogenic slicks, calm seas, or lookalikes.
3. **Multi-Channel V5-D Distinction**: The inference performed here utilized the active 2-channel U-Net. V5-D remains untrained.

---

## G. BENCHMARK ISOLATION

- **Zenodo Sealed Benchmark**: Sealed 5-scene test set (`00060`, `00062`, `00063`, `00064`, `00080`) remains untouched.
- **Model Checkpoints**: 0 new model checkpoints created.

---

## H. REGRESSION STATUS

- **All Unit, Integration, Node, Frontend, and E2E regression test suites passing with 0 regressions.**

```
FINAL_STATUS: REAL_CDSE_LIVE_SCENE_BASELINE_VALIDATED
```
