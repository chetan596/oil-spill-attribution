# Phase V5-D — SAR Lineage & Provenance Forensic Audit Report

**Audit Date:** September 14, 2026  
**Investigation Focus:** Verification of pixel-level instrument provenance for Sentinel-1 raster `s1a-iw-grd-dual-pol.tiff`  
**Final Classification:** **`SAR_DATA_SYNTHETIC_OR_DERIVED`**  

---

## 1. Executive Summary & Core Provenance Finding

A rigorous scientific lineage audit was performed to establish whether the $512 \times 512$ GeoTIFF at `data/raw/satellite/cdse/S1A_IW_GRDH_1SDV_20240218T010329.../s1a-iw-grd-dual-pol.tiff` contains actual satellite instrument measurement pixels downloaded from the European Space Agency (ESA) Copernicus Data Space Ecosystem (CDSE), or if it was constructed by a staging script.

### Key Finding:
1. **Scene Metadata & Physical Co-Registration Parameters:** **`REAL CDSE METADATA / SOURCE PRODUCT`**  
   (Authoritative ESA product ID, UTC acquisition timestamp `2024-02-18T01:03:29.872826Z`, bounding coordinates, orbit parameters).
2. **ERA5 Surface Wind & Direction Fields:** **`REAL ERA5 REANALYSIS DATA`**  
   (Authoritative ECMWF Copernicus CDS $0.25^\circ$ hourly reanalysis).
3. **NOAA Coral Reef Watch Sea Surface Temperature:** **`REAL NOAA CRW SATELLITE SST DATA`**  
   (Authoritative NOAA PIFSC ERDDAP CoralTemp v3.1 $0.05^\circ$ daily composite).
4. **Sentinel-1 SAR Pixel Array:** **`SYNTHETIC/REPRESENTATIVE SAR` (`SAR_DATA_SYNTHETIC_OR_DERIVED`)**  
   (The pixel values were generated using statistical distribution functions in `scripts/verify_real_cdse_inference.py`, rather than being cropped or extracted from a full-swath Level-1 GRD `.SAFE` measurement raster).

---

## 2. File Origin & Physical Artifact Inspection

The files within `data/raw/satellite/cdse/S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG/` were inspected:

| File Name | File Size | Dimensions | Data Type | CRS | SHA256 (Prefix) | Provenance Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `s1a-iw-grd-dual-pol.tiff` | $2,099,320\text{ B}$ | $512 \times 512 \times 2$ | `float32` | `EPSG:4326` | `ee13cf948c06f624` | **Representative Generated Array** |
| `measurement/s1a-iw-grd-vv-...-001-cog.tiff` | $1,049,710\text{ B}$ | $512 \times 512 \times 1$ | `float32` | `EPSG:4326` | `31b74b0035210df7` | **Representative Generated Array** |
| `measurement/s1a-iw-grd-vh-...-002-cog.tiff` | $1,049,710\text{ B}$ | $512 \times 512 \times 1$ | `float32` | `EPSG:4326` | `82f48ab8f843293a` | **Representative Generated Array** |
| `source-metadata.json` | $1,816\text{ B}$ | N/A | JSON | `EPSG:4326` | `2086786bcec1287a` | **Real CDSE STAC Metadata** |

---

## 3. Code Lineage & Synthetic Detection Trace

Direct inspection of `scripts/verify_real_cdse_inference.py` revealed the exact mechanism of raster construction:

```python
# scripts/verify_real_cdse_inference.py (lines 51-60)
np.random.seed(52606)
vv_norm_base = (np.random.normal(loc=0.42, scale=0.06, size=(height, width))).clip(0.01, 0.99).astype(np.float32)
vh_norm_base = (np.random.normal(loc=0.28, scale=0.04, size=(height, width))).clip(0.01, 0.99).astype(np.float32)

# Store physically calibrated Sigma0 in decibels (dB)
vv_data = (vv_norm_base * 30.0 - 35.0).astype(np.float32)
vh_data = (vh_norm_base * 30.0 - 45.0).astype(np.float32)
```

### Lineage Answer:
- **Pixel data was NOT copied or cropped from an authentic full-swath Level-1 GRD measurement raster.**
- **Pixel data WAS generated from a normal Gaussian distribution with seed `52606` and mapped into calibrated Sigma0 decibels.**
- **No multi-gigabyte ESA `.SAFE` measurement archive exists in `data/raw/satellite/cdse/`.**

---

## 4. Distinction Between Real Metadata and Real Pixels

To maintain uncompromising scientific honesty:
- **Real Metadata:** Product identifier `S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG`, bounding box $[71.124^\circ\text{E}, 73.816^\circ\text{E}] \times [17.871^\circ\text{N}, 19.814^\circ\text{N}]$, acquisition timestamp `2024-02-18T01:03:29.872826Z`, relative orbit `34`, and absolute orbit `52606` are authentic Copernicus STAC records.
- **Real Environmental Fields:** The ERA5 wind speed/direction and NOAA CRW SST fields are authentic, real physical observations co-registered with the scene's real temporal and spatial metadata.
- **Representative SAR:** The SAR pixel raster is a representative spatial background model matching the exact georeferencing and typical marine C-band radar backscatter distribution.

---

## 5. Claim Audit & Disclaimers

All documentation, artifact ledgers, and freeze reports must adhere to the following terminology:
1. ❌ **Do NOT use:** *"Real Sentinel-1 pixel data"*, *"Authentic satellite backscatter observations"*, or *"Observed CDSE radar imagery"*.
2. ✅ **DO use:**
   - **`REAL CDSE METADATA / SOURCE PRODUCT`** (for product identification, temporal bounds, and spatial extent).
   - **`REAL ERA5 REANALYSIS DATA`** (for wind speed and direction fields).
   - **`REAL NOAA CRW SATELLITE SST DATA`** (for sea surface temperature).
   - **`SYNTHETIC/REPRESENTATIVE SAR`** (for the staged 512×512 SAR raster array).

---

## 6. Final Status & Declarations

$$\mathbf{SAR\_DATA\_SYNTHETIC\_OR\_DERIVED}$$

| Component | Provenance Status | Description |
| :--- | :---: | :--- |
| **Sentinel-1 Metadata** | **`REAL_CDSE_METADATA_VERIFIED`** | ESA STAC catalogue record for Mumbai High |
| **Sentinel-1 SAR Pixels** | **`SAR_DATA_SYNTHETIC_OR_DERIVED`** | Representative marine backscatter distribution ($\sigma^0\text{ dB}$) |
| **ERA5 MetOcean Fields** | **`REAL_ERA5_REANALYSIS_VERIFIED`** | ECMWF CDS hourly $10\text{m}$ $u_{10}, v_{10}$ |
| **NOAA CoralTemp SST** | **`REAL_NOAA_SST_VERIFIED`** | NOAA ERDDAP 5km daily foundation SST |
| **V5-D Supervised Training** | **`HELD`** | No training on synthetic SAR or un-timestamped static benchmark |
| **Sealed Test Set** | **`UNTOUCHED`** | Scenes `00060`, `00062`, `00063`, `00064`, `00080` unsealed |
| **Model Weights** | **`NOT CREATED`** | Zero V5-D weights produced |

> [!IMPORTANT]
> **Scientific Freeze Statement:**  
> *"V5-D validates the availability, temporal alignment, and multi-source spatial co-registration of real NOAA CRW daily SST and real ERA5 wind fields with real CDSE Sentinel-1 metadata on a representative SAR grid. The SAR pixel array is classified as SYNTHETIC/REPRESENTATIVE SAR. Model V5-D supervised training remains permanently HELD."*
