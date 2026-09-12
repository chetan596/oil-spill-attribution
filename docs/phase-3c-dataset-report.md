# Phase 3C — SIH SAR Dataset Ingestion & Validation Report

**System:** AI-Powered Oil Spill Detection & Vessel Attribution System (SIH26143)  
**Phase:** Phase 3C — SIH SAR Dataset Ingestion & Validation  
**Date:** September 2026  
**Status:** COMPLETE (Dataset Infrastructure Verified; Training Pending Official Dataset)  
**Architecture:** React Web (`apps/web`) → Node.js API (`services/backend-node`) → Python ML Service (`services/ml-python`)

---

## 1. Executive Summary

Phase 3C has constructed and verified the complete dataset ingestion, validation, and training-preparation pipeline for Sentinel-1 C-Band SAR marine oil spill detection. The pipeline enforces strict data integrity standards:
- **No data fabrication**: The system does not invent metadata, fabricated benchmark metrics, or pseudo-scientific numbers.
- **No unauthorized external downloads**: In strict accordance with competition rules, external datasets (Kaggle, Zenodo, KREST, M4D) were **not** downloaded.
- **Official SIH dataset state**: The official SIH26143 benchmark Sentinel-1 dataset is **not present locally** in `data/raw/satellite/`.
- **Synthetic test harness**: A dedicated synthetic SAR test suite generates realistic Sentinel-1-like GeoTIFF rasters with ground-truth masks in `data/samples/synthetic/` for end-to-end software verification without polluting real data directories.
- **Zero data leakage**: Train, validation, and test splits are enforced strictly at the **scene level** (not tile level), preventing adjacent tiles from the same satellite acquisition from contaminating evaluation splits.
- **Production PyTorch dataset**: `SARSpillDataset` provides manifest-driven tile slicing, radiometric normalization, spatial data augmentations, and binary or multi-class label extraction.

> [!IMPORTANT]
> **Scientific Integrity Notice:**
> - **OFFICIAL SIH DATASET:** NOT PRESENT LOCALLY (`data/raw/satellite/` contains only `.gitkeep`)
> - **EXTERNAL DATASETS:** NOT DOWNLOADED (Kaggle / Zenodo / KREST / M4D strictly prohibited)
> - **REAL ML TRAINING:** NOT STARTED
> - **REAL MODEL WEIGHTS:** NOT AVAILABLE
> - **INFRASTRUCTURE STATUS:** 100% OPERATIONAL & VERIFIED

---

## 2. Completed Files & Infrastructure

### 2.1 Scripts & CLI Utilities
1. `scripts/download-dataset.py`
   - Real SAR dataset inspector and ingestion orchestrator.
   - Scans `data/raw/satellite/` for real SAR GeoTIFF files and ground-truth masks.
   - If empty, prints clear step-by-step instructions for placing the SIH benchmark data.
   - Automatically validates `dataset_manifest.json` and runs raster validation if data is present.
   - Inspects synthetic test scenes and prints a structured summary.
   - **Does not download any data automatically.**

2. `scripts/generate_synthetic_sar.py`
   - Synthetic Sentinel-1 SAR test scene generator.
   - Simulates ocean surface backscatter using Gamma speckle statistics.
   - Simulates oil slick suppression patches (backscatter damping factor 0.15–0.35).
   - Generates EPSG:4326 GeoTIFFs (using realistic Mumbai offshore bounding box) and matching PNG ground-truth masks.
   - Generates `dataset_manifest.json` tagged with `source: "synthetic_test"`.

3. `scripts/generate_splits.py`
   - Scene-level train/val/test split generator (default 70% / 15% / 15%).
   - Stratifies scenes on the `contains_spill` boolean flag to ensure balanced slick representation across splits.
   - Preserves existing official splits if present.
   - Runs automated scene-level leakage checks (ensuring no `scene_id` spans multiple splits).
   - Updates `dataset_manifest.json` in-place and writes `ml/datasets/splits/splits.json`.

### 2.2 Python ML Service Modules
4. `services/ml-python/app/data/validators/manifest_validator.py`
   - Schema validation for `dataset_manifest.json`.
   - Checks top-level keys (`dataset_id`, `source`, `total_scenes`, `scenes`).
   - Checks per-scene fields (`scene_id`, `image_path`, `mask_path`, `polarization`, `width`, `height`, `crs`, `transform`, `split`).
   - Verifies referenced raster and mask files exist on disk with CWD-independent path resolution.
   - Returns structured `PASS` / `WARN` / `FAIL` diagnostic reports.

5. `services/ml-python/app/data/validators/raster_validator.py`
   - Per-scene GeoTIFF and mask integrity validation using `rasterio`.
   - Checks: raster readability, minimum dimensions, band count vs polarization, data type, CRS definition, non-identity affine transform, geographic coordinate bounds, NaN/Inf pixel ratio, zero-fill ratio.
   - Cross-validates that ground-truth mask dimensions exactly match the image raster dimensions.
   - Validates mask integer class values.

6. `services/ml-python/app/data/loaders/sar_dataset.py`
   - Manifest-driven PyTorch `Dataset` for SAR semantic segmentation.
   - Supports binary mode (`{0: sea, 1: oil}`) and multi-class mode.
   - Handles single VV or dual-polarization (`VV+VH`) inputs.
   - Provides grid-based on-demand tile slicing (`tile_size` × `tile_size`) with stride and zero-padding.
   - Implements spatial augmentations (random horizontal flip, vertical flip, 90° rotations) using pure NumPy.
   - Filters by split (`train`, `val`, `test`).

7. `services/ml-python/app/utils/visualize_sample.py`
   - Produces 3-panel visualization PNGs: `[SAR Image | Ground-Truth Mask | Overlay]`.
   - Supports headless execution with automatic Pillow fallback for environments where matplotlib native extensions are restricted by OS security policy.

8. `services/ml-python/tests/unit/test_dataset_validation.py`
   - 10 automated unit tests covering manifest validation, raster validation, PyTorch dataset loading, and scene-level split generation.

### 2.3 Configuration
9. `ml/configs/unet.yaml`
   - Updated with dataset path, synthetic manifest path, splits path, tile size (512), stride (448), polarization (`VV`), and augmentation settings.

---

## 3. Synthetic Test Dataset Verification

Generated with `python scripts/generate_synthetic_sar.py --include-large`:
- **Directory**: `data/samples/synthetic/`
- **Total Scenes**: 7
  - 6 scenes @ 512×512 px (4 with synthetic oil spills, 2 clean ocean)
  - 1 scene @ 2048×2048 px (large scene for tiling pipeline validation)
- **CRS**: `EPSG:4326` (WGS84 lon/lat, Mumbai offshore `[72.50, 18.60, 73.20, 19.30]`)
- **Manifest**: `data/samples/synthetic/dataset_manifest.json`
- **Manifest Validation**: `PASS` (117 passed checks, 1 warning for synthetic source, 0 failures)
- **Raster Validation**: `PASS` (7/7 scenes passed raster and mask alignment checks)
- **Splits Generated**: `ml/datasets/splits/splits.json` (4 train, 2 val, 1 test; 0 leakage)
- **Visualizations Generated**: `synth_512_001_viz.png`, `synth_512_002_viz.png`, `synth_512_003_viz.png`

---

## 4. Test Execution Results

### 4.1 Python ML Service Unit Tests
```bash
python -m pytest tests/unit/test_dataset_validation.py tests/unit/test_sar_preprocessing.py tests/unit/test_geospatial.py tests/unit/test_postprocessing.py -v
```
**Results:**
```
============================= test session starts =============================
collected 21 items

tests/unit/test_dataset_validation.py::test_manifest_validator_missing_file PASSED [  4%]
tests/unit/test_dataset_validation.py::test_manifest_validator_malformed_json PASSED [  9%]
tests/unit/test_dataset_validation.py::test_manifest_validator_missing_required_fields PASSED [ 14%]
tests/unit/test_dataset_validation.py::test_manifest_validator_valid_scene PASSED [ 19%]
tests/unit/test_dataset_validation.py::test_raster_validator_missing_image PASSED [ 23%]
tests/unit/test_dataset_validation.py::test_raster_validator_valid_scene PASSED [ 28%]
tests/unit/test_dataset_validation.py::test_raster_validator_mismatched_mask PASSED [ 33%]
tests/unit/test_dataset_validation.py::test_sar_spill_dataset_loading PASSED [ 38%]
tests/unit/test_dataset_validation.py::test_sar_spill_dataset_splits_filtering PASSED [ 42%]
tests/unit/test_dataset_validation.py::test_generate_splits_stratification_and_no_leakage PASSED [ 47%]
tests/unit/test_sar_preprocessing.py::test_load_sar_raster_vv PASSED     [ 52%]
tests/unit/test_sar_preprocessing.py::test_load_sar_raster_dual_pol PASSED [ 57%]
tests/unit/test_sar_preprocessing.py::test_load_sar_raster_missing_file PASSED [ 61%]
tests/unit/test_sar_preprocessing.py::test_tile_generation_and_reconstruction PASSED [ 66%]
tests/unit/test_geospatial.py::test_validate_georeferencing_valid PASSED [ 71%]
tests/unit/test_geospatial.py::test_validate_georeferencing_missing_crs PASSED [ 76%]
tests/unit/test_geospatial.py::test_validate_georeferencing_missing_transform PASSED [ 80%]
tests/unit/test_geospatial.py::test_pixel_to_geographic PASSED           [ 85%]
tests/unit/test_geospatial.py::test_calculate_projected_area_km2 PASSED  [ 90%]
tests/unit/test_postprocessing.py::test_probability_mask_to_polygons_empty PASSED [ 95%]
tests/unit/test_postprocessing.py::test_probability_mask_to_polygons_with_slick PASSED [100%]

======================= 21 passed, 11 warnings in 1.04s =======================
```

### 4.2 Node.js Backend Service Tests
```bash
npm test (in services/backend-node)
```
**Results:**
```
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        0.552 s
```

---

## 5. Instructions for Ingesting Official SIH Dataset

When the SIH evaluation committee provides the official Sentinel-1 SAR dataset:

1. **Place Raw GeoTIFFs**:
   ```
   data/raw/satellite/
   ├── scene_001_VV.tif
   ├── scene_001_mask.png
   ├── scene_002_VV.tif
   └── scene_002_mask.png
   ```

2. **Create Dataset Manifest**:
   Generate `data/raw/satellite/dataset_manifest.json` following the schema in `docs/phase-3a-data-requirements.md`.

3. **Run Validation**:
   ```bash
   python scripts/download-dataset.py --manifest data/raw/satellite/dataset_manifest.json
   ```

4. **Generate Scene-Level Splits**:
   ```bash
   python scripts/generate_splits.py --manifest data/raw/satellite/dataset_manifest.json --output ml/datasets/splits/splits.json
   ```

5. **Proceed to Phase 3D (Model Training)**:
   Once the manifest passes validation and splits are generated, training can proceed using `SARSpillDataset`.

---

## 6. Phase 3C Status & Blocker Assessment

| Item | Status | Notes |
| :--- | :--- | :--- |
| **Ingestion Pipeline** | ✅ COMPLETE | `download-dataset.py` operational |
| **Manifest Validation** | ✅ COMPLETE | `manifest_validator.py` verified |
| **Raster Validation** | ✅ COMPLETE | `raster_validator.py` verified |
| **PyTorch Dataset** | ✅ COMPLETE | `SARSpillDataset` verified |
| **Split Generator** | ✅ COMPLETE | `generate_splits.py` verified, 0 leakage |
| **Synthetic Test Data** | ✅ COMPLETE | 7 scenes generated & validated |
| **Visualization Utility**| ✅ COMPLETE | 3-panel visualizer verified |
| **Automated Tests** | ✅ COMPLETE | 21 Python + 4 Node tests passing |
| **Phase 3C Overall** | ✅ **COMPLETE** | All dataset infrastructure operational |
| **Remaining Blocker** | ⚠️ DATASET PENDING | Official SIH26143 Sentinel-1 SAR imagery not provided yet |
