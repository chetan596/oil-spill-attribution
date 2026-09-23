# Phase V5-B Final Completion, Reproducibility & Scientific Freeze Report

**Freeze Date:** September 14, 2026  
**Phase:** V5-B Multimodal SAR + Real ERA5 Wind Speed Alignment  
**Status:** **SEALED & FROZEN — ZERO SCIENTIFIC PERFORMANCE IMPROVEMENT CLAIMED**

---

## A. Static Benchmark Eligibility Audit

A complete forensic audit of all 40 verified Zenodo Sentinel-1 SAR Oil Spill benchmark GeoTIFFs (`10.5281/zenodo.8346860`, `10.5281/zenodo.8253899`, `10.5281/zenodo.13761290`) was performed:
- **Embedded UTC Timestamp Availability:** **0 of 40 scenes** possess verified ESA Sentinel-1 SAFE UTC acquisition timestamps in their GeoTIFF tags or directory manifests.
- **Scientific Protocol Enforcement:** In accordance with the Phase 20 Stop Conditions (*"DO NOT use synthetic wind, demo wind, fabricated timestamps, approximate dates, or random values"*), **0 of 28 training scenes and 0 of 7 validation scenes were paired with fabricated meteorological grids**.
- **Supervised Benchmark Training Status:** **`HELD`** (Zero data fabrication).

---

## B. Live Real-Data Alignment Validation

Operational validation of the multimodal pipeline was executed on an actual Copernicus Data Space Ecosystem (CDSE) Sentinel-1 acquisition containing complete ESA SAFE product metadata:
- **Product Identifier:** `S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG`
- **Product UUID:** `3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79`
- **Platform & Mode:** Sentinel-1A C-Band SAR, Interferometric Wide (IW), GRDH
- **Polarization:** Dual-Polarization ($\text{VV} + \text{VH}$)
- **Acquisition Start UTC:** `2024-02-18T01:03:29.872826Z`
- **Acquisition End UTC:** `2024-02-18T01:03:54.871034Z`
- **Geographic Bounding Box:** $\text{Lon } [71.1240^\circ\text{E}, 73.8156^\circ\text{E}], \text{Lat } [17.8706^\circ\text{N}, 19.8140^\circ\text{N}]$ (`EPSG:4326`)

---

## C. Temporal Alignment & Provenance

- **Sentinel-1 Acquisition Time:** `2024-02-18T01:03:29Z`
- **Nearest Integer ERA5 UTC Observation:** `2024-02-18T01:00:00Z`
- **Temporal Discrepancy:** $+3.49\text{ minutes}$ (Strictly within the documented $\pm 180.0\text{ minute}$ tolerance threshold).
- **Meteorological Data Source:** ECMWF ERA5 Hourly Reanalysis on Single Levels (`source: "ERA5"`).
- **Retrieved Physical Variables:** $10\text{m}$ $u$-component of surface wind ($u_{10}$), $10\text{m}$ $v$-component of surface wind ($v_{10}$).
- **Derived Surface Wind Speed:** $U_{10} = \sqrt{u_{10}^2 + v_{10}^2}$ ($\text{min}: 0.65\text{ m/s}, \text{max}: 5.92\text{ m/s}, \text{mean}: 2.81\text{ m/s}$).
- **Normalization Formula:** $\text{clip}(U_{10}, 0.0, 25.0) / 25.0 \to [0.0, 1.0]$.
- **Wind Direction Status:** **NOT included in Model V5-B** (strictly reserved for future V5-C evaluation).

---

## D. Spatial Alignment & Resampling Protocol

- **Native ERA5 Resolution:** $0.25^\circ \times 0.25^\circ$ ($\sim 28\text{ km}$).
- **Target SAR Grid:** Exact Sentinel-1 GeoTIFF raster grid ($512 \times 512$ pixels, `EPSG:4326`).
- **Resampling Method:** Bilinear 2D spatial interpolation across native ERA5 grid nodes.
- **Terminology:** **"ERA5-derived 10-m surface wind field spatially resampled to the Sentinel-1 scene grid"**.
- *(Resampling does not create micro-scale $10\text{m}$ spatial wind detail; it maps the macro-scale atmospheric background across the high-resolution SAR scene).*
- **Spatial Alignment Integrity:** **`ALIGNED` (PASS)** (Zero spatial shift, zero NoData pixels).

---

## E. Multimodal Tensor Validation & Reproducibility

```
Model V5-B 3-Channel Input Tensor Structure:
┌───────────┬─────────────────────────────────────────────────┬───────────┬──────────────┐
│ Channel   │ Modality Description                            │ Shape     │ Range        │
├───────────┼─────────────────────────────────────────────────┼───────────┼──────────────┤
│ Channel 0 │ Corrected Decibel-Normalized SAR VV             │ [512, 512]│ [0.0, 1.0]   │
│ Channel 1 │ Corrected Decibel-Normalized SAR VH             │ [512, 512]│ [0.0, 1.0]   │
│ Channel 2 │ ERA5-Derived 10m Wind Speed Resampled to SAR    │ [512, 512]│ [0.026, 0.237│
└───────────┴─────────────────────────────────────────────────┴───────────┴──────────────┘
Total Tensor Shape: [1, 3, 512, 512] (Batch, Channel, Height, Width)
```

- **Tensor Determinism:** Re-running the pipeline from persisted raw inputs yields a **100% bit-exact match** ($\Delta < 10^{-8}$) against the validation ledger.
- **Finite Check:** $100\%$ finite values; zero `NaN`, zero `Inf`.

---

## F. Data Separation Audit

- **Zenodo Benchmark Isolation:** The live CDSE validation product (`S1A_IW_GRDH_...`) is **strictly isolated** from the 40 static Zenodo benchmark scenes.
- **Zero Label Creation:** No segmentation ground-truth labels were fabricated for the unlabelled live CDSE scene.
- **Zero Test Contamination:** No live CDSE scene was evaluated as part of the sealed 5-scene test benchmark (`00060`, `00062`, `00063`, `00064`, `00080`).

---

## G. Scientific Limitations & Look-Alike Behavior

- **Benchmark Look-Alike Vulnerability:** On the current validation benchmark, SAR-only models show severe false-positive rates on look-alike scenes ($86.63\%$ in V4, $86.29\%$ in V5-A), indicating that SAR-only backscatter features in this dataset do not provide reliable discrimination between oil-labelled scenes and look-alike dark-surface phenomena.
- **Absence of Performance Claims:** Model V5-B makes **no claims** of accuracy improvement, precision improvement, or false-positive reduction over Model V4.

---

## H. Regression Verification Summary

```
============================== REGRESSION STATUS ==============================
1. Python ML Tests (pytest):    65 passed, 0 failed in 5.84s
2. Backend Node Tests (jest):    56 passed, 12 test suites green
3. Frontend Tests (vitest):      35 passed, 8 test suites green
4. E2E Pipeline (verify_phase7): 10/10 checks passed (Drift & Attribution invariant)
5. Frontend Build (vite build):  Built in 2.95s (Zero errors)
================================================================================
```

All existing model checkpoints (`unet_dual_pol_sar_v2.pth`, `unet_dual_pol_sar_v3.pth`, `unet_dual_pol_sar_v4.pth`, `unet_dual_pol_sar_v5a.pth`) and demonstration scenarios remain strictly invariant.

---

## I. Final V5-B Sealed Status

```
========================= FINAL V5-B FREEZE STATUS =========================
1. STATIC SUPERVISED TRAINING        : HELD (Missing UTC timestamps in Zenodo archive)
2. LIVE METOCEAN ALIGNMENT           : VALIDATED (CDSE S1A + ECMWF ERA5)
3. SEALED HELD-OUT TEST BENCHMARK    : UNTOUCHED & PRESERVED
4. SCIENTIFIC PERFORMANCE IMPROVEMENT: NOT CLAIMED
5. PHASE V5-C (WIND DIRECTION)       : NOT STARTED (STRICT STOP ENFORCED)
============================================================================
```
