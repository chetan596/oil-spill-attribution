# Phase 3D-1 — Real Sentinel-1 SAR Dataset Verification Report

**Project**: AI-Powered Oil Spill Detection & Vessel Attribution System  
**SIH Problem Statement**: 26143  
**Stage**: Phase 3D-1 — Real Sentinel-1 SAR Dataset Verification  
**Date**: September 12, 2026  
**Status**: VERIFIED — NO TRAINING PERFORMED

---

## 1. Dataset Source

The verified real data was acquired directly from the official benchmark Sentinel-1 SAR Marine Oil Spill Dataset records hosted on Zenodo:

* **Part I (Oil Spill Train/Val)**: DOI `10.5281/zenodo.8346860`
  * Citation: *A benchmark dataset of Sentinel-1 SAR imagery for marine oil spill detection*, Marine Pollution Bulletin (2024).
  * Original archive: `01_Train_Val_Oil_Spill_images.7z` (40.7 GB) & `01_Train_Val_Oil_Spill_mask.7z` (5.95 MB).
* **Part II (No-Oil & Look-Alike Train/Val)**: DOI `10.5281/zenodo.8253899`
  * Original archives: `01_Train_Val_No_Oil_Images.7z` (22.9 GB), `01_Train_Val_No_Oil_mask.7z` (0.40 MB), `01_Train_Val_Lookalike_images.7z` (23.0 GB), `01_Train_Val_Lookalike_mask.7z` (0.41 MB).
* **Part III (Independent Test Set)**: DOI `10.5281/zenodo.13761290`
  * Original archive: `02_Test_images_and_ground_truth.7z` (9.86 GB).

---

## 2. Parts Used

All three official Zenodo records were used to compile a small, representative, and class-balanced sample:
1. **Part I**: 5 verified Oil Spill training/validation scenes.
2. **Part II (No-Oil)**: 5 verified No-Oil (clean sea) scenes.
3. **Part II (Look-alike)**: 5 verified Look-alike (algae/low-wind/natural seep) scenes.
4. **Part III (Test)**: 5 verified independent test scenes with ground truth.

---

## 3. Number of Files Downloaded

* **Real Sentinel-1 SAR Image GeoTIFFs**: 20 files
* **Matching Ground-Truth Mask GeoTIFFs**: 20 files
* **Total Image/Mask Pairs**: 20 pairs (40 files total)
* **Filename Correspondence**: 100% exact 1:1 match across all categories.

Directory structure:
```
data/raw/satellite/
  dataset_manifest.json
  real/
    part1_oil/
      images/  [00000.tif, 00002.tif, 00003.tif, 00004.tif, 00006.tif]
      masks/   [00000.tif, 00002.tif, 00003.tif, 00004.tif, 00006.tif]
    part2_no_oil/
      images/  [00000.tif, 00001.tif, 00002.tif, 00005.tif, 00006.tif]
      masks/   [00000.tif, 00001.tif, 00002.tif, 00005.tif, 00006.tif]
    part2_lookalike/
      images/  [00000.tif, 00001.tif, 00002.tif, 00003.tif, 00090.tif]
      masks/   [00000.tif, 00001.tif, 00002.tif, 00003.tif, 00090.tif]
    part3_test/
      images/  [00060.tif, 00062.tif, 00063.tif, 00064.tif, 00080.tif]
      masks/   [00060.tif, 00062.tif, 00063.tif, 00064.tif, 00080.tif]
```

Synthetic data remains strictly isolated in `data/samples/synthetic/`.

---

## 4. Categories and Scene Audit

| Category | Folder | Split | Scene ID | Image Dimensions | Bands | Dtype | CRS | Mask Values | Oil Pixels |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Oil Spill** | `part1_oil` | train | `00000.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0, 1} | 14,539 |
| **Oil Spill** | `part1_oil` | train | `00002.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0, 1} | 16,314 |
| **Oil Spill** | `part1_oil` | train | `00003.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0, 1} | 24,791 |
| **Oil Spill** | `part1_oil` | train | `00004.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0, 1} | 44,049 |
| **Oil Spill** | `part1_oil` | val | `00006.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0, 1} | 89,378 |
| **No-Oil** | `part2_no_oil` | train | `00000.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **No-Oil** | `part2_no_oil` | train | `00001.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **No-Oil** | `part2_no_oil` | train | `00002.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **No-Oil** | `part2_no_oil` | train | `00005.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **No-Oil** | `part2_no_oil` | val | `00006.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **Look-alike** | `part2_lookalike` | train | `00000.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **Look-alike** | `part2_lookalike` | train | `00001.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **Look-alike** | `part2_lookalike` | train | `00002.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **Look-alike** | `part2_lookalike` | train | `00003.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **Look-alike** | `part2_lookalike` | val | `00090.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **Test Set** | `part3_test` | test | `00060.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **Test Set** | `part3_test` | test | `00062.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0, 1} | 24,162 |
| **Test Set** | `part3_test` | test | `00063.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0} | 0 |
| **Test Set** | `part3_test` | test | `00064.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0, 1} | 52,620 |
| **Test Set** | `part3_test` | test | `00080.tif` | 2048×2048 | 2 (VV, VH) | float32 | EPSG:4326 | {0, 1} | 128,475 |

---

## 5. Image Dimensions

* **Width × Height**: 2048 × 2048 pixels for all 20 images and 20 masks.
* **Tiling**: Tiled into 512 × 512 non-overlapping patches (stride = 512).
* **Tiles per Scene**: Exactly 16 tiles of 512 × 512 per scene.
* **Total Tile Count**: 20 scenes × 16 tiles = 320 tiles (Train: 192 tiles, Val: 48 tiles, Test: 80 tiles).

---

## 6. VV / VH Confirmation

All images were confirmed to have exactly 2 channels formatted as 32-bit floating point backscatter:
* **Band 1 (VV)**: Co-polarization channel in decibels ($\sigma^0$ dB). Typical dynamic range: $-56.0\text{ dB}$ to $+9.7\text{ dB}$, mean around $-20.5\text{ dB}$.
* **Band 2 (VH)**: Cross-polarization channel in decibels ($\sigma^0$ dB). Typical dynamic range: $-49.0\text{ dB}$ to $+20.1\text{ dB}$, mean around $-27.8\text{ dB}$.
* **Dual-pol ratio**: The ratio between VV and VH enables effective discrimination of wind shadows and biogenic look-alikes from true mineral oil slicks.

---

## 7. Mask Structure

* **Format**: 1-channel GeoTIFF, dimensions 2048 × 2048, `uint8` data type.
* **Class Mapping**:
  * `0`: Clean sea surface / background / look-alikes.
  * `1`: Oil spill slick pixels.
* **Pixel Distribution**:
  * Positive oil scenes contain between 14,539 and 128,475 oil spill pixels.
  * Negative scenes (no-oil and look-alike) contain 0 oil pixels.

---

## 8. CRS & Transform Availability

* **SAR Images**: Fully georeferenced.
  * **CRS**: `EPSG:4326` (WGS 84 Geographic Coordinate System).
  * **Affine Transform**: Valid 6-parameter affine geotransform, e.g.:
    $$\begin{bmatrix} 8.983\times 10^{-5} & 0.0 & x_{\text{origin}} \\ 0.0 & -8.983\times 10^{-5} & y_{\text{origin}} \end{bmatrix}$$
    corresponding to a ground pixel spacing of approximately $10\text{ meters}$.
* **Ground-Truth Masks**: **Non-georeferenced** (`CRS: None`, identity affine matrix).
  * Conforms strictly to the official dataset documentation: ground-truth masks were drawn on the matrix grid and do not embed GIS tags.
  * **Compliance Rule**: No fake CRS or affine transform was attached to masks.

---

## 9. Image-Mask Alignment Result

* **Alignment**: **VERIFIED** on the identical 2048 × 2048 pixel matrix.
* **Geospatial Projection Rule**:
  $$\text{Image Transform / CRS} \longrightarrow \text{Model Output Mask (identical pixel grid)} \xrightarrow{\text{Image Transform}} \text{Geographic Polygon (EPSG:4326 GeoJSON)}$$
* Mask coordinates map directly to image coordinates by row/column index. Vector polygon extraction uses the SAR image transform, ensuring exact spatial accuracy without fabricating mask metadata.

---

## 10. Pipeline Validation Result

The real dataset was passed through the end-to-end data pipeline:
1. **Manifest Validator**: 325 checks executed across 20 scenes.
   * `Passed`: 325 / 325
   * `Failed`: 0
   * `Status`: **PASS**
2. **Raster Validator**: Evaluated GeoTIFF headers, channel counts, dimension parity, and value ranges.
   * `20 / 20 scenes passed raster validation` (0 failures).
3. **Preprocessing & Normalization**:
   * Min-max scaling of SAR dB channels to $[0.0, 1.0]$.
   * Non-overlapping 512×512 tiling.
4. **PyTorch Dataset Loader (`SARSpillDataset`)**:
   * Mode: `binary`
   * Polarization: `VV+VH`
   * Confirmed outputs:
     * `image tensor = [2, 512, 512]` (dtype: `float32`, bounded in $[0.0, 1.0]$)
     * `mask tensor  = [512, 512]` (dtype: `int64`, values in $\{0, 1\}$)
   * All unit tests passed (`10 / 10 passed` in `test_dataset_validation.py`).

---

## 11. Disk Space Used

* **Real dataset directory (`data/raw/satellite/real/`)**: `834.54 MB`
* **Real dataset manifest (`data/raw/satellite/dataset_manifest.json`)**: `16 KB`
* **Cache & scratch temporary files**: Cleaned and isolated.
* Total footprint is well under 1 GB, adhering to the small-subset requirement.

---

## 12. Dataset Problems & Technical Solutions

1. **Zenodo Solid 7-Zip Archives**:
   * The complete dataset is packaged into massive solid 7z archives (~40.7 GB Part I, ~23 GB Part II, ~9.86 GB Part III).
   * In a solid LZMA stream, files are compressed contiguously. Decompressing a single file requires reading from the start of the solid block.
   * **Solution**: Developed `CachedZenodoStream` utilizing HTTP Range headers (`206 Partial Content`) via `curl.exe` with local 8 MB chunk caching. This enabled targeted indexing and extraction of the first contiguous image blocks (< 150 MB downloaded) while fetching masks from the dedicated lightweight mask archives (`01_Train_Val_*_mask.7z`, < 6 MB).
2. **Mask Georeferencing**:
   * Masks in the Zenodo dataset do not contain CRS tags (`NotGeoreferencedWarning`).
   * **Solution**: Preserved `CRS: None` on disk. Handled pixel alignment via 2048×2048 matrix indexing, and bound vector polygonization directly to the SAR image geotransform.

---

## 13. Exact Next Action for Training

1. **Do NOT train on this subset alone**: 20 scenes provide verification of pipeline integrity, but are not sufficient for production generalisation.
2. **Training Setup (Phase 3D-2)**:
   * Acquire additional scene blocks incrementally using the established Range streamer or complete the full dataset download if storage/network permits.
   * Configure `ml/configs/unet.yaml` for dual-pol input (`in_channels: 2`).
   * Use Combined Loss: Binary Cross-Entropy with Logits + Soft Dice Loss:
     $$\mathcal{L} = \mathcal{L}_{\text{BCE}} + \lambda \mathcal{L}_{\text{Dice}}$$
   * Implement class reweighting to compensate for the severe foreground/background imbalance (oil pixels represent $\approx 0.1\%$ to $3.0\%$ of positive scene areas).

---

## Final Status Block

```
REAL DATASET SUBSET = VERIFIED
VV+VH = VERIFIED
MASK ALIGNMENT = VERIFIED
PYTORCH LOADER = VERIFIED
GEOSPATIAL METADATA = VERIFIED
TRAINING = NOT STARTED
```
