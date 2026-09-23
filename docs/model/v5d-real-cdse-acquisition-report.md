# Phase V5-D: Genuine CDSE Sentinel-1 SAR Acquisition & Calibration Audit

**Execution Date**: 2026-09-14  
**Final Status**: `REAL_CDSE_SAR_PIXELS_EXTRACTED`  
**Supervised Training Status**: `HELD` (Zero weights generated, benchmark untouched)

---

## 1. Product Identification & Cryptographic Lineage

| Parameter | Value |
| :--- | :--- |
| **Product Name** | `S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG.SAFE` |
| **Product UUID** | `3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79` |
| **Source Provider** | Copernicus Data Space Ecosystem (CDSE) |
| **Acquisition Start** | `2024-02-18T01:03:29.872826Z` |
| **Acquisition End** | `2024-02-18T01:03:54.871034Z` |
| **Orbit / Pass** | Absolute: `52606`, Relative: `65`, Descending |
| **Archive Size** | `996,690,709 bytes` (~950.5 MB) |
| **Raw VV File SHA-256** | `38c0f2d5f916bdf9a1d0d08394b8acb2584ea5c261f2f4d8b0adbad5f528dfd2` |
| **Raw VH File SHA-256** | `3d753a64c9eaa5b0bcf2659d1aea5f0eb9690c415fd3318fa1409104f48ce8c2` |

---

## 2. Measurement Representation & Radiometric Calibration

- **Native Representation**: Unsigned 16-bit integers (`uint16`) representing linear Digital Numbers ($DN$).
- **ESA Calibration Applied**:
  $$\sigma^0 = \frac{DN^2}{A_\sigma^2}$$
  $$\sigma^0_{\text{dB}} = 10 \cdot \log_{10}(\sigma^0)$$
  where $A_\sigma$ is the bilinear interpolated calibration vector from `annotation/calibration/calibration-s1a-iw-grd-*.xml`.

### Raw DN & Calibrated Backscatter Statistics

| Metric | Raw VV (DN) | Raw VH (DN) | Calibrated VV (Sigma0 dB) | Calibrated VH (Sigma0 dB) |
| :--- | :--- | :--- | :--- | :--- |
| **Min** | `7` | `5` | `-38.75 dB` | `-41.66 dB` |
| **Max** | `143` | `78` | `-12.56 dB` | `-17.82 dB` |
| **Mean** | `56.68` | `32.22` | `-20.88 dB` | `-25.74 dB` |
| **Median** | `56.00` | `32.00` | `-20.70 dB` | `-25.56 dB` |
| **Std Dev** | `14.60` | `7.63` | `2.32 dB` | `2.13 dB` |

---

## 3. Multimodal 6-Channel Validation Tensor

The complete 6-channel input tensor `[1, 6, 512, 512]` was constructed using co-registered genuine physical observations:

| Channel | Physical Variable | Source Provider | Physical Range | Normalized Mean +/- Std |
| :--- | :--- | :--- | :--- | :--- |
| **Ch0** | SAR VV Backscatter | CDSE Sentinel-1A | `[-38.75, -12.56] dB` | `0.4705 +/- 0.0773` |
| **Ch1** | SAR VH Backscatter | CDSE Sentinel-1A | `[-41.66, -17.82] dB` | `0.6419 +/- 0.0711` |
| **Ch2** | 10-m Wind Speed | ECMWF ERA5 | `[2.06, 2.61] m/s` | `0.0909 +/- 0.0051` |
| **Ch3** | Wind Direction Sine | ECMWF ERA5 | `[-0.99, -0.98]` | `0.0062 +/- 0.0012` |
| **Ch4** | Wind Direction Cosine | ECMWF ERA5 | `[0.10, 0.18]` | `0.5779 +/- 0.0082` |
| **Ch5** | Sea Surface Temp (SST) | NOAA Coral Reef Watch | `[26.20, 26.29] C` | `0.6499 +/- 0.0008` |

---

## 4. Verification & Integrity Confirmation

1. **Deterministic Replay**: Verified. Re-reading and re-calibrating yields identical bitwise outputs.
2. **Synthetic SAR Status**: Quarantined and permanently replaced with genuine observation data.
3. **Zenodo Benchmark Separation**: The sealed 5-scene test set remains strictly separated and untouched.
4. **Model Training**: Zero gradient updates executed. V5-D remains in audit status `HELD`.

**FINAL DECLARATION**: `REAL_CDSE_SAR_PIXELS_EXTRACTED`
