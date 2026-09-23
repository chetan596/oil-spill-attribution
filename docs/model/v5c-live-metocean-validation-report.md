# Phase V5-C Live MetOcean Alignment Validation Report

**Validation Date:** September 14, 2026  
**Pipeline:** Live Sentinel-1 C-Band SAR + ECMWF ERA5 5-Channel MetOcean Wind-Direction Fusion  
**Evaluation Scope:** Preprocessing Pipeline & Multimodal Tensor Co-Registration Validation (Zero Model Training / Zero Test Set Evaluation)

---

## 1. Explicit Scientific Notice & Boundary Constraints

> [!IMPORTANT]
> **V5-C supervised training remains strictly HELD because the static labelled Zenodo benchmark lacks authoritative acquisition timestamps. This execution validates only the real-data 5-channel MetOcean alignment pipeline.**
>
> This report does **NOT** claim:
> - That Model V5-C improves detection accuracy over V4 or V5-A.
> - That circular wind-direction features reduce look-alike false positives on unlabelled scenes.
> - That Model V5-C is production-grade.
> - That unlabelled live CDSE scenes constitute labelled training data.
>
> Valid scientific wording prior to benchmark evaluation:
> *"V5-C introduces circular wind-direction features as an additional environmental context modality."*
>
> The sole purpose of this phase is to empirically prove that the multimodal data pipeline correctly co-registers **REAL SENTINEL-1 DATA** with **REAL ERA5-DERIVED WIND SPEED AND METEOROLOGICAL DIRECTION** without synthesizing or fabricating environmental variables.

---

## 2. Observed SAR Acquisition Evidence (OBSERVED)

The Sentinel-1 acquisition was ingested directly via the Copernicus Data Space Ecosystem (CDSE) client with full ESA SAFE product manifest headers:

| Parameter | Observed Value | Verification Source |
| :--- | :--- | :--- |
| **Product Identifier** | `S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG` | ESA CDSE STAC Catalogue |
| **Product UUID** | `3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79` | Copernicus SAFE Product Metadata |
| **Satellite Platform** | Sentinel-1A (C-Band Synthetic Aperture Radar) | ESA Mission Metadata |
| **Sensor Mode & Product** | Interferometric Wide (IW), Ground Range Detected High-Resolution (GRDH) | ESA Mission Metadata |
| **Polarization** | Dual-Polarization ($\text{VV} + \text{VH}$) | GeoTIFF Band Layout |
| **Acquisition Start UTC** | **`2024-02-18T01:03:29.872826Z`** | Authoritative SAFE Manifest XML |
| **Acquisition End UTC** | **`2024-02-18T01:03:54.871034Z`** | Authoritative SAFE Manifest XML |
| **Geographic Bounding Box** | $\text{Lon } [71.1240^\circ\text{E}, 73.8156^\circ\text{E}], \text{Lat } [17.8706^\circ\text{N}, 19.8140^\circ\text{N}]$ (Mumbai High) | GeoTIFF Affine Transform |
| **Coordinate System** | `EPSG:4326` (WGS 84 Geographic Coordinates) | Embedded GeoTIFF CRS |
| **Native Scene Dimensions** | $512 \times 512$ pixels | GeoTIFF Header |

---

## 3. Real ERA5 Reanalysis Co-Registration & Wind Derivation (PREPROCESSING)

### A. Temporal Alignment
- **Sentinel-1 Acquisition Time:** `2024-02-18T01:03:29Z`
- **Nearest Integer ERA5 Hour:** **`2024-02-18T01:00:00Z`**
- **Temporal Discrepancy:** $+3.49\text{ minutes}$
- **Tolerance Threshold:** $\pm 180.0\text{ minutes}$ ($\Delta t \le \text{tolerance} \implies$ **`ALIGNED`**)
- **Temporal Substitution:** **None** (Real historical ECMWF ERA5 reanalysis).

### B. Physical Derivations
Given real eastward ($u_{10}$) and northward ($v_{10}$) surface wind components:

1. **Surface Wind Speed ($10\text{ m}$):**
   $$U_{10} = \sqrt{u_{10}^2 + v_{10}^2}$$
   Normalized via:
   $$U_{10, \text{norm}} = \frac{\text{clip}(U_{10}, 0.0, 25.0)}{25.0} \in [0.0, 1.0]$$

2. **Meteorological Wind Direction (FROM):**
   Meteorological direction is defined as the direction FROM which the wind blows (measured clockwise from True North):
   $$\theta_{\text{met\_rad}} = \text{atan2}(-u_{10}, -v_{10}) \pmod{2\pi}$$
   $$\theta_{\text{met\_deg}} = (\text{degrees}(\theta_{\text{met\_rad}}) + 360) \pmod{360}$$

3. **Circular Encodings:**
   $$\text{direction\_sin} = \sin(\theta_{\text{met\_rad}}) \in [-1.0, 1.0]$$
   $$\text{direction\_cos} = \cos(\theta_{\text{met\_rad}}) \in [-1.0, 1.0]$$
   > [!NOTE]
   > Direction $\sin$ and $\cos$ remain strictly in $[-1.0, 1.0]$ to preserve trigonometric orthogonality; they are **never** normalized into $[0, 1]$.

### C. Spatial Resampling Terminology
- **Native ERA5 Resolution:** $0.25^\circ \times 0.25^\circ$ ($\sim 28\text{ km}$).
- **Target SAR Grid:** $512 \times 512$ pixels (`EPSG:4326`).
- **Resampling Method:** Bilinear spatial interpolation using `RegularGridInterpolator`.
- **Approved Terminology:** *"ERA5-derived 10-m surface wind field spatially resampled to the Sentinel-1 scene grid"*.

---

## 4. Empirical MetOcean Statistics & Multimodal Tensor Validation

### A. MetOcean Field Statistics
| Variable | Native ERA5 Grid ($11 \times 13$) | Resampled SAR Grid ($512 \times 512$) |
| :--- | :--- | :--- |
| **$u_{10}$** | $[-2.8056, +3.8889]\text{ m/s}$ (mean: $+0.5315$) | $[-2.8020, +3.8474]\text{ m/s}$ (mean: $+0.2223$) |
| **$v_{10}$** | $[-5.8056, +2.6944]\text{ m/s}$ (mean: $-2.0287$) | $[-5.7856, +1.5911]\text{ m/s}$ (mean: $-2.3487$) |
| **$U_{10}$ Wind Speed** | $[0.5365, 6.0321]\text{ m/s}$ | $[0.0099, 5.9211]\text{ m/s}$ (mean: $2.6326$, median: $2.4679$) |
| **Wind Direction FROM** | $[0.0^\circ, 360.0^\circ]$ | $[0.00^\circ, 360.00^\circ]$ (mean: $193.94^\circ$, median: $305.56^\circ$) |
| **Direction $\sin$** | $[-1.0000, +1.0000]$ | $[-1.0000, +1.0000]$ (mean: $+0.0020$) |
| **Direction $\cos$** | $[-1.0000, +1.0000]$ | $[-1.0000, +1.0000]$ (mean: $+0.8191$) |

### B. 5-Channel Multimodal Tensor Verification
| Channel Index | Modality Name | Physical Meaning | Normalization Range | Observed Values | Finite Check |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **0** | `SAR_VV` | Corrected calibrated Sigma0 dB | $[0.0, 1.0]$ | Valid | $100\%$ Finite |
| **1** | `SAR_VH` | Corrected calibrated Sigma0 dB | $[0.0, 1.0]$ | Valid | $100\%$ Finite |
| **2** | `ERA5_WindSpeed` | 10-m scalar wind speed $U_{10}$ | $[0.0, 1.0]$ | $[0.0004, 0.2368]$ | $100\%$ Finite |
| **3** | `ERA5_WindSin` | Meteorological wind direction $\sin(\theta)$ | $[-1.0, 1.0]$ | $[-1.0000, +1.0000]$ | $100\%$ Finite |
| **4** | `ERA5_WindCos` | Meteorological wind direction $\cos(\theta)$ | $[-1.0, 1.0]$ | $[-1.0000, +1.0000]$ | $100\%$ Finite |

- **Constructed Tensor Shape:** `[1, 5, 512, 512]`
- **Total Pixels Evaluated:** $1,310,720$ ($262,144 \times 5\text{ channels}$)
- **NaN / Inf Pixels:** $0$ ($100.0\%$ Finite)
- **Dataset Integration:** `MultimodalSARSpillDataset` validated with zero data leakage.

---

## 5. Artifact Audit Trail

1. **Validation Ledger JSON:** [`docs/artifacts/v5c-live-metocean-validation.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5c-live-metocean-validation.json)
2. **Visual Forensic Artifact (8-Panel):** [`docs/artifacts/v5c-live-metocean-alignment.png`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5c-live-metocean-alignment.png)
3. **Persisted Real MetOcean Grid:** `data/raw/weather/era5/S1A_IW_20240218T010329_era5_wind.npz`
4. **MetOcean Fusion Preprocessor:** [`services/ml-python/app/preprocessing/metocean_fusion.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/app/preprocessing/metocean_fusion.py)
5. **Multimodal Dataset Loader:** [`services/ml-python/app/data/loaders/sar_dataset.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/app/data/loaders/sar_dataset.py)
6. **Unit Tests:** [`services/ml-python/tests/unit/test_metocean_fusion.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/tests/unit/test_metocean_fusion.py)
