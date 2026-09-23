# Phase V5-B MetOcean Data Provenance & Alignment Audit

**Audit Date:** September 14, 2026  
**Subject:** Real Meteorological and Oceanographic (MetOcean) Ingestion Feasibility

---

## 1. Required Provenance Schema

In accordance with Phase V5 specifications, every multimodal MetOcean pairing must adhere to the following schema:

```json
{
  "source": "ERA5",
  "dataset": "ERA5 hourly data on single levels from 1940 to present",
  "variables": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
  "native_resolution": "0.25 degrees (~28 km)",
  "target_grid": "Sentinel-1 2048x2048 (EPSG:4326)",
  "sar_timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "metocean_timestamp": "YYYY-MM-DDTHH:00:00Z",
  "time_difference_minutes": 0,
  "native_crs": "EPSG:4326",
  "target_crs": "EPSG:4326",
  "resampling_method": "Bilinear spatial interpolation to scene bounding box",
  "coverage_percent": 100.0,
  "missing_percent": 0.0
}
```

---

## 2. Benchmark Corpus Audit Results

| Dataset Partition | Total Scenes | Verified UTC Timestamps | Real ERA5 Ingestion Status | Provenance Integrity |
| :--- | :---: | :---: | :---: | :--- |
| **Part I (Oil Spill)** | 15 scenes | 0 | **UNAVAILABLE** (No UTC timestamps) | Blocked under Stop Condition |
| **Part II (No-Oil)** | 10 scenes | 0 | **UNAVAILABLE** (No UTC timestamps) | Blocked under Stop Condition |
| **Part II (Look-Alike)** | 10 scenes | 0 | **UNAVAILABLE** (No UTC timestamps) | Blocked under Stop Condition |
| **Part III (Sealed Test)** | 5 scenes | 0 | **SEALED & UNAVAILABLE** | Blocked under Stop Condition |

### Scientific Verdict
No approximate or synthetic dates were substituted. All static benchmark scenes remain tagged **`METOCEAN_ALIGNMENT_UNAVAILABLE`**.
