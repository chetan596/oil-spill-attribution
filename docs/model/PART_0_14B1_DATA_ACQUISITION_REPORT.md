# Part 0.14B.1-DATA — Real Optical Dataset Download, Extraction & Curation Report

**Part**: `0.14B.1-DATA`  
**Status**: `COMPLETE`  
**Timestamp**: 2026-09-20T00:45Z  
**Training Executed**: `NO` (Prohibited in this part)  
**V1 Model Modified**: `NO` (Frozen and preserved)  
**SAR Pipeline Modified**: `NO` (Frozen)  

---

## 1. Executive Summary

This task executed the end-to-end download, extraction, validation, deduplication, and structured curation of verified real-world optical oil spill and non-oil marine imagery.

The project now possesses **3,529 unique, high-resolution optical images** with full provenance tracking, partitioned strictly across classes and splits, including an independent external test benchmark.

---

## 2. Data Sources & Provenance Audit

| Source | Modality | Platform | License | DOI / URL | Status | Downloaded Archive | Curated Images |
|---|---|---|---|---|---|---|---|
| **Kerf Port Dataset** | Drone RGB | DJI Mavic / Yacob UAV | CC BY 4.0 | [10.5281/zenodo.10555314](https://doi.org/10.5281/zenodo.10555314) | `ACQUIRED_AND_VERIFIED` | 1,137,552,692 bytes (1.137 GB) | 795 |
| **MADOS Dataset** | Satellite Optical | Sentinel-2 MSI | CC BY 4.0 | [10.5281/zenodo.10664073](https://doi.org/10.5281/zenodo.10664073) | `ACQUIRED_AND_VERIFIED` | 4,038,418,740 bytes (4.038 GB) | 2,734 |
| **LADOS Dataset** | Drone RGB | Aerial UAV | CC BY 4.0 | [10.17632/7kb7b273dr.1](https://doi.org/10.17632/7kb7b273dr.1) | `DOWNLOAD_BLOCKED` | N/A (Cloudflare/reCAPTCHA) | Documented |
| **NOAA IncidentNews** | Aerial / Surface | Field Overflights | Public Domain | [https://incidentnews.noaa.gov](https://incidentnews.noaa.gov) | `DOWNLOAD_BLOCKED` | N/A (No bulk API) | Documented |

---

## 3. Curated Image Inventory & Class Breakdown

```
Total Curated Unique Images: 3,529

Primary Optical Dataset:
  - OIL_SPILL:    921 images
  - CLEAN_OCEAN:  699 images
  - LOOK_ALIKE:   1,909 images

External Real Test Set (Isolated):
  - OIL_SPILL:    86 images
  - CLEAN_OCEAN:  11 images
  - LOOK_ALIKE:   33 images
  - Total:        130 images
```

### 3.1 Look-Alike Sub-Class Breakdown

MADOS and Kerf ground-truth annotations were systematically mapped to preserve sub-class metadata:
- **Marine Debris**: Class 1
- **Dense Sargassum**: Class 2
- **Sparse Floating Algae**: Class 3
- **Natural Organic Material**: Class 4
- **Ship / Vessel Obstructions**: Class 5
- **Sediment-Laden Water**: Class 8
- **Foam**: Class 9
- **Turbid Water**: Class 10
- **Shallow Water**: Class 11
- **Waves & Wakes**: Class 12
- **Port Reflections / Infrastructure**: Kerf Class 3

---

## 4. Integrity & Deduplication Audit

- **Exact Duplicate Audit (SHA-256)**: 0 exact byte duplicates detected in curated records.
- **Perceptual Near-Duplicate Audit (dHash 64-bit)**: 542 near-duplicates identified and pruned.
- **SAR / Optical Separation**: 100% enforced. No SAR-derived pseudo-RGB patches exist in `data/raw/optical_real/`.
- **Synthetic / AI-Generated Images**: 0 used. All imagery originates from peer-reviewed scientific datasets (Scientific Data 2024, ISPRS 2024).

---

## 5. Storage & Disk Space Accounting

- **D: Drive Disk Space (Initial)**: Total: 351 GB, Used: 185 GB, Free: 165 GB
- **D: Drive Disk Space (Current)**: Total: 351 GB, Used: 198 GB, Free: 153 GB
- **Archives Preserved**:
  - `data/raw/archives/kerf_dataset.zip` (1.137 GB)
  - `data/raw/archives/mados_dataset.zip` (4.038 GB)
- **Extracted Working Directory**:
  - `data/raw/archives/kerf_extracted/`
  - `data/raw/archives/mados_extracted/`
- **Curated Dataset Directory**:
  - `data/raw/optical_real/oil_spill/`
  - `data/raw/optical_real/clean_ocean/`
  - `data/raw/optical_real/look_alike/`
  - `data/raw/optical_real/external_test/`
  - `data/raw/optical_real/metadata/`

---

## 6. Metadata Manifests

1. **Source Manifest**: [`data/raw/optical_real/metadata/source_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/source_manifest.json)
2. **Image Manifest**: [`data/raw/optical_real/metadata/image_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/image_manifest.json)
3. **Acquisition Log**: [`data/raw/optical_real/metadata/acquisition_log.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/acquisition_log.json)
4. **Exclusions**: [`data/raw/optical_real/metadata/exclusions.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/exclusions.json)
5. **Acquisition Report**: [`data/raw/optical_real/acquisition_report.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/acquisition_report.json)

---

## 7. Baseline Verification

- **Python ML Tests**: 257 / 257 passing
- **Node.js Tests**: 131 / 131 passing
- **Model Training**: NOT STARTED
- **V1 Checkpoint**: Untouched
