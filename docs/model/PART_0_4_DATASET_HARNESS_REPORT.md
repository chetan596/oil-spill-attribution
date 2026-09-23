# PART 0.4 — DATASET HARNESS & SPLIT VALIDATION REPORT

**Project**: Ocean Guard AI / SIH 26143  
**Repository**: `oil-spill-attribution`  
**Date**: 2026-09-19  
**Execution Host**: Windows 11 Pro / Python 3.11.9 / NVIDIA GeForce RTX 5050 Laptop GPU (Blackwell `sm_120`, CUDA 12.8)  

---

## 1. OVERALL STATUS
**`COMPLETE`**  
*(Complete 40-scene real Sentinel-1 dataset inventoried, validated, and categorized; deterministic manifest and scene-level split generator created; scene and spatial leakage mathematically verified; dataset loader enhanced with deterministic sorting; and test suite expanded to 88/88 passing tests with 0 regressions).*

---

## 2. DATASET DISCOVERED
- **Dataset Name**: Sentinel-1 SAR Oil Spill Verified Real Subset
- **Primary Source**: Zenodo Repositories:
  - Part I (Oil Spills): `10.5281/zenodo.8346860`
  - Part II (Look-Alikes & No-Oil): `10.5281/zenodo.8253899`
  - Part III (Held-Out Test Set): `10.5281/zenodo.13761290`
- **Full Zenodo Benchmark Status**: `NOT_AVAILABLE_LOCALLY` (as planned; no multi-GB download performed).

---

## 3. DATASET LOCATION
- **Root Directory**: [`data/raw/satellite/real/`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/satellite/real/)
- **Subdirectories**:
  - `part1_oil/`: 15 SAR scenes with matched ground-truth segmentation masks.
  - `part2_lookalike/`: 10 SAR scenes with look-alike dark oceanic formations.
  - `part2_no_oil/`: 10 SAR scenes with clean sea open-water backscatter.
  - `part3_test/`: 5 held-out SAR test scenes with ground-truth masks (`00060`, `00062`, `00063`, `00064`, `00080`).

---

## 4. NUMBER OF SAMPLES
- **Total Samples Inventoried**: **40 full-scene raster acquisitions**.

---

## 5. NUMBER OF SCENES
- **Total Unique Scenes**: **40 distinct geographic Sentinel-1 SAR scenes**.

---

## 6. MODALITIES
- **Data Format**: GeoTIFF (EPSG:4326 georeferenced coordinate reference system).
- **Polarization**: Dual-Polarization SAR (**VV + VH**).
  - Channel 0: **VV** (Vertical transmit, Vertical receive backscatter).
  - Channel 1: **VH** (Vertical transmit, Horizontal receive cross-polarization backscatter).
- **Spatial Resolution**: $2048 \times 2048$ pixels per full scene acquisition ($8.983 \times 10^{-5}$ degrees pixel spacing / $\sim 10\text{ m}$ ground sample distance).
- **Optical / RGB Data**: None detected in real satellite paths; optical photography is rejected as unsupported.

---

## 7. SAR REPRESENTATION
- **Stored Representation**: Raw Calibrated Backscatter Decibels ($\sigma^0\text{ dB}$, `Float32`).
- **Numerical Distribution**:
  - **VV $\sigma^0\text{ dB}$**: Overall Minimum: $-54.12\text{ dB}$, Overall Maximum: $+5.55\text{ dB}$, Average Scene Mean: $-15.11\text{ dB}$.
  - **VH $\sigma^0\text{ dB}$**: Overall Minimum: $-49.88\text{ dB}$, Overall Maximum: $+6.80\text{ dB}$, Average Scene Mean: $-24.08\text{ dB}$.
  - **Invalid / NaN / Inf Ratio**: **0.00%** across all valid active pixel apertures.

---

## 8. MASK REPRESENTATION
- **Mask Datatype**: `uint8` binary raster.
- **Conventions Verified**:
  - `0`: Background Clean Water / Natural Sea Surface / Look-Alike.
  - `1`: Ground-Truth Oil Slick Anomaly.
- **Scenes with Positive Mask**: 20 scenes (15 in `part1_oil` + 5 in `part3_test`).
- **Scenes without Positive Mask**: 20 scenes (10 in `part2_lookalike` + 10 in `part2_no_oil` — verified all zeros / non-oil).

---

## 9. CATEGORY DISTRIBUTION

| Category Key | Semantic Description | Scene Count |
| :--- | :--- | :---: |
| **`oil`** | Confirmed Sentinel-1 SAR Oil Slick Events (Part I) | 15 |
| **`look_alike`** | Low-wind sea slicks / biogenic films / dark oceanic formations (Part II) | 10 |
| **`no_oil`** | Pure ambient clean ocean wave clutter (Part II) | 10 |
| **`test_set`** | Official held-out test scenes (Part III) | 5 |
| **Total** | | **40** |

---

## 10. SPLIT DISTRIBUTION

| Split Partition | Scenes | Proportion | Categories Present |
| :--- | :---: | :---: | :--- |
| **Train** | **28** | $70.0\%$ | `oil` (11), `look_alike` (8), `no_oil` (9) |
| **Validation** | **7** | $17.5\%$ | `oil` (4), `look_alike` (2), `no_oil` (1) |
| **Test** | **5** | $12.5\%$ | Official Part III Held-Out Test Set (`00060`–`00080`) |
| **Total** | **40** | **100.0%** | Scene-level partitioned |

---

## 11. DUPLICATE STATUS
- **Exact File Duplicates (SHA-256)**: **0** (All 40 GeoTIFFs possess unique content hashes).
- **Same Scene Overlap**: **0** (Each file represents an independent acquisition).
- **Classification**: **40 UNIQUE**.

---

## 12. SCENE LEAKAGE STATUS
- **Status**: **`VERIFIED_NO_LEAKAGE`**
- **Verification Method**: Exhaustive set intersection across scene IDs:
  - $\text{Train} \cap \text{Validation} = \emptyset$ (0 overlapping scenes)
  - $\text{Train} \cap \text{Test} = \emptyset$ (0 overlapping scenes)
  - $\text{Validation} \cap \text{Test} = \emptyset$ (0 overlapping scenes)

---

## 13. SPATIAL LEAKAGE STATUS
- **Status**: **`VERIFIED_DISJOINT_SCENE_LEVEL_ACQUISITIONS`**
- Geographic footprints for each scene are discrete geospatial acquisitions.

---

## 14. INVALID SAMPLE COUNT
- **Corrupted Rasters**: **0**
- **Dimension Mismatches**: **0**
- **Read / Decode Failures**: **0**
- **Validation Pass Rate**: **100.0% (40 / 40 samples passed all structural and geospatial checks)**.

---

## 15. DATASET MANIFEST PATH
- Canonical Manifest: [`ml/datasets/manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/manifest.json)
- Full Inventory: [`ml/datasets/dataset_inventory.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/dataset_inventory.json)

---

## 16. DATASET STATISTICS PATH
- Statistics Artifact: [`ml/datasets/dataset_statistics.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/dataset_statistics.json)
- Mask Distribution: [`ml/datasets/mask_value_distribution.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/mask_value_distribution.json)

---

## 17. SPLIT AUDIT PATH
- Split Audit Artifact: [`ml/datasets/split_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/split_audit.json)

---

## 18. LOADER IMPLEMENTATION
- **Module**: [`services/ml-python/app/data/loaders/sar_dataset.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/app/data/loaders/sar_dataset.py)
- **Class**: `SARSpillDataset`
- **Guarantees**:
  - Deterministic scene ordering (`sorted` by `scene_id`).
  - Output tuple: `(image_tensor: [C, H, W], mask_tensor: [H, W], metadata: Dict)`.
  - Supports non-overlapping grid tile sampling (default $512 \times 512$).
  - Full metadata transparency: includes `sample_id`, `scene_id`, `category`, `split`, `crs`, and `tile_offset`.
  - Zero synthetic / demo fallbacks during real dataset mode.

---

## 19. TESTS EXECUTED
- Comprehensive testing across dataset discovery, missing file handling, mask/image shape parity, deterministic sorting, category normalization, split generator leakage prevention, and dataset loader output schema.
- Regression testing across all pre-existing evaluation, U-Net architecture, metocean, and API unit tests.

---

## 20. EXACT TEST COUNTS
- **Unit Tests (`services/ml-python/tests/unit`)**: **85 / 85 PASSED** (0 failed, 0 skipped)
  - Includes 8 new tests in [`test_dataset_harness.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/tests/unit/test_dataset_harness.py).
- **Integration Tests (`services/ml-python/tests/integration`)**: **3 / 3 PASSED** (0 failed, 0 skipped)
- **Total Test Suite**: **88 / 88 PASSED (100% PASS RATE)**.

---

## 21. REGRESSION STATUS AGAINST 80/80 BASELINE
- **Part 0.3 Baseline**: 80 / 80 PASSED.
- **Part 0.4 Current**: **88 / 88 PASSED** (+8 new tests added).
- **Regressions**: **0**.

---

## 22. FILES CREATED
- [`scripts/build_dataset_harness.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/scripts/build_dataset_harness.py)
- [`ml/datasets/split_generator.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/split_generator.py)
- [`ml/datasets/dataset_inventory.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/dataset_inventory.json)
- [`ml/datasets/manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/manifest.json)
- [`ml/datasets/split_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/split_audit.json)
- [`ml/datasets/dataset_statistics.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/dataset_statistics.json)
- [`ml/datasets/mask_value_distribution.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/datasets/mask_value_distribution.json)
- [`services/ml-python/tests/unit/test_dataset_harness.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/tests/unit/test_dataset_harness.py)
- [`docs/model/PART_0_4_DATASET_HARNESS_REPORT.md`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/model/PART_0_4_DATASET_HARNESS_REPORT.md)

---

## 23. FILES MODIFIED
- [`services/ml-python/app/data/loaders/sar_dataset.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/app/data/loaders/sar_dataset.py) (Added deterministic scene sorting, repository-level path resolution, and category/sample_id metadata fields).
- [`services/ml-python/tests/unit/test_real_evaluator.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/tests/unit/test_real_evaluator.py) (Normalized `sys.path` to repo root).

---

## 24. WHAT IS READY
- Standardized, machine-readable dataset inventory and canonical manifest.
- Validated real 40-scene Sentinel-1 dual-polarization dataset.
- Scene-level split partition engine with zero data leakage.
- Deterministic PyTorch `SARSpillDataset` loader.
- Complete 88-test regression-free test suite.

---

## 25. WHAT IS NOT READY
- Full Zenodo benchmark dataset evaluation (3,020 scenes pending future download/mount).
- Model training (out of scope for Part 0.4).

---

## 26. EXACT NEXT STEP
**`PART 0.5 — REPRODUCIBLE BASELINE EVALUATION AUDIT`**
