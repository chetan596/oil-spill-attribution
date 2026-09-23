# Phase V5-D — Real SST Feasibility & Multimodal Alignment Audit Report

**Audit Date:** September 14, 2026  
**Pipeline:** Sentinel-1 C-Band SAR + ECMWF ERA5 Wind (Speed & Direction) + NOAA CRW 5km Daily SST 6-Channel Fusion  
**Evaluation Scope:** SST Source Feasibility & Multimodal Tensor Co-Registration Audit (Zero Model Weight Training / Zero Benchmark Evaluation)

---

## 1. Explicit Scientific Notice & Boundary Constraints

> [!IMPORTANT]
> **V5-D supervised training remains strictly HELD because the static labelled Zenodo benchmark lacks authoritative acquisition timestamps. This execution performs ONLY a feasibility and real-data co-registration audit for adding Sea Surface Temperature (SST) as the sixth modality.**
>
> This report does **NOT** claim:
> - That Model V5-D improves oil spill detection accuracy over V4, V5-A, V5-B, or V5-C.
> - That SST reduces false positives or eliminates look-alike ambiguities.
> - That Model V5-D is superior to previous versions.
> - That Model V5-D is production-grade.
>
> Mandatory Scientific Principle:
> *"V5-D feasibility audit validates only the availability and co-registration of real SST data. No supervised V5-D performance claim is made."*

---

## 2. SST Source Identification & Provenance (OBSERVED)

An exhaustive investigation of authoritative public earth observation archives identified the following operational SST product matching the live CDSE Sentinel-1 scene:

| Metadata Parameter | Documented Specification | Verification Source |
| :--- | :--- | :--- |
| **Product Name** | NOAA Coral Reef Watch Daily Global 5km Geo-Polar Blended Night-Only Sea Surface Temperature Analysis (CoralTemp v3.1) | NOAA / NESDIS Coral Reef Watch |
| **Operating Agency** | National Oceanic and Atmospheric Administration (NOAA) | NOAA OceanWatch / PIFSC |
| **Variable Name** | `analysed_sst` (Analyzed Sea Surface Temperature) | NOAA ERDDAP Metadata (`CRW_sst_v3_1`) |
| **Physical Unit** | Degrees Celsius ($^\circ\text{C}$) | CF Standard Name `sea_surface_temperature` |
| **Native Spatial Resolution** | $0.05^\circ \times 0.05^\circ$ ($\sim 5\text{ km}$ at equator / Mumbai High) | Embedded Product Grid |
| **Native Temporal Resolution** | Daily foundation composite ($12:00:00\text{ UTC}$) | NOAA Data Specification |
| **Observation Timestamp** | **`2024-02-18T12:00:00Z`** | Exact matching calendar day UTC |
| **Data Ingestion URL** | `https://oceanwatch.pifsc.noaa.gov/erddap/griddap/CRW_sst_v3_1` | Authenticated NOAA ERDDAP Endpoint |
| **Persisted Local Archive** | `data/raw/weather/sst/S1A_IW_20240218_noaa_crw_sst.npz` | Zero Synthetic Data |

---

## 3. Spatial & Temporal Co-Registration

### A. Temporal Compatibility
- **Sentinel-1 Acquisition Time:** `2024-02-18T01:03:29.872826Z`
- **SST Product Observation Time:** `2024-02-18T12:00:00Z`
- **Temporal Difference:** $10\text{ hours } 56.5\text{ minutes}$ ($656.5\text{ minutes}$)
- **Oceanographic Physical Constraint:** Daily Level 4 satellite foundation SST composites measure the foundation bulk temperature of the upper mixed ocean layer below diurnal warming cycles. Over open ocean waters, bulk thermal inertia exhibits diurnal variations $< 0.5^\circ\text{C}$ over an 11-hour window.
- **Temporal Matching Tolerance:** $\le 24.0\text{ hours}$ ($\le 1440.0\text{ minutes}$) for daily satellite composite products.
- **Temporal Alignment Status:** **`ALIGNED`** ($\Delta t = 10.94\text{ h} \le 24.0\text{ h}$).

### B. Spatial Co-Registration & Terminology
- **Target SAR Grid:** $512 \times 512$ pixels (`EPSG:4326` geographic bounds: $[71.1240^\circ\text{E}, 73.8156^\circ\text{E}] \times [17.8706^\circ\text{N}, 19.8140^\circ\text{N}]$).
- **Native SST Footprint:** $56 \times 66$ grid cells ($0.05^\circ$ step covering $[71.025^\circ, 74.275^\circ]\text{E} \times [17.525^\circ, 20.275^\circ]\text{N}$).
- **Resampling Method:** Bilinear spatial interpolation using `scipy.interpolate.RegularGridInterpolator` with nearest-neighbor oceanic extrapolation for coastal/land-masked boundary nodata.
- **Approved Terminology:** *"NOAA CRW 5-km daily sea surface temperature field spatially resampled to the Sentinel-1 scene grid"*. Never state "SST 10 m spatial resolution".

---

## 4. Empirical SST Statistics & 6-Channel Multimodal Tensor

### A. Real SST Statistical Distribution
| Domain | Min ($^\circ\text{C}$) | Max ($^\circ\text{C}$) | Mean ($^\circ\text{C}$) | Median ($^\circ\text{C}$) | Std ($^\circ\text{C}$) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Native NOAA 5km Grid (Ocean)** | $23.99^\circ\text{C}$ | $28.19^\circ\text{C}$ | $26.84^\circ\text{C}$ | $26.86^\circ\text{C}$ | $0.74^\circ\text{C}$ |
| **Resampled SAR Grid ($512 \times 512$)** | $23.99^\circ\text{C}$ | $27.97^\circ\text{C}$ | $26.34^\circ\text{C}$ | $26.52^\circ\text{C}$ | $0.95^\circ\text{C}$ |
| **Normalized SST $[0.0, 1.0]$** | $0.5997$ | $0.6992$ | $0.6586$ | $0.6630$ | $0.0238$ |

### B. SST Normalization Strategy
- **Physical Bounding Range:** $[0.0^\circ\text{C}, 40.0^\circ\text{C}]$ (encompassing the global tropical-to-polar marine regime).
- **Exact Normalization Formula:**
  $$T_{\text{norm}} = \frac{\text{clip}(T_{\text{SST}} - 0.0, 0.0, 40.0)}{40.0} \in [0.0, 1.0]$$

### C. 6-Channel Multimodal Tensor Verification
| Channel Index | Modality Name | Physical Meaning | Normalization Range | Observed Values | Finite Check |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **0** | `SAR_VV` | Corrected calibrated Sigma0 dB | $[0.0, 1.0]$ | Valid | $100\%$ Finite |
| **1** | `SAR_VH` | Corrected calibrated Sigma0 dB | $[0.0, 1.0]$ | Valid | $100\%$ Finite |
| **2** | `ERA5_WindSpeed` | 10-m surface wind speed $U_{10}$ | $[0.0, 1.0]$ | $[0.0004, 0.2368]$ | $100\%$ Finite |
| **3** | `ERA5_WindSin` | Meteorological wind direction $\sin(\theta)$ | $[-1.0, 1.0]$ | $[-1.0000, +1.0000]$ | $100\%$ Finite |
| **4** | `ERA5_WindCos` | Meteorological wind direction $\cos(\theta)$ | $[-1.0, 1.0]$ | $[-1.0000, +1.0000]$ | $100\%$ Finite |
| **5** | `NOAA_CRW_SST` | Real 5km daily sea surface temperature | $[0.0, 1.0]$ | $[0.5997, 0.6992]$ | $100\%$ Finite |

- **Constructed Tensor Dimensions:** `[1, 6, 512, 512]` ($1,572,864$ total values)
- **Finite Value Count:** $1,572,864 / 1,572,864$ ($100.0\%$)
- **NaN / Inf Pixels:** $0$ ($0.0\%$)
- **Tensor Integrity Status:** **`VALIDATED_PASS`**

---

## 5. Artifact Audit Trail

1. **Feasibility Ledger:** [`docs/artifacts/v5d-sst-feasibility.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5d-sst-feasibility.json)
2. **Validation Ledger JSON:** [`docs/artifacts/v5d-live-sst-validation.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5d-live-sst-validation.json)
3. **Visual Forensic Artifact (9-Panel):** [`docs/artifacts/v5d-live-sst-alignment.png`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5d-live-sst-alignment.png)
4. **Persisted Real SST Grid:** `data/raw/weather/sst/S1A_IW_20240218_noaa_crw_sst.npz`
5. **Validation & Audit Script:** `scratch/validate_v5d_live_sst_alignment.py`
