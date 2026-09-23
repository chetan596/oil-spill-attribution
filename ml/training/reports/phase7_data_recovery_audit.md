# Ocean Guard AI — Phase 7: Positive Data Recovery & Balanced Training Dataset Audit Report

**Date**: 2026-09-20  
**Phase**: Phase 7 — Positive Data Recovery & Balanced Training Dataset Audit  
**Status**: COMPLETE  
**Primary Finding**: Mathematical root cause of Phase 5B recall collapse established; 441 genuine optical oil-positive samples and 2,599 hard negatives recovered and audited with zero evaluation leakage.

---

## 1. Executive Summary

Phase 6 evaluation revealed that both fine-tuned models from Phase 5B (`finetuned_v2` and `finetuned_resnet34`) suffered complete positive foreground recall collapse ($\text{IoU} = 0.0000, \text{Recall} = 0.0000$), while achieving $100\%$ precision on negative ocean scenes.

This Phase 7 audit rigorously traced the root cause:
1. In Phase 5A, when creating the non-benchmark training set, the pipeline drew from `segmentation_image_manifest.json` (3,529 samples containing 923 positives).
2. Because the locked Phase 4/6 Benchmark contained **832** of those positives (471 KERF + 361 MADOS) and the Sealed External Test contained **86** positives, subtracting both sets left exactly **5 positives** and **2,562 negatives** ($99.8\%$ negative).
3. The loss functions in Phase 5B correctly converged to the global minimum of the dataset: predicting $0$ everywhere.
4. Through a full audit of all local archives, **441 genuine oil-positive optical drone images** (with verified 1080p pixel ground-truth masks) and **2,599 hard negatives** were recovered from local storage outside the locked benchmark and sealed test.
5. All candidate manifests have been generated at [`ml/training/manifests/phase7_candidate/`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/manifests/phase7_candidate) with cryptographic zero-leakage verification.

---

## 2. Step-by-Step Data Accounting & Phase 5B Filtering Pipeline

| Pipeline Stage | Total Samples | Oil Positive | Oil Negative | Unknown | Description |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **1. Historical Manifest (`segmentation_image_manifest.json`)** | 3,529 | 923 | 2,606 | 0 | Ingested pool (795 KERF, 2,734 MADOS) |
| **2. Phase 4/6 Locked Benchmark Exclusion** | -832 | -832 | 0 | 0 | 471 KERF hard cases + 361 MADOS hard cases (1 rep failure unmasked) |
| **3. Sealed External Test Exclusion** | -130 | -86 | -44 | 0 | 86 KERF test positives + 44 negatives |
| **4. Phase 5A Remaining Available Pool** | **2,567** | **5** | **2,562** | **0** | $99.8\%$ negative imbalance |
| **5. Phase 5A Train Split (`train_manifest.json`)** | 2,053 | 4 | 2,049 | 0 | $0.19\%$ positive representation |
| **6. Phase 5A Val Split (`val_manifest.json`)** | 514 | 1 | 513 | 0 | $0.19\%$ positive representation |
| **7. Phase 7 Full Local Archive Discovery** | 4,002 | 1,359 | 2,643 | 0 | Full 1,268 KERF archive + 2,734 MADOS catalog |
| **8. Phase 7 Recovered Eligible Training Pool** | **3,040** | **441** | **2,599** | **0** | Completely independent of Benchmark & Sealed Test |

---

## 3. Local Dataset Audit

### 3.1 MADOS Sentinel-2 Multi-Spectral Dataset
- **Total Local Scenes Scanned**: 174 scenes (2,803 patches in 10m band).
- **Total Oil-Positive Patches (Class 6)**: 361 patches (234,568 total oil pixels across 61 scenes).
- **Benchmark Overlap**: Exactly **361 of 361** MADOS oil-positive patches are in the Phase 4/6 locked benchmark.
- **Sealed Test Overlap**: 0 samples.
- **Eligible MADOS Oil-Positives**: **0** (all positive MADOS data is quarantined to locked evaluation).
- **Eligible MADOS Oil-Negatives**: **2,373** (654 clean ocean, 1,719 difficult look-alikes).

### 3.2 KERF Drone Aerial RGB Dataset
- **Total Local Images in Full Archive**: 1,268 images (1080p RGB with verified segmentation masks).
- **Total Oil-Positive Images**: 998 images.
- **Total Oil-Negative Images**: 270 images.
- **Benchmark Overlap**: 471 oil-positive images (395 train, 76 val).
- **Sealed Test Overlap**: 130 images (86 oil-positive, 44 oil-negative).
- **Eligible KERF Oil-Positives**: **441 images** (238 train, 87 val, 116 test).
- **Eligible KERF Oil-Negatives**: **226 images** (178 train, 40 val, 8 test).

### 3.3 LADOS Dataset
- **Status on Disk**: Reference manifest specification only ([`lados_hard_cases_manifest.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/data/raw/optical_hard_cases/lados/lados_hard_cases_manifest.json) — 3,388 image specifications, 6,462 instances).
- **Local Images**: 0 local image files present.
- **Annotated Subsets**: Oil = NOT_AVAILABLE locally, Emulsion = NOT_AVAILABLE locally, Sheen = NOT_AVAILABLE locally.

---

## 4. Benchmark & Sealed Test Exclusion Audit

- **Phase 4 / Phase 6 Locked Benchmark Samples**: 833 total (832 unique SHA-256 hashes).
- **Sealed External Test Samples**: 130 total (130 unique SHA-256 hashes).
- **Unique Locked Evaluation Samples**: 963 samples.
- **Unique Eligible Non-Benchmark Training Candidates**: 3,040 samples (441 positive, 2,599 negative).
- **Benchmark Policy**: Strict quarantine enforced. Zero benchmark samples unlocked or moved into training.

---

## 5. Candidate Training Pool Metadata & Statistics

Generated Manifest Files at [`ml/training/manifests/phase7_candidate/`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/manifests/phase7_candidate):
- `positive_candidates.json` (441 verified records)
- `negative_candidates.json` (2,599 verified records)
- `unknown_candidates.json` (0 records)

### 5.1 Positive Category Breakdown (441 Positives)
- `oil`: 441 ($100.0\%$)
- `large_oil` ($>15\%$ coverage): 398 ($90.2\%$)
- `diffuse_oil` ($2\% - 15\%$ coverage): 38 ($8.6\%$)
- `narrow_oil` ($<2\%$ coverage): 5 ($1.1\%$)
- `vessel_associated`: NOT_AVAILABLE (all 280 annotated vessel cases are in locked benchmark)
- `emulsion`: NOT_AVAILABLE
- `sheen`: NOT_AVAILABLE

### 5.2 Pixel-Level Distribution
- **Mean Oil Pixel Fraction**: $0.3771$ ($37.71\%$ foreground coverage)
- **Median Oil Pixel Fraction**: $0.3546$ ($35.46\%$)
- **Min Oil Pixel Fraction**: $0.0013$ ($0.13\%$)
- **Max Oil Pixel Fraction**: $0.9755$ ($97.55\%$)
- **Tiny Masks ($<1\%$ oil)**: 4 samples
- **Small Masks ($1\% - 5\%$ oil)**: 1 sample
- **Medium Masks ($5\% - 15\%$ oil)**: 38 samples
- **Large Masks ($>15\%$ oil)**: 398 samples

### 5.3 Hard Negatives Breakdown (2,599 Negatives)
- `clean_ocean`: 880 samples (654 MADOS + 226 KERF)
- `look_alike` (waves, sun-glint, turbidity, wakes): 1,719 samples (MADOS Sentinel-2)

---

## 6. Cryptographic Leakage Verification

Cross-split hash collision audit comparing candidate hashes against locked evaluation sets:
- $\text{Positive Candidates} \cap \text{Benchmark SHAs} = 0$
- $\text{Positive Candidates} \cap \text{Sealed Test SHAs} = 0$
- $\text{Negative Candidates} \cap \text{Benchmark SHAs} = 0$
- $\text{Negative Candidates} \cap \text{Sealed Test SHAs} = 0$
- $\text{Positive Candidates} \cap \text{Negative Candidates} = 0$
- **Leakage Status**: **ABSOLUTE ZERO LEAKAGE (PASS)**.

---

## 7. Phase 5B Training Failure Analysis

### 7.1 Observed Empirical Evidence
1. `v2_domain_adaptation_pilot`:
   - Epoch 1: Train Loss = 0.6575, Val Loss = 0.6140, Val IoU = 0.0000
   - Epoch 5: Train Loss = 0.5918, Val Loss = 0.5840, Val IoU = 0.0000
2. `resnet34_domain_adaptation_pilot`:
   - Epoch 1: Train Loss = 0.5053, Val Loss = 0.5575, Val IoU = 0.0000
   - Epoch 5: Train Loss = 0.5000, Val Loss = 0.5311, Val IoU = 0.0000
3. **Behavior**: Collapse occurred at **Epoch 1 immediately**, not gradually.

### 7.2 Root Cause Analysis
- **Observed**: The training dataset contained 2,049 negatives and only 4 positives (0.19% positive image ratio).
- **Mechanics**: Because $99.8\%$ of pixel ground truth in the entire training set was $0$ (background), predicting $\hat{y}_{i,j} = 0$ everywhere immediately dropped the combined BCE + Dice loss. Since the validation set was similarly $99.8\%$ negative, predicting zeros produced the minimum validation loss ($0.5840$ / $0.5311$), erroneously marking the zero-prediction model as `best_val_iou.pt`.

---

## 8. Proposed Balanced Training Dataset & Split Strategy

To eliminate zero-prediction collapse without artificial duplicate image copying:

### 8.1 Proposed Train / Validation Partitioning
Deterministic 80/20 partition of recovered candidates:
- **Eligible Positives**:
  - **Train Positives**: **353 samples** ($80.0\%$)
  - **Validation Positives**: **88 samples** ($20.0\%$)
- **Controlled Hard Negatives**:
  - **Train Hard Negatives**: **706 samples** ($1:2$ positive:negative image ratio; 353 clean ocean + 353 look-alikes)
  - **Validation Hard Negatives**: **176 samples** (88 clean ocean + 88 look-alikes)
- **Total Proposed Training Pool**: $353 + 706 = \mathbf{1,059\text{ samples}}$ ($33.3\%$ positive image ratio, $\approx 12.6\%$ positive pixel ratio).
- **Total Proposed Validation Pool**: $88 + 176 = \mathbf{264\text{ samples}}$ ($33.3\%$ positive image ratio).

### 8.2 Balanced Sampling & Loss Strategy
1. **Weighted Batch Sampling**: In each batch of 16 images, guarantee 8 positive images and 8 negative images ($1:1$ batch composition).
2. **Foreground-Aware Loss Formulation**:
   $$\mathcal{L} = \alpha \mathcal{L}_{\text{Focal}}(\gamma=2) + \beta \mathcal{L}_{\text{Dice}}(\text{smooth}=1.0) + \lambda \mathcal{L}_{\text{BCE}}$$
   Dice loss computed exclusively over batches with positive targets, or using a smooth term that penalizes non-zero positive predictions when targets are positive.
3. **Differential Learning Rates**: Freeze lower encoder layers during initial epochs, training the segmentation decoder head ($10^{-3}$) with a smaller backbone rate ($10^{-5}$) to prevent catastrophic forgetting of baseline visual filters.

---

## 9. Proposed Future Experiment Configurations

- **Experiment A (V2 Balanced Fine-Tuning)**: Fine-tune `optical-oil-seg-unet-resnet18-v2` using the 1,059-sample balanced pool with 1:1 batch sampling and differential learning rate.
- **Experiment B (ResNet34 Balanced Fine-Tuning)**: Fine-tune `unet_resnet34_oil` on the same balanced pool to determine if multi-scale satellite/drone domain adaptation succeeds.
- **Experiment C (Weighted Focal-Dice Loss Pilot)**: V2 fine-tuning with dynamic positive-pixel focal reweighting ($\alpha=0.75, \gamma=2.0$) to prevent background dominance.

---

## 10. Governance & Integrity Compliance

- Model Training Conducted in Phase 7: **NONE**
- Fine-Tuning Conducted: **NONE**
- Phase 4 / Phase 6 Benchmark Modified: **NO**
- Production Model Replaced: **NO**
- Sealed External Test Opened: **NO**
