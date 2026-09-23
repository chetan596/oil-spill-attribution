# Part 0.14B.2 — Real Optical Dataset Scientific Split, Event Isolation & Leakage Audit Report

**Part**: `0.14B.2`  
**Status**: `COMPLETE`  
**Timestamp**: 2026-09-20T03:03Z  
**Training Executed**: `NO` (Strictly prohibited in this part)  
**V1 Model Modified**: `NO` (Frozen and preserved)  
**SAR Pipeline Modified**: `NO` (Frozen)  

---

## 1. Executive Summary

This report documents the rigorous partitioning, scene/event isolation, perceptual cluster deduplication, and zero-leakage validation of the curated optical oil-spill dataset (`OceanGuard-Real-Optical-Curated-Benchmark-V2`).

All **3,529 verified real optical images** are grouped into disjoint atomic clusters based on Sentinel-2 satellite acquisition scenes, drone flight events, and 64-bit dHash perceptual clusters. The external evaluation benchmark is sealed and completely isolated from development splits.

---

## 2. Dataset Overview & Source Inventory

```
Total Curated Images: 3,529
Unique Atomic Groups: 177
Unique Scenes:        177
Unique Events:        175
```

### 2.1 Source Composition

| Source | Modality | Platform | Total Images | Train | Validation | Internal Test | External Test (Sealed) | License |
|---|---|---|---|---|---|---|---|---|
| **MADOS** | Satellite Optical | Sentinel-2 MSI | 2,734 | 1,401 | 625 | 708 | 0 | CC BY 4.0 |
| **Kerf** | Drone Optical RGB | DJI Mavic / YACOB UAV | 795 | 560 | 105 | 0 | 130 | CC BY 4.0 |
| **Total** | | | **3,529** | **1,961** | **730** | **708** | **130** | **CC BY 4.0** |

---

## 3. Scientific Split Composition

| Split | Total Images | % of Total | Oil Spill | Clean Ocean | Look-Alike | MADOS Count | Kerf Count | Unique Scenes / Groups |
|---|---|---|---|---|---|---|---|---|
| **TRAIN** | 1,961 | 55.6% | 602 | 361 | 998 | 1,401 | 560 | 97 |
| **VALIDATION** | 730 | 20.7% | 153 | 165 | 412 | 625 | 105 | 37 |
| **INTERNAL_TEST** | 708 | 20.1% | 80 | 162 | 466 | 708 | 0 | 42 |
| **EXTERNAL_TEST (Sealed)** | 130 | 3.7% | 86 | 11 | 33 | 0 | 130 | 1 |
| **Total** | **3,529** | **100.0%** | **921** | **699** | **1,909** | **2,734** | **795** | **177** |

---

## 4. Grouping & Event Isolation Strategy

To prevent data leakage, images are grouped by:
1. **Scene Identifier (`scene_id`)**:
   - MADOS Sentinel-2 acquisition scenes (`Scene_0` through `Scene_173`). All crops from a given scene are bound to a single split.
   - Kerf drone flight sequences (`kerf_train`, `kerf_val`, `kerf_test`).
2. **Event Identifier (`event_id`)**:
   - MADOS satellite capture passes.
   - Kerf Port of Antwerp flight deployments.
3. **Perceptual Similarity Clustering (64-bit dHash)**:
   - Images within Hamming distance $\le 2$ are merged into a single connected component and assigned to the same atomic group.

---

## 5. Automated Leakage Audit Results

| Split Pair | SHA-256 Overlap | Scene Overlap | Event Overlap | Atomic Group Overlap | Perceptual Cluster Overlap | Status |
|---|---|---|---|---|---|---|
| **TRAIN vs VALIDATION** | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **TRAIN vs INTERNAL_TEST** | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **TRAIN vs EXTERNAL_TEST** | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **VALIDATION vs INTERNAL_TEST** | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **VALIDATION vs EXTERNAL_TEST** | 0 | 0 | 0 | 0 | 0 | **PASS** |
| **INTERNAL_TEST vs EXTERNAL_TEST** | 0 | 0 | 0 | 0 | 0 | **PASS** |

**Zero leakage detected across all split combinations.**

---

## 6. External Test Set Seal

- Candidate count: **130 images** (Oil: 86, Clean: 11, Look-Alike: 33)
- Modality: Genuine optical drone imagery (Kerf port test distribution)
- Status: **`SEALED`**
- Enforcement: Strictly forbidden from model training, augmentation, hyperparameter selection, or early stopping.

---

## 7. Class Semantics & Label Mapping Audit

Normalized three-class structure:
1. **`OIL_SPILL` (Binary Label: 1)**:
   - Kerf ground truth: `Oil`
   - MADOS ground truth: `Class 6: Oil Spill`
2. **`CLEAN_OCEAN` (Binary Label: 0)**:
   - Kerf ground truth: `Clean_Water`
   - MADOS ground truth: `Class 7: Marine Water`
3. **`LOOK_ALIKE` (Binary Label: 0)**:
   - Kerf ground truth: `Port_Reflections_Debris`
   - MADOS ground truth: `Marine Debris` (1), `Dense Sargassum` (2), `Sparse Floating Algae` (3), `Natural Organic Material` (4), `Ship` (5), `Sediment-Laden Water` (8), `Foam` (9), `Turbid Water` (10), `Shallow Water` (11), `Waves & Wakes` (12), `Oil Platform` (13), `Jellyfish` (14), `Sea Snot` (15)

---

## 8. Quality & Modality Safety Audit

- **Quality Status**:
  - `QUALITY_OK`: 3,529 (100%)
  - `QUALITY_REVIEW`: 0
  - `QUALITY_INVALID`: 0
- **Modality Safety**:
  - Genuine Optical RGB: 3,529
  - SAR-Derived Pseudo-RGB: 0
  - AI-Generated / Synthetic: 0

---

## 9. Manifest & File Artifacts

Generated metadata files in `data/raw/optical_real/metadata/`:
- [`split_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/split_manifest.json)
- [`train_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/train_manifest.json)
- [`validation_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/validation_manifest.json)
- [`internal_test_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/internal_test_manifest.json)
- [`external_test_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/external_test_manifest.json)
- [`leakage_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/leakage_audit.json)
- [`group_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/group_audit.json)
- [`label_mapping_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/label_mapping_audit.json)
- [`quality_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_real/metadata/quality_audit.json)

Populated structured directory tree in `data/processed/optical_real/`:
- `train/` (`oil_spill/`, `clean_ocean/`, `look_alike/`)
- `validation/` (`oil_spill/`, `clean_ocean/`, `look_alike/`)
- `internal_test/` (`oil_spill/`, `clean_ocean/`, `look_alike/`)
- `external_test/` (`oil_spill/`, `clean_ocean/`, `look_alike/`)

---

## 10. Scientific Limitations & Final Decision

1. **Dataset Integrity vs Generalization**:
   - While dataset partitioning is mathematically leak-free and validated, real-world optical generalization will still face environmental variations (sun glint, sea state, camera angle, atmospheric haze).
2. **Model Training Status**:
   - Model training remains **NOT STARTED**.
   - `rgb-oil-classifier-resnet18-v1` remains **FROZEN** and unchanged.
3. **Readiness Decision**:
   - **`READY_FOR_MODEL_TRAINING`** for supervised V2 training.
