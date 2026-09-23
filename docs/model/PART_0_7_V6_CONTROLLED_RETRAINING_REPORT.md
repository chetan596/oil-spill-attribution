# PART 0.7 — CORRECTED PREPROCESSING + CONTROLLED RETRAINING EXPERIMENT (V6) REPORT
**Project:** Ocean Guard AI / SIH 26143  
**Repository:** `oil-spill-attribution`  
**Date:** 2026-09-19  
**Model Name:** `unet-dual-pol-sar-v6` (V6)  
**Status:** `EXPERIMENTAL` (Never `ACTIVE_BASELINE`)  

---

## 1. Overall Status

| Attribute | State | Notes |
|:---|:---|:---|
| **Phase Status** | **COMPLETE** | Part 0.7 experiment executed and audited |
| **Model Version** | **V6 (`unet-dual-pol-sar-v6`)** | Experimental retraining lineage |
| **Model Status** | `EXPERIMENTAL` | `unet-dual-pol-sar-v2` remains `ACTIVE_BASELINE` |
| **Historical Baselines** | **FROZEN & IMMUTABLE** | V2 and V4 checkpoints/reports unmodified |
| **Held-Out Test Set** | **STRICTLY LOCKED & QUARANTINED** | 5 Part III scenes (00060, 00062, 00063, 00064, 00080) never opened |
| **Test Suite** | **119 / 119 PASS** | 100% test pass rate across unit and integration tests |

---

## 2. Experiment Objective

This experiment was designed to answer the scientific question:
> *"Does retraining the same standard U-Net architecture using physically correct normalized VV/VH decibel inputs (`sentinel1_sigma0_db_v1`) and explicit multi-scene training (including oil, clean-ocean, and look-alikes) improve baseline behavior over the historical V2 and V4 models?"*

---

## 3. Frozen Baseline References

Before training V6, all historical baselines and hardware environments were recorded and frozen in [`ml/experiments/results/v6_training/experiment_baseline_snapshot.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/v6_training/experiment_baseline_snapshot.json):

- **V2 Checkpoint SHA-256:** `905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd`
- **V4 Checkpoint SHA-256:** `c1395f1deae819b222f9e1034472d18a84f502fd89d4076981d3291f4af4fd63`
- **Dataset Manifest SHA-256 (`ml/datasets/manifest.json`):** `661fc8a3857b10fa096dfc3b281fdf24f603c7333dd5a9e33fb7ce2a7f502c3b`
- **Compute Stack:** NVIDIA GeForce RTX 5050 Laptop GPU (sm_120 Blackwell, 8150 MiB VRAM), PyTorch 2.11.0+cu128, CUDA 12.8, cuDNN enabled.

---

## 4. Dataset Composition & Class Distribution

The verified 40-scene Sentinel-1 SAR dataset (all $2048 \times 2048$ dual-pol GeoTIFFs) comprises:

- **Total Scenes:** 40
  - **Oil Scenes:** 15 scenes (10 Train, 2 Val, 3 Test)
  - **Clean Ocean Scenes:** 14 scenes (10 Train, 3 Val, 1 Test)
  - **Look-Alike Scenes:** 11 scenes (8 Train, 2 Val, 1 Test)
- **Training Scenes (28):** 10 Oil, 10 Clean Ocean, 8 Look-Alike
- **Validation Scenes (7):** 2 Oil, 3 Clean Ocean, 2 Look-Alike
- **Held-Out Test Scenes (5):** 3 Oil, 1 Clean Ocean, 1 Look-Alike (STRICTLY LOCKED)

### Class Imbalance Analysis (Training Split — 28 Scenes)
- **Total Training Pixels:** $28 \times 2048 \times 2048 = 117,440,512$ pixels
- **Positive (Oil Spill) Pixels:** $929,910$ pixels ($0.792\%$)
- **Background (Sea / Look-alike) Pixels:** $116,510,602$ pixels ($99.208\%$)
- **Pixel Imbalance Ratio:** ~1 : 125.3

---

## 5. Preprocessing Contract (`sentinel1_sigma0_db_v1`)

V6 adheres strictly to the versioned calibration transform:

$$\text{normalized} = \text{clip}\left(\frac{x - \text{min\_db}}{\text{max\_db} - \text{min\_db}}, 0.0, 1.0\right)$$

- **VV Band (Channel 0):** Range $[-35.0\text{ dB}, -5.0\text{ dB}] \to [0.0, 1.0]$
- **VH Band (Channel 1):** Range $[-45.0\text{ dB}, -15.0\text{ dB}] \to [0.0, 1.0]$
- **Invalid / Non-finite Values (NaN, $\pm\infty$):** Explicitly clamped/masked to $0.0$.
- **Source Files:** Raw GeoTIFFs were NOT modified or overwritten on disk.

---

## 6. Tile Strategy & Sampling Policy

- **Tile Dimensions:** $512 \times 512$ pixels, 2 channels (VV, VH)
- **Grid Layout:** 16 non-overlapping tiles per scene ($4 \times 4$ regular grid covering full $2048 \times 2048$ extent).
- **Total Training Tiles:** 448 tiles ($28 \times 16$)
  - **Oil-Positive Tiles:** 74 tiles (16.5%)
  - **Clean Ocean Tiles:** 160 tiles (35.7%)
  - **Look-Alike Tiles:** 128 tiles (28.6%)
  - **Empty-Mask Background Tiles from Oil Scenes:** 86 tiles (19.2%)
- **Sampling Policy:** Deterministic epoch iteration across all 448 tiles preserving hard negative look-alike coverage without discarding difficult ocean backscatter regions.

---

## 7. Model Architecture & Loss Function

- **Architecture:** `app.models.unet.architecture.UNet`
  - `in_channels = 2` (VV, VH)
  - `num_classes = 2` (Background, Oil Spill)
  - `base_channels = 16`
  - `bilinear = True`
  - Total Parameters: 3,267,074 (~13.1 MB)
- **Loss Function:** `CombinedLoss` (Weighted Cross-Entropy + Soft Dice Loss)
  - Cross-Entropy foreground weight: $5.0$ (addressing the 1:125 background dominance)
  - Loss weights: $1.0 \times \mathcal{L}_{\text{CE}} + 1.0 \times \mathcal{L}_{\text{SoftDice}}$

---

## 8. Training Configuration & Reproducibility

- **Hardware:** NVIDIA GeForce RTX 5050 Laptop GPU (`cuda:0`)
- **Batch Size:** 2 (due to 512x512 tile input)
- **Automatic Mixed Precision (AMP):** FP16 with PyTorch `GradScaler`
- **Optimizer:** `AdamW` (learning rate $= 1\times 10^{-4}$, weight decay $= 1\times 10^{-4}$)
- **Deterministic Seed:** `seed = 42` (Python `random`, `numpy`, PyTorch CPU & CUDA initialized)
- **Training Budget:** Max 30 epochs with Early Stopping (patience = 7 epochs on validation Dice).

---

## 9. Training History & Convergence

Training completed after 23 epochs via early stopping when validation Dice peaked at epoch 16.

| Epoch | Train Loss | Val Loss | Val Dice | Val IoU | Val Recall | Val FPR | Duration | Peak VRAM |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 01 | 1.3446 | 1.3233 | 0.0395 | 0.0201 | 0.3088 | 0.076315 | 13.3s | 1794 MiB |
| 04 | 1.1273 | 1.2496 | 0.0480 | 0.0246 | 0.4028 | 0.081885 | 11.6s | 1856 MiB |
| 08 | 1.0206 | 1.8760 | 0.0414 | 0.0211 | 0.8130 | 0.199411 | 11.9s | 1856 MiB |
| 11 | 0.9716 | 1.4253 | 0.0481 | 0.0246 | 0.6947 | 0.144778 | 11.7s | 1856 MiB |
| 13 | 0.9361 | 1.0693 | 0.0873 | 0.0457 | 0.2000 | 0.017991 | 11.7s | 1856 MiB |
| 15 | 0.9303 | 1.1146 | 0.0664 | 0.0344 | 0.4354 | 0.062094 | 11.5s | 1856 MiB |
| **16 (Best)** | **0.9116** | **1.0807** | **0.0979** | **0.0515** | **0.5016** | **0.046517** | **11.7s** | **1856 MiB** |
| 18 | 0.9027 | 1.0690 | 0.0749 | 0.0389 | 0.5307 | 0.067219 | 11.6s | 1856 MiB |
| 23 | 0.9002 | 2.0137 | 0.0423 | 0.0216 | 0.8869 | 0.213065 | 11.9s | 1856 MiB |

- **Early Stopping:** Triggered at Epoch 23 (7 epochs past best epoch 16).
- **Total Training Time:** 272.8 seconds (~4.5 minutes).
- **Diagnostic Curves:** Saved to [`ml/experiments/results/v6_training/plots/v6_training_curves.svg`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/v6_training/plots/v6_training_curves.svg).

---

## 10. Validation Evaluation (7-Scene Real Validation Split)

Evaluated using `real_evaluator.py` and Part 0.1 standardized metrics across 6 thresholds:

### Micro-Pixel Aggregate Metrics Across Thresholds
| Threshold | Micro IoU | Micro Dice / F1 | Micro Precision | Micro Recall | Overall FPR | Clean-Ocean FPR | Look-Alike FPR | Oil Scenes IoU |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **0.30** | 0.042860 | 0.082198 | 0.044395 | 0.553532 | 0.063396 | 0.000401 | 0.215739 | 0.443962 |
| **0.35** | 0.045312 | 0.086695 | 0.047100 | 0.544136 | 0.058575 | 0.000238 | 0.200203 | 0.457918 |
| **0.40** | 0.047575 | 0.090828 | 0.049640 | 0.533447 | 0.054341 | 0.000122 | 0.186308 | 0.464366 |
| **0.45** | 0.049831 | 0.094931 | 0.052207 | 0.522578 | 0.050479 | 0.000056 | 0.173474 | 0.466830 |
| **0.50** | **0.052088** | **0.099018** | **0.054818** | **0.511252** | **0.046904** | **0.000023** | **0.161488** | **0.466344** |
| **0.60** | 0.057059 | 0.107958 | 0.060782 | 0.482293 | 0.039654 | 0.000003 | 0.136843 | 0.452769 |

### Per-Scene Validation Breakdown at Threshold 0.50
1. `real_part1_oil_00006` (Oil, 89,378 GT px): IoU = 0.658248, Precision = 0.817344, Recall = 0.771901, FP = 15,417
2. `real_part2_oil_00032` (Oil, 66,015 GT px): IoU = 0.198305, Precision = 0.205739, Recall = 0.672029, FP = 171,688
3. `real_part1_clean_00003` (Clean Ocean, 0 GT px): FPR = 0.000010 (41 FP pixels / 4.19M pixels)
4. `real_part1_clean_00007` (Clean Ocean, 0 GT px): FPR = 0.000004 (15 FP pixels / 4.19M pixels)
5. `real_part2_clean_00028` (Clean Ocean, 0 GT px): FPR = 0.000056 (237 FP pixels / 4.19M pixels)
6. `real_part1_lookalike_00010` (Look-Alike, 0 GT px): FPR = 0.004111 (17,243 FP pixels / 4.19M pixels)
7. `real_part2_lookalike_00025` (Look-Alike, 0 GT px): FPR = 0.318866 (1,337,422 FP pixels / 4.19M pixels)

---

## 11. Descriptive Side-by-Side Comparison (Validation Split at Threshold 0.50)

*Note: In accordance with scientific reporting standards, results are presented purely descriptively without ranking or superiority assertions.*

| Metric | V2 (Historical Baseline) | V4 (Historical Decibel) | V6 (Controlled Retrained) |
|:---|:---:|:---:|:---:|
| **Status** | `ACTIVE_BASELINE` | `EXPERIMENTAL` | `EXPERIMENTAL` |
| **Preprocessing Contract** | `arr * (arr > 0)` (destructive) | `[-35,-5] / [-45,-15]` dB | `sentinel1_sigma0_db_v1` |
| **Training Scenes** | 20 Zenodo scenes | 28 Real Sentinel-1 scenes | 28 Real Sentinel-1 scenes |
| **Loss** | Weighted CE + SoftDice | Focal Tversky ($\alpha=0.3,\beta=0.7$) | Combined Weighted CE + SoftDice |
| **Micro IoU** | 0.000000 | 0.019925 | **0.052088** |
| **Micro Dice / F1** | 0.000000 | 0.039072 | **0.099018** |
| **Micro Precision** | 0.000000 | 0.019942 | **0.054818** |
| **Micro Recall** | 0.000000 | 0.960674 | **0.511252** |
| **Overall FPR** | 0.000043 | 0.251215 | **0.046904** |
| **Clean-Ocean FPR** | 0.000000 | 0.002460 | **0.000023** ($0.0023\%$) |
| **Look-Alike FPR** | 0.000125 | 0.865243 | **0.161488** ($16.15\%$) |
| **Oil Scenes IoU** | 0.000000 | 0.046757 | **0.466344** ($46.63\%$) |

---

## 12. Checkpoint Hashes & Artifact Integrity

| Checkpoint | File Path | Size (Bytes) | SHA-256 Checksum |
|:---|:---|:---|:---|
| **V6 Best (Epoch 16)** | `ml/model_registry/versions/unet_dual_pol_sar_v6.pth` | 13,069,567 | `bcf3d6bc988b910fa67c0c31c89cb2c861da73f0b02159c579cb28e5039920e3` |
| **V6 Last (Epoch 23)** | `ml/model_registry/versions/unet_dual_pol_sar_v6_last.pth` | 13,069,451 | `a652a926b68a64931a7c5b61b369527f54cff0ff5a0c3bb084fc139962a2bb53` |
| **V2 Frozen Baseline** | `ml/model_registry/versions/unet_dual_pol_sar_v2.pth` | 13,071,787 | `905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd` |
| **V4 Experimental** | `ml/model_registry/versions/unet_dual_pol_sar_v4.pth` | 13,071,787 | `c1395f1deae819b222f9e1034472d18a84f502fd89d4076981d3291f4af4fd63` |

---

## 13. Held-Out Test Set Quarantine Confirmation

The 5 Part III held-out test scenes:
- `real_part3_test_00060` (Oil)
- `real_part3_test_00062` (Oil)
- `real_part3_test_00063` (Oil)
- `real_part3_test_00064` (Clean Ocean)
- `real_part3_test_00080` (Look-Alike)

**CONFIRMATION:** The Part III test split remained **STRICTLY LOCKED** throughout Part 0.7. Zero training tiles, zero validation inferences, and zero threshold decisions were computed using these scenes.

---

## 14. Limitations & Analytical Findings

1. **Look-Alike Disambiguation:** While V6 reduced look-alike FPR from $86.5\%$ (V4) down to $16.1\%$, natural low-backscatter oceanic features (e.g. `real_part2_lookalike_00025` with low wind / biogenic slicks) still generate false alarms.
2. **Foreground Sensitivity vs Precision Tradeoff:** At threshold 0.50, V6 achieves a balanced recall ($51.1\%$) and oil-scene IoU ($46.6\%$), but macro ocean-wide false positives still suppress overall micro precision ($5.5\%$) due to extreme negative background pixel dominance ($27.8\text{M}$ negative pixels vs $155\text{K}$ positive pixels in validation).
3. **Multi-Modal Context Need:** Pure 2-channel C-Band SAR backscatter alone cannot fully resolve thermal or dark-slick ambiguities without auxiliary metocean/wind or multi-temporal cues.

---

## 15. What Is Ready vs Not Ready

### What Is Ready:
- Standardized, tested preprocessing contract `sentinel1_sigma0_db_v1` implemented and integrated.
- V6 training code, loss implementation, and reproducible training pipeline.
- Validation evaluation artifacts and training diagnostic curves.
- Model registry updated with V6 labeled strictly as `EXPERIMENTAL`.
- Complete test suite passing: **119/119 tests PASS**.

### What Is Not Ready:
- V6 is **not** promoted to `ACTIVE_BASELINE` (remains experimental pending further architectural/loss experiments and subsequent quarantined evaluation).
- Held-out Part III test set is **not** evaluated in this phase.

---

## 16. EXACT NEXT STEP

**PART 0.7 IS COMPLETE.**  
The immediate next step is:
> **PART 0.8 — ADVANCED LOSS & ARCHITECTURE EXPERIMENTS OR QUARANTINED BENCHMARK EVALUATION.**  
> *Awaiting user direction before touching quarantined test scenes or proceeding to the next phase.*
