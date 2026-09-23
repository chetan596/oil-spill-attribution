# PART 0.14C.1 — Real Optical Oil-Spill Segmentation Dataset Audit Report

## 1. Objective
Following the completion of the real optical classifier (ResNet-18 V2), this audit investigates and validates the available genuine optical datasets for the second major capability of the manual image analysis pipeline: **Pixel-Level Oil Spill Localization & Segmentation** (`IMAGE → SEGMENTATION MASK`).

The objective of this phase is to establish whether genuine, human/official pixel-level ground-truth oil spill masks exist in the local real optical repository (`data/raw/optical_real/`), verify pixel-for-pixel alignment, validate mask semantics and class encodings, prevent data leakage, and establish verified segmentation manifests.

> [!IMPORTANT]
> **Audit-Only Mandate**:
> No segmentation models (U-Net, DeepLab, SegFormer, SAM) were trained in this task. No synthetic, pseudo-labeled, or bounding-box masks were created. Only genuine ground-truth annotations from verified scientific sources were audited.

---

## 2. Dataset Sources & Modalities

| Source Dataset | Modality / Sensor | Original Archive Size | Ground Truth Annotation Type | Usability Status |
|---|---|---|---|---|
| **MADOS** (Zenodo 10664073, DOI: 10.5281/zenodo.10664073) | Sentinel-2 Optical MSI ($10\text{ m}$ GSD) | 4.038 GB | Multi-Class GeoTIFF Pixel-Level Semantic Masks (`.tif`) | **USABLE** (2,734 pairs verified) |
| **KERF** (Zenodo 10555314, DOI: 10.5281/zenodo.10555314) | Drone Aerial Optical RGB ($1920\times 1080$) | 1.137 GB | Color-Coded PNG Pixel-Level Segmentation Masks (`.png`) | **USABLE** (795 pairs verified) |
| **LADOS** | Satellite / Optical | — | Blocked by Elsevier Cloudflare / reCAPTCHA | **EXCLUDED** (0 acquired) |
| **NOAA** | Aerial Photography | — | Bulk acquisition blocked / no local masks | **EXCLUDED** (0 acquired) |

---

## 3. Mask Semantics & Class Definitions

### MADOS Marine Debris and Oil Spill Dataset
- **File Format**: Single-channel GeoTIFF (`.tif`) masks matching optical Sentinel-2 $10\text{ m}$ surface reflectance crops.
- **Dimensions**: $240 \times 240$ pixels.
- **Class ID Mapping**:
  - `0`: Marine Water (Clean / Background)
  - `1`: Waves / Sea Spray
  - `2`: Whitewash / Wave crest
  - `3`: Ships / Vessels
  - `4`: Ship wake / Foam
  - `5`: Clouds / Haze
  - `6`: **OIL SPILL** (Ground-truth oil slicks and spills)
  - `7`: Floating Sargassum / Marine Debris
  - `8`: Suspended Sediment
  - `9`: Natural Organic Films / Biogenic Slicks
  - `10`–`15`: Shallow water, sandbars, shadow, and other coastal classes.
- **Oil Mask Definition**:
  $$\text{Binary Oil Mask} = (\text{MADOS\_Mask} == 6)$$

### KERF Port Drone Oil Spill Dataset
- **File Format**: 3-channel RGB PNG (`.png`) masks matching $1920 \times 1080$ aerial drone images.
- **Color Encoding (`label_colors.txt`)**:
  - `(0, 0, 0)`: Background
  - `(255, 0, 124)`: **OIL SPILL**
  - `(255, 204, 51)`: Others / Obstacles / Port Infrastructure
  - `(51, 221, 255)`: Water / Clean Sea
- **Oil Mask Definition**:
  $$\text{Binary Oil Mask} = (R > 200) \land (G < 50) \land (B > 100)$$

---

## 4. Pairing & Alignment Validation

Every image in the repository was audited against its corresponding ground-truth mask file on disk:

- **Total Images Audited**: 3,529
- **Total Matched Pairs**: **3,529 / 3,529** (100.0%)
  - MADOS matched: 2,734 / 2,734
  - KERF matched: 795 / 795
- **Dimension Mismatch Audit**: **0** mismatches (100% spatial resolution and aspect ratio alignment).
- **Corrupted / Undecodable Files**: **0**

---

## 5. Mask Quality & Spatial Statistics

| Metric | MADOS (Sentinel-2) | KERF (Drone RGB) | Full Dataset Total |
|---|---|---|---|
| **Total Image-Mask Pairs** | 2,734 | 795 | **3,529** |
| **Oil-Positive Images ($>0$ oil px)** | 361 | 562 | **923** (26.15%) |
| **Oil-Negative Images ($=0$ oil px)** | 2,373 | 233 | **2,606** (73.85%) |
| **Total Oil Pixels** | 234,568 px | 605,519,700 px | **605,754,268 px** |
| **Mean Oil Fraction (Oil+ images)** | 1.13% | 44.81% | **27.73%** |
| **Median Oil Fraction (Oil+ images)** | 0.50% | 38.41% | **15.10%** |
| **Min Oil Fraction (Oil+ images)** | 0.0035% | 0.012% | **0.0035%** |
| **Max Oil Fraction (Oil+ images)** | 19.82% | 99.45% | **99.45%** |
| **Quality Distribution** | 2,734 `VALID` | 758 `VALID`, 37 `REVIEW_REQUIRED`* | **3,492 `VALID`, 37 `REVIEW_REQUIRED`** |

*\*Note: 37 KERF images were flagged as `REVIEW_REQUIRED` due to either near-100% oil coverage ($>99\%$) or tiny localized sheen speckles ($<0.01\%$). All 3,529 pairs are preserved in the dataset manifest.*

---

## 6. Leakage Protection & Group-Based Splits

To guarantee zero data leakage across splits, the segmentation dataset inherits the exact scene, event, and perceptual cluster groupings established in Part 0.14B.2:

- **Train Split**: 1,961 pairs (604 Oil+, 1,357 Oil-)
- **Validation Split**: 730 pairs (153 Oil+, 577 Oil-)
- **Internal Test Split**: 708 pairs (80 Oil+, 628 Oil-)
- **External Test Split**: 130 pairs (86 Oil+, 44 Oil-) — **Isolated & Sealed**

### Leakage Audit Results
- **SHA-256 Overlap**: **0**
- **Perceptual Cluster Overlap**: **0**
- **Scene Overlap**: **0**
- **Event Overlap**: **0**
- **External Test Isolation**: **100% Preserved**

---

## 7. Visual Validation

40 visual validation composites (stitching Original RGB, Ground-Truth Mask, and 50% Alpha-Blended Red Overlay side-by-side) were generated and saved in:
`ml/experiments/results/segmentation_dataset_audit/`

- 10 MADOS Oil-Positive samples ([`mados_oil_01` ... `10`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/segmentation_dataset_audit/))
- 10 MADOS Oil-Negative samples ([`mados_non_oil_01` ... `10`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/segmentation_dataset_audit/))
- 10 KERF Oil-Positive samples ([`kerf_oil_01` ... `10`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/segmentation_dataset_audit/))
- 10 KERF Oil-Negative samples ([`kerf_non_oil_01` ... `10`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/segmentation_dataset_audit/))

Visual inspection confirms that ground-truth masks tightly follow the oil spill plumes, wakes, sheen fringes, and complex boundary contours.

---

## 8. Scientific Limitations & Boundary Conditions
1. **Binary vs. Multi-Class Ground Truth**:
   - The audited ground truth provides robust support for **Binary Oil vs. Non-Oil segmentation**.
   - MADOS contains multi-class marine annotations (waves, ship wakes, algae), but KERF only annotates oil vs. water/infrastructure. Therefore, cross-source models should focus on binary oil spill localization.
2. **Physical Volume & Thickness Limitations**:
   - 2D optical masks indicate spatial presence of oil slicks, but do **not** provide physical slick thickness (microns) or volumetric discharge rates ($m^3$). No thickness estimation should be claimed from optical masks alone.
3. **Sensor GSD Disparity**:
   - MADOS ($10\text{ m}$ satellite pixels) captures large-scale regional spills, where oil typically occupies $0.1\%\text{--}5\%$ of a scene crop.
   - KERF (sub-centimeter drone pixels) captures localized, high-density spill zones where oil occupies $20\%\text{--}80\%$ of the frame. Training pipelines must account for this multi-scale spatial disparity.

---

## 9. Segmentation Metadata Artifacts Created

The following manifest files have been generated in [`data/raw/optical_real/metadata/segmentation/`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/segmentation/):
1. [`segmentation_dataset_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/segmentation/segmentation_dataset_audit.json)
2. [`segmentation_image_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/segmentation/segmentation_image_manifest.json) (3,529 pairs)
3. [`segmentation_train_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/segmentation/segmentation_train_manifest.json) (1,961 pairs)
4. [`segmentation_validation_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/segmentation/segmentation_validation_manifest.json) (730 pairs)
5. [`segmentation_internal_test_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/segmentation/segmentation_internal_test_manifest.json) (708 pairs)
6. [`segmentation_exclusions.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/segmentation/segmentation_exclusions.json) (0 exclusions)
7. [`mask_statistics.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/segmentation/mask_statistics.json)

---

## 10. Final Readiness Decision
The optical segmentation dataset audit is complete. All 3,529 image-mask pairs are verified, non-leaking, and indexed with pixel-level ground truth. The dataset is **READY_FOR_SEGMENTATION_TRAINING**.
