# Phase V5-B Live MetOcean Alignment Validation Report

**Validation Date:** September 14, 2026  
**Pipeline:** Live Sentinel-1 C-Band SAR + ECMWF ERA5 Multimodal Co-Registration  
**Evaluation Scope:** Preprocessing Pipeline & Tensor Co-Registration Validation (Zero Model Training / Zero Test Set Evaluation)

---

## 1. Explicit Scientific Notice & Boundary Constraints

> [!IMPORTANT]
> **V5-B training remains HELD because the static labelled Zenodo benchmark lacks authoritative acquisition timestamps. This execution validates only the real-data MetOcean alignment pipeline.**
>
> This report does **NOT** claim:
> - That Model V5-B improves detection accuracy over V4.
> - That wind speed inputs reduce look-alike false positives on unlabelled scenes.
> - That Model V5-B is production-grade.
> - That unlabelled live CDSE scenes constitute labelled training data.
>
> The sole purpose of this phase is to empirically prove that the multimodal data pipeline correctly co-registers **REAL SENTINEL-1 DATA** with **REAL ERA5-DERIVED METOCEAN DATA** without synthesizing or estimating environmental variables.

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
| **Native Scene Dimensions** | $512 \times 512$ pixels (Test Tile Footprint) | GeoTIFF Header |

---

## 3. Real ERA5 Reanalysis Co-Registration (MODEL / PREPROCESSING)

### A. Temporal Alignment
- **Sentinel-1 Acquisition Time:** `2024-02-18T01:03:29Z`
- **Nearest Integer ERA5 Hour:** **`2024-02-18T01:00:00Z`**
- **Temporal Discrepancy:** $+3.49\text{ minutes}$
- **Tolerance Threshold:** $\pm 180.0\text{ minutes}$ ($\Delta t \le \text{tolerance} \implies$ **`ALIGNED`**)
- **Temporal Substitution:** **None** (Actual historical ERA5 reanalysis matching the exact acquisition date and hour).

### B. ERA5 Source & Variable Extraction
- **Data Source:** ECMWF ERA5 Hourly Reanalysis on Single Levels (`source: "ERA5"`).
- **Physical Variables Retrieved:**
  1. $10\text{m}$ $u$-component of surface wind ($u_{10}$ in $\text{m/s}$)
  2. $10\text{m}$ $v$-component of surface wind ($v_{10}$ in $\text{m/s}$)
- **Native ERA5 Spatial Resolution:** $0.25^\circ \times 0.25^\circ$ ($\sim 28\text{ km}$ at latitude $19^\circ\text{N}$).
- **Derived Physical Quantity:**
  $$U_{10} = \sqrt{u_{10}^2 + v_{10}^2}$$

### C. Spatial Co-Registration & Resampling Protocol
- **Target Spatial Grid:** Exact Sentinel-1 scene grid ($512 \times 512$ pixels, `EPSG:4326`).
- **Resampling Method:** Bilinear 2D spatial interpolation across native ERA5 grid nodes.
- **Terminology:** **"ERA5-derived 10-m surface wind field spatially resampled to the Sentinel-1 scene grid"**.
- *(Resampling does not create micro-scale $10\text{m}$ spatial wind detail; it maps the macro-scale atmospheric background across the high-resolution SAR scene).*

### D. Wind Speed Distribution Across Scene Footprint

| Physical Statistic | Observed Value ($\text{m/s}$) | Normalized Value $[0.0, 1.0]$ ($\text{clip}(U_{10}, 0, 25) / 25$) |
| :--- | :---: | :---: |
| **Minimum Wind Speed** | $0.65\text{ m/s}$ | $0.0260$ |
| **Maximum Wind Speed** | $5.92\text{ m/s}$ | $0.2369$ |
| **Mean Wind Speed** | $2.81\text{ m/s}$ | $0.1124$ |
| **Median Wind Speed** | $2.58\text{ m/s}$ | $0.1034$ |
| **Standard Deviation** | $1.31\text{ m/s}$ | $0.0524$ |

---

## 4. Multimodal Tensor Construction & Validation

The co-registered channels were passed through the V5-B tensor assembly pipeline to verify structural and mathematical integrity:

```
V5-B 3-Channel Input Tensor Structure:
┌───────────┬─────────────────────────────────────────────────┬───────────┬──────────────┐
│ Channel   │ Modality Description                            │ Shape     │ Range        │
├───────────┼─────────────────────────────────────────────────┼───────────┼──────────────┤
│ Channel 0 │ Corrected Decibel-Normalized SAR VV             │ [512, 512]│ [0.0, 1.0]   │
│ Channel 1 │ Corrected Decibel-Normalized SAR VH             │ [512, 512]│ [0.0, 1.0]   │
│ Channel 2 │ ERA5-Derived 10m Wind Speed Resampled to SAR    │ [512, 512]│ [0.026, 0.237│
└───────────┴─────────────────────────────────────────────────┴───────────┴──────────────┘
Total Tensor Shape: [1, 3, 512, 512] (Batch, Channel, Height, Width)
```

### Deterministic Integrity Checks
- **Shape Verification:** `[1, 3, 512, 512]` ($\checkmark$ Matches U-Net 3-channel input specification)
- **Finite Check:** $100\%$ finite values; zero `NaN`, zero `Inf` ($\checkmark$ PASSED)
- **Range Check:** All 3 channels strictly bound within $[0.0, 1.0]$ ($\checkmark$ PASSED)
- **NoData Check:** $0$ masked/corrupted pixels across target footprint ($\checkmark$ PASSED)

---

## 5. Visual Forensic Artifact

A comprehensive 6-panel alignment diagram has been generated and sealed in [`docs/artifacts/v5b-live-metocean-alignment.png`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/artifacts/v5b-live-metocean-alignment.png):
1. **Panel 1:** Sentinel-1 VV normalized backscatter.
2. **Panel 2:** Sentinel-1 VH normalized backscatter.
3. **Panel 3:** Native coarse $0.25^\circ$ ECMWF ERA5 wind speed grid.
4. **Panel 4:** ERA5-derived $10\text{m}$ surface wind field spatially resampled to Sentinel-1 grid.
5. **Panel 5:** Geographic footprint and bounding box alignment (`EPSG:4326`).
6. **Panel 6:** Complete metadata and provenance ledger summary.

---

## 6. Scientific Conclusion

The live Sentinel-1 + ERA5 temporal and spatial co-registration pipeline is **functional, robust, and scientifically verifiable**. Real meteorological data can be ingested and spatially mapped to Sentinel-1 acquisitions with zero temporal fabrication.
