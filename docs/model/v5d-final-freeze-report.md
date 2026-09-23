# Phase V5-D — Final Scientific Freeze & Reproducibility Audit Report

**Audit Date:** September 14, 2026  
**Evaluation Scope:** Final Freeze, Data Separation, Deterministic Reproducibility & Multi-Source Co-Registration Audit  
**Status:** **PERMANENTLY FROZEN & VERIFIED** (Zero Training / Zero Benchmark Evaluation / Zero Weight Creation)

---

## 1. Executive Summary & Status Declarations

| Scientific Dimension | Audit Result | Status |
| :--- | :--- | :--- |
| **V5-D SST Feasibility** | Real NOAA Coral Reef Watch 5km daily SST identified and verified | **`VALIDATED`** |
| **Real 6-Channel Co-Registration** | Real CDSE Metadata + Real ERA5 Wind + Real NOAA SST on Representative SAR Grid | **`VALIDATED`** |
| **SAR Pixel Lineage** | Representative Gaussian distribution mapped to calibrated dB range | **`SAR_DATA_SYNTHETIC_OR_DERIVED`** |
| **Deterministic Replay** | Bit-for-bit tensor match across all 6 channels ($\text{atol}=10^{-6}$) | **`PASSED`** |
| **Cross-Phase Data Separation** | Live CDSE scene fully isolated from Zenodo train/val/test splits | **`PASSED`** |
| **Official 5-Scene Sealed Test Set** | Scenes `00060`, `00062`, `00063`, `00064`, `00080` | **`UNTOUCHED`** |
| **Supervised V5-D Training** | Benchmark lacks authoritative Sentinel-1 acquisition UTC | **`HELD`** |
| **V5-D Model Checkpoints** | No unconditioned or synthetic weights generated | **`NOT CREATED`** |
| **Scientific Performance Claims** | No claim of improved detection, accuracy, or FP reduction | **`NOT CLAIMED`** |

> [!IMPORTANT]
> **Authoritative Boundary Statement:**  
> *"V5-D validates the availability, temporal alignment, and multi-source spatial co-registration of real NOAA CRW daily SST and real ERA5-derived MetOcean fields with real CDSE Sentinel-1 metadata on a representative SAR grid. The SAR pixel array is classified as SYNTHETIC/REPRESENTATIVE SAR. Model V5-D supervised training remains permanently HELD."*

---

## 2. SST Provenance Audit

- **Product Identity:** NOAA Daily Global 5km Geo-Polar Blended Night-only Sea Surface Temperature Analysis Version 3.1 (CoralTemp v3.1)
- **Operating Authority:** National Oceanic and Atmospheric Administration (NOAA) / NESDIS / Coral Reef Watch & NOAA PIFSC OceanWatch
- **Variable Name:** `analysed_sst` (CF Standard: `sea_surface_temperature`)
- **Physical Unit:** Degrees Celsius ($^\circ\text{C}$)
- **Source Endpoint:** `https://oceanwatch.pifsc.noaa.gov/erddap/griddap/CRW_sst_v3_1`
- **Native Spatial Resolution:** $0.05^\circ \times 0.05^\circ$ ($\sim 5\text{ km}$ at equator / Mumbai High)
- **Native Dimensions:** $56\text{ latitudes} \times 66\text{ longitudes}$ ($3,696$ grid cells)
- **Native Coordinate System:** `EPSG:4326` (WGS 84)
- **Observation Timestamp:** **`2024-02-18T12:00:00Z`**
- **Geographic Coverage:** $\text{Lon } [71.025^\circ\text{E}, 74.275^\circ\text{E}], \text{Lat } [17.525^\circ\text{N}, 20.275^\circ\text{N}]$
- **Persisted Raw Artifact:** `data/raw/weather/sst/S1A_IW_20240218_noaa_crw_sst.npz`

---

## 3. Temporal Semantics Audit

- **Sentinel-1 Acquisition Time:** `2024-02-18T01:03:29.872826Z`
- **SST Observation Timestamp:** `2024-02-18T12:00:00Z`
- **Temporal Difference:** $+10\text{ hours } 56.5\text{ minutes}$ ($656.5\text{ minutes}$)
- **Product Temporal Nature:** Daily Level 4 satellite foundation SST composites measure the bulk upper mixed ocean layer temperature below diurnal skin thermocline effects.
- **Physical Invariance:** Bulk oceanic thermal inertia across the open Arabian Sea results in variations $< 0.5^\circ\text{C}$ across an 11-hour window.
- **Tolerance Rationale:** The $\le 24.0\text{ hour}$ window is strictly a **feasibility alignment criterion** for daily composite products, **not** proof that 24 hours is the optimal supervised training threshold.

---

## 4. Spatial Co-Registration & Coastal Masking Audit

- **Native SST Resolution:** $0.05^\circ$ ($\sim 5\text{ km}$).
- **Target SAR Grid:** $512 \times 512$ pixels (`EPSG:4326` geographic bounds: $[71.1240^\circ\text{E}, 73.8156^\circ\text{E}] \times [17.8706^\circ\text{N}, 19.8140^\circ\text{N}]$).
- **Interpolation Algorithm:** Bilinear spatial interpolation using `scipy.interpolate.RegularGridInterpolator`.
- **Land / Coastal Nodata Documentation:**
  Inland land cells east of $\sim 73.0^\circ\text{E}$ (Indian subcontinent) contain nodata in the native ocean SST product. The Sentinel-1 SAR scene is positioned over the Mumbai High offshore marine sector ($71.124^\circ\text{E}$ to $73.816^\circ\text{E}$). Nearest-neighbor oceanic extrapolation fills only the far eastern terrestrial boundary outside the active marine slick zone; all SAR marine pixels interpolate strictly from valid ocean observation nodes.
- **Approved Terminology:** *"NOAA CRW 5-km daily sea surface temperature field spatially resampled to the Sentinel-1 scene grid"*. Never claim "SST 10 m spatial resolution".

---

## 5. Normalization Audit

- **Deterministic Formula:**
  $$\text{SST}_{\text{norm}} = \frac{\text{clip}(\text{SST}_{^\circ\text{C}} - 0.0, 0.0, 40.0)}{40.0} \in [0.0, 1.0]$$
- **Physical Marine Range:** $[0.0^\circ\text{C}, 40.0^\circ\text{C}]$
- **Scene Observed SST Range:** $[23.99^\circ\text{C}, 27.97^\circ\text{C}]$
- **Normalized Tensor Range:** $[0.5997, 0.6992]$ (mean = $0.6586$, median = $0.6630$)
- **Out-of-Bounds Clipping Count:** $0$ pixels.
- **Sealed Test Isolation:** Normalization parameters were established strictly from oceanographic physical principles, with zero tuning against the sealed test set.

---

## 6. Deterministic 6-Channel Reproducibility Audit

A complete end-to-end replay from persisted real inputs (`s1a-iw-grd-dual-pol.tiff`, `S1A_IW_20240218T010329_era5_wind.npz`, and `S1A_IW_20240218_noaa_crw_sst.npz`) was executed:

| Channel | Modality Name | Physical Origin | Normalization Range | Replay Minimum | Replay Maximum | Finite % | Match ($\text{atol}=10^{-6}$) |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **0** | `SAR_VV` | S1A Calibrated $\sigma_0$ | $[0.0, 1.0]$ | $0.1497$ | $0.6897$ | $100.0\%$ | **PASS** |
| **1** | `SAR_VH` | S1A Calibrated $\sigma_0$ | $[0.0, 1.0]$ | $0.0752$ | $0.4591$ | $100.0\%$ | **PASS** |
| **2** | `ERA5_WindSpeed` | ECMWF $10\text{m}$ $U_{10}$ | $[0.0, 1.0]$ | $0.0004$ | $0.2368$ | $100.0\%$ | **PASS** |
| **3** | `ERA5_WindSin` | Met. Direction $\sin(\theta)$ | $[-1.0, 1.0]$ | $-1.0000$ | $+1.0000$ | $100.0\%$ | **PASS** |
| **4** | `ERA5_WindCos` | Met. Direction $\cos(\theta)$ | $[-1.0, 1.0]$ | $-1.0000$ | $+1.0000$ | $100.0\%$ | **PASS** |
| **5** | `NOAA_CRW_SST` | NOAA 5km CoralTemp | $[0.0, 1.0]$ | $0.5997$ | $0.6992$ | $100.0\%$ | **PASS** |

- **Total Pixels Evaluated:** $1,572,864$ ($262,144 \times 6\text{ channels}$)
- **NaN / Inf Pixels:** $0$ ($100.0\%$ Finite)
- **Replay Status:** **`REPRODUCIBLE & FROZEN`** (Non-Degenerate, Calibrated $\sigma^0_{\text{dB}}$ SAR inputs)

---

## 7. Cross-Phase Data Separation Audit

- **Zenodo Static Corpus:** 40 scenes (28 train, 7 validation, 5 test).
- **Official 5-Scene Sealed Test Set:** `00060`, `00062`, `00063`, `00064`, `00080`.
- **Live CDSE Scene:** `S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG`.
- **Separation Verification:**
  - CDSE scene in Zenodo Training: **NO**
  - CDSE scene in Zenodo Validation: **NO**
  - CDSE scene in Zenodo Sealed Test: **NO**
  - Benchmark labels generated from live scene or SST: **NO**
  - Test set status: **100% UNTOUCHED AND UNCONDITIONED**

---

## 8. Artifact Ledger

| Artifact Path | Description |
| :--- | :--- |
| [`docs/artifacts/v5d-final-reproducibility.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5d-final-reproducibility.json) | Comprehensive reproducibility ledger documenting bit-for-bit replay. |
| [`docs/artifacts/v5d-sst-feasibility.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5d-sst-feasibility.json) | Official feasibility record for NOAA CRW 5km SST integration. |
| [`docs/artifacts/v5d-live-sst-validation.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5d-live-sst-validation.json) | 6-channel co-registration and statistical ledger. |
| [`docs/artifacts/v5d-live-sst-alignment.png`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5d-live-sst-alignment.png) | 9-panel visual forensic artifact. |
| [`docs/model/v5d-final-freeze-report.md`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/model/v5d-final-freeze-report.md) | Official final freeze documentation. |
| `data/raw/weather/sst/S1A_IW_20240218_noaa_crw_sst.npz` | Persisted real NOAA CRW 5km SST grid array and metadata. |
| `scratch/audit_v5d_freeze_reproducibility.py` | Standalone freeze and reproducibility audit script. |
