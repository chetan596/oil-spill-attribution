# Phase V5-B Training & Scientific Feasibility Report

**Document Date:** September 14, 2026  
**Phase:** V5-B Multimodal SAR + ERA5 Wind Speed Fusion  
**Status:** **BLOCKED / HELD UNDER PHASE 20 STOP CONDITIONS (Zero Data Fabrication Protocol)**

---

## 1. Executive Summary

Phase V5-B aims to incorporate physically co-registered $10\text{m}$ wind speed rasters as a 3rd input channel to the dual-polarization U-Net to reduce look-alike false alarms ($\approx 86\%$) on low-wind ocean regions.

In strict adherence to the **Phase 20 Stop Conditions** (*"STOP V5-B if authoritative SAR timestamps cannot be recovered, real ERA5 data cannot be obtained... NEVER substitute synthetic data"*), a forensic audit of the Zenodo benchmark archives (`10.5281/zenodo.8346860`, `10.5281/zenodo.8253899`, `10.5281/zenodo.13761290`) was conducted.

### Core Audit Finding
- **Zenodo Benchmark GeoTIFFs (40 scenes):** 0 of 40 scenes embed original ESA Sentinel-1 SAFE UTC acquisition datetime metadata in their GeoTIFF tags or directory manifests.
- **Scientific Decision:** Because ERA5 hourly reanalysis grids require sub-hourly UTC temporal matching, **0 of 28 training scenes and 0 of 7 validation scenes are currently eligible for multimodal pairing without fabricating timestamps**.
- **Model V5-B Status:** **HELD / NOT TRAINED** on the static Zenodo benchmark. Zero synthetic or demo wind values were introduced.

---

## 2. Benchmark Scene Eligibility Breakdown

```
Total Verified Benchmark Scenes: 40
├─ Train Scenes: 28 total
│   ├─ Timestamps Verified: 0
│   └─ Eligible for Real ERA5: 0 (100% BLOCKED to prevent temporal fabrication)
├─ Validation Scenes: 7 total
│   ├─ Timestamps Verified: 0
│   └─ Eligible for Real ERA5: 0 (100% BLOCKED)
└─ Official Held-Out Test Scenes: 5 total
    ├─ Status: STRICTLY SEALED
    └─ Eligible for Real ERA5: 0 (Unseen & Unmodified)
```

---

## 3. Real CDSE Acquisition Pipeline (Alternative Operational Branch)

While the static Zenodo benchmark lacks embedded acquisition timestamps, the live **Copernicus Data Space Ecosystem (CDSE)** real-data pipeline successfully captures complete ESA SAFE product metadata:
- **Product ID:** `S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG`
- **Acquisition Start UTC:** `2024-02-18T01:03:29.872826Z`
- **Acquisition End UTC:** `2024-02-18T01:03:54.871034Z`
- **Geographic Bounding Box:** $[71.124^\circ\text{E}, 17.871^\circ\text{N}, 73.816^\circ\text{E}, 19.814^\circ\text{N}]$
- **Operational Viability:** Real Sentinel-1 acquisitions captured in production mode possess exact datetime provenance, enabling automated retrieval of Copernicus ERA5 wind fields.

---

## 4. Model Registry & Artifact Status

- **`ml/model_registry/versions/unet_dual_pol_sar_v5b_wind.pth`**: Marked as `HELD_STOP_CONDITION_ACTIVE` in registry metadata.
- **`docs/artifacts/v5b-scene-eligibility.json`**: Complete scene-by-scene audit published.
- **`docs/artifacts/v4-v5a-v5b-comparison.json`**: Comparative matrix preserved.
