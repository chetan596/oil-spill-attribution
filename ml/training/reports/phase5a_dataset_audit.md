# Phase 5A — RGB Fine-Tuning Dataset & Split Audit Report

**Project:** Ocean Guard AI / SIH 26143  
**Audit Timestamp:** 2026-09-20  
**Phase Status:** COMPLETE (Audit & Planning Only — Training Not Started)

---

## 1. Executive Summary

Phase 5A establishes the formal, deterministic dataset partitioning and split leakage audit for subsequent optical oil-spill segmentation fine-tuning experiments. Following the empirical findings of the Phase 4 standardized benchmark (conducted on GPU across 6 model configurations), this audit defines the precise dataset boundaries, quarantines all evaluation benchmarks, preserves the immutability of the sealed test set, resolves cross-split leakage, and specifies two fine-tuning configurations.

### Core Governance Constraints
- **ZERO Training / Fine-Tuning Performed:** All weights and production models remain untouched.
- **Phase 4 Benchmark Locked:** `ml/benchmark/results/rgb_benchmark_20260920_142441/` is permanently locked and immutable.
- **Sealed Test Set Locked:** `data/raw/optical_real/metadata/segmentation/segmentation_external_test_manifest.json` (130 samples) is strictly locked (`SEALED_EXTERNAL_TEST: LOCKED`).
- **Benchmark Sample Quarantine:** All 833 Phase 4 benchmark samples are reserved strictly for evaluation (`EVALUATION ONLY`) and excluded from new training/validation splits.

---

## 2. Dataset Inventory

| Dataset | Modality / Sensor | Resolution | Total Available Samples | Ground Truth Format | Hard Case Categories Available |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MADOS** | Sentinel-2 MSI Multi-Spectral | 10 m GSD | 2,734 | Multi-class GeoTIFF (Class 6: Oil) | Oil + Ship (25), Large Oil (15), Difficult Oil (346) |
| **KERF** | Drone / Aerial RGB | High-Res (1080p+) | 795 | Color-Coded PNG (`RGB=(255, 0, 124)`) | Oil + Ship (280), Large Oil (85), Wake + Oil (106) |
| **LADOS** | High-Res Aerial RGB | Variable High-Res | 3,388 (6,462 polygons in manifest) | Polygon annotations / Subsets | Oil, Emulsion, Sheen, Ship, Platform, Clean Water |
| **Representative Failure** | High-Aspect Aerial ($612\times 259$) | Aspect $2.36:1$ | 1 | Qualitative / Unlabeled | Ship Hull, Wake, Diffuse Discharge, Aspect Stress |
| **Sealed External Test** | Multi-Sensor Curated | Multi-Res | 130 | Binary Segmentation Masks | Held-out evaluation only (LOCKED) |

---

## 3. Split Leakage & Deduplication Audit

A comprehensive cryptographic and perceptual audit was executed across all 3,529 paired optical images in the local repository:

### 3.1 Exact Cryptographic Deduplication
- **SHA-256 Image Hashes:** Checked across all 3,529 images.
- **Collisions Found:** `0` (Every single image file has a unique SHA-256 hash).
- **Mask Hashes:** Unique to corresponding image pairs.

### 3.2 Perceptual Similarity & Near-Duplicate Analysis
- **Perceptual Hash (pHash):** Evaluated across the dataset catalog.
- **Collisions Found:** `0` cross-split collisions.

### 3.3 Scene & Geographic Disjointness
- **Unique Scenes Identified:** 177 distinct acquisition scenes/events across MADOS and KERF.
- **Cross-Split Scene Overlap:**
  - TRAIN vs. VALIDATION: `0` common scenes.
  - TRAIN vs. SEALED EXTERNAL TEST: `0` common scenes.
  - VALIDATION vs. SEALED EXTERNAL TEST: `0` common scenes.
- **Event-Level Integrity:** All satellite scenes are strictly partitioned by acquisition pass. KERF drone imagery comprises 795 frames from the Antwerp port survey, cleanly grouped into non-overlapping temporal video sequences.

### 3.4 Historical Baseline V2 Overlap Disclosure
- Baseline V2 was originally trained during Phase 0 on the historical 1,961-sample training split.
- When Phase 4 benchmarked the 832 hard cases across the repository, 599 fell within the historical training split, 153 in validation, and 80 in internal test.
- **Quarantine Rule Enforced:** To prevent data contamination during future fine-tuning, all 833 benchmark samples are quarantined into `benchmark_manifest.json` (`EVALUATION ONLY`) and completely removed from `train_manifest.json` and `val_manifest.json`.

---

## 4. Split Partitioning & Manifest Summary

The dataset pool has been partitioned into 4 explicit manifests stored in `ml/training/manifests/`:

| Manifest File | Sample Count | Scene Count | Composition | Purpose |
| :--- | :---: | :---: | :--- | :--- |
| [`train_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/manifests/train_manifest.json) | **2,053** | 156 scenes | MADOS background/look-alikes + KERF clean + non-benchmark slices | Safe training split (Zero benchmark leakage) |
| [`val_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/manifests/val_manifest.json) | **514** | 19 scenes | Disjoint validation scenes (20% of available non-benchmark pool) | In-training validation and checkpoint selection |
| [`benchmark_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/manifests/benchmark_manifest.json) | **833** | Distinct | 471 KERF hard + 361 MADOS hard + 1 Representative failure | Phase 4 evaluation suite (STRICTLY EVALUATION ONLY) |
| [`sealed_test_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/manifests/sealed_test_manifest.json) | **130** | Distinct | Curated external test set | Final locked evaluation gate (STRICTLY LOCKED) |
| [`split_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/manifests/split_audit.json) | — | — | Machine-readable audit verification and checksums | Cryptographic provenance record |

---

## 5. Category Breakdown & Class Representation

### 5.1 Category Distribution in Paired Dataset (3,529 samples)

| Category | Sample Count | Percentage | Availability / Identification Source |
| :--- | :---: | :---: | :--- |
| **Oil (Total Foreground)** | 923 | 26.16% | Verified ground truth positive masks |
| **Vessel-Associated Oil** | 305 | 8.64% | Manifest metadata (`oil_ship_cases`: 280 KERF, 25 MADOS) |
| **Large Oil Slicks** | 478 | 13.55% | Manifest metadata (`large_oil_cases` + oil fraction $>15\%$) |
| **Narrow Filaments** | 306 | 8.67% | Area fraction $<2\%$ thin trailing slicks |
| **Diffuse Oil / Wake Overlap** | 452 | 12.81% | Manifest metadata (`wake_oil_cases` + `difficult_oil_cases`) |
| **Wake / Look-Alikes** | 1,907 | 54.04% | Curated negative/lookalike GeoTIFF & PNG tiles |
| **Clean Ocean** | 699 | 19.81% | Open-water verified negative tiles |
| **Emulsion (LADOS)** | 640 | — | Documented in LADOS manifest (640 image instances) |
| **Sheen (LADOS)** | 835 | — | Documented in LADOS manifest (520 sheen + 315 oil-sheen-ship) |
| **Ship-Only Hard Negatives** | 621 | — | Documented in LADOS manifest (621 vessel-only clean sea images) |

> [!NOTE]
> For KERF and MADOS, specific sub-typing into Emulsion vs. Sheen is `NOT_AVAILABLE_FROM_METADATA` as these datasets annotate monolithic oil masks (`Class 6: Oil` in MADOS and `(255, 0, 124)` in KERF). LADOS provides explicit sub-category annotations for Emulsion, Sheen, and Ship.

### 5.2 Target Class Mapping Strategy
For binary oil segmentation fine-tuning:
- **Foreground (1):** `Oil` (thick slick), `Emulsion` (weathered mousse), `Sheen` (thin rainbow slick).
- **Background (0):** `Ship` (vessel hull - critical hard negative), `Oil-platform` (offshore rig), `Wake/Look-alikes` (biogenic/turbulent foam), `Clean Water` (open ocean).

---

## 6. Preprocessing & Augmentation Strategy

### 6.1 Preprocessing Pipeline
Based on Phase 4 evidence, direct isotropic squashing degrades lateral slick continuity on high-aspect images. The training pipeline enforces:
1. **Aspect-Preserving Letterbox:** Scale longest image side to target resolution ($256\times 256$ for ResNet-18, $512\times 512$ for ResNet-34) and pad remaining dimension symmetrically with zeros.
2. **Mask Resampling:** `Nearest-neighbor` interpolation to prevent label bleeding.
3. **Normalization:** ImageNet mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`.

### 6.2 Augmentation Specification
Augmentations are designed specifically for marine optical remote sensing:
- **Horizontal Flip:** $p = 0.5$ (Physically invariant across sea surfaces).
- **Vertical Flip:** $p = 0.3$ (Invariant for aerial/satellite nadir perspectives).
- **Random Rotation:** $p = 0.4$, range $\pm 15^\circ$ with reflection border padding.
- **Color Jitter:** $p = 0.4$ (Brightness $\pm 15\%$, Contrast $\pm 15\%$, Saturation $\pm 10\%$) to simulate variable sun elevation, sea state, and atmospheric haze.
- **Mild Gaussian Blur:** $p = 0.2$, $\sigma \in [0.1, 1.0]$ to simulate atmospheric modulation.
- **Excluded Augmentations:** Aggressive cropping, hue shifting (destroys spectral water signatures), and synthetic noise injection.

---

## 7. Baseline Reference & Success Criteria

### 7.1 Phase 4 Baseline Reference Values (Measured)

| Evaluation Group | Metric | Baseline V2 (Legacy) | Baseline V2 (Aspect) | External ResNet-34 | External SegFormer |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **KERF Drone Aerial** (471 samples) | **IoU** | 0.8588 | 0.8232 | 0.8151 | 0.2279 |
| | **Dice / F1** | 0.9071 | 0.8848 | 0.8781 | 0.3153 |
| | **Precision** | 0.9262 | 0.8839 | 0.8361 | 0.3821 |
| | **Recall** | 0.9021 | 0.9067 | **0.9609** | 0.3493 |
| **MADOS Satellite** (361 samples) | **IoU** | 0.1786 | 0.1782 | 0.0220 | 0.0074 |
| | **Dice / F1** | 0.2777 | 0.2772 | 0.0395 | 0.0144 |
| | **Recall** | 0.6709 | 0.6704 | **0.7640** | 0.6400 |
| **Representative Failure** ($612\times 259$) | **Oil %** | 9.66% | 21.32% | 46.58% | 93.15% |
| | **Components** | 1 (collapsed) | 1 (continuous) | 3 (balanced) | Oversegmented |
| **Runtime / Resource (RTX 5050)** | **Inference** | 15.24 ms | **14.50 ms** | 17.56 ms | 29.89 ms |
| | **Peak VRAM** | 140 MB | **97.46 MB** | 139 MB | 199 MB |

### 7.2 Fine-Tuning Success Criteria
1. **KERF Maintenance:** Maintain $\ge 0.8500$ IoU and $\ge 0.9000$ Recall without catastrophic forgetting.
2. **MADOS Satellite Adaptation:** Improve satellite IoU from baseline $0.1786$ to $\ge 0.3500$ with reduced false alarms on open ocean look-alikes.
3. **Vessel-Associated Robustness:** Clean separation of ship hull from oil slick on the representative failure image ($612\times 259$) without collapsing diffuse trailing plumes.

---

## 8. Proposed Experiment Configurations

Two experiment configurations have been created in `ml/training/configs/`:

### Experiment A: V2 Domain Adaptation
- **Configuration File:** [`finetune_v2_config.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/configs/finetune_v2_config.json)
- **Base Architecture:** `optical-oil-seg-unet-resnet18-v2` (15.90M params, SHA-256 verified)
- **Objective:** Domain adaptation of the proven production architecture to multi-sensor data using aspect-preserving letterbox, combo BCE+Dice loss, and class-weighted hard negative sampling.

### Experiment B: External ResNet-34 U-Net Fine-Tuning
- **Configuration File:** [`finetune_external_config.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/configs/finetune_external_config.json)
- **Base Architecture:** `unet_resnet34_oil` (24.46M params, SHA-256 verified)
- **Evidence-Based Rationale:**
  1. Achieved the highest recall across all evaluated models on drone imagery (Recall = 0.9609).
  2. Highest recall on satellite imagery (Recall = 0.7640).
  3. Clean inference efficiency (17.56 ms inference, 139 MB peak VRAM on RTX 5050).
  4. Demonstrated balanced oil boundary extraction on the representative failure image without catastrophic wave oversegmentation.

### Proposed Experiment Matrix (DO NOT RUN YET)

| Exp ID | Base Model | Training Data Sources | Resolution | Loss Function | Purpose |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **EXP-A1** | Baseline V2 (ResNet-18) | LADOS + MADOS Train | $256\times 256$ | BCE + Dice (0.5/0.5) | Satellite & Aerial domain adaptation |
| **EXP-A2** | Baseline V2 (ResNet-18) | Multi-Sensor Balanced Pool | $256\times 256$ | Focal Tversky Loss | Thin filament & vessel discharge focus |
| **EXP-B1** | External ResNet-34 | Multi-Sensor Balanced Pool | $512\times 512$ | Soft Dice + Focal Loss | High-resolution multi-scale feature fine-tuning |

---

## 9. Final Verification Summary
- **Python Test Suite:** All 331 unit & integration tests passing.
- **Node Test Suite:** All 135 unit & service tests passing.
- **Frontend Web App:** Vite production build verified with zero errors.
- **Readiness:** Dataset audit, manifest creation, and configuration files are fully prepared. System is waiting for user review.
