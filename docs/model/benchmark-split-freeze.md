# Official Benchmark Split Freeze & Protocol Specification

**Status**: FROZEN & AUTHORITATIVE  
**Date of Freeze**: 2026-09-14  
**Corpus**: Sentinel-1 SAR Oil Spill Dataset (Zenodo Repositories)  
**DOIs**: `10.5281/zenodo.8346860` (Part I), `10.5281/zenodo.8253899` (Part II), `10.5281/zenodo.13761290` (Part III)  
**Total Scenes**: 40 Scenes ($2048 \times 2048$, Dual-Pol C-Band SAR, 10m Resolution, EPSG:4326)

---

## 1. Discrepancy Reconciliation & Test Set Audit

During the V3 root-cause audit and initial V4 reporting, a typographical naming inconsistency was identified in one historical markdown document referring to test scene `00068` instead of `00080`.

### Forensic Audit Verification
An inspection of the physical filesystem and the authoritative dataset manifest (`data/raw/satellite/dataset_manifest.json`) confirmed that:
1. **Scene `00068` does NOT exist** in the Zenodo Part III corpus.
2. The actual 5th held-out test scene is **`00080`** (`real_part3_test_00080`, $128,475$ positive oil pixels).
3. The evaluation scripts consistently evaluated the physical files `00060`, `00062`, `00063`, `00064`, and `00080`.

---

## 2. Official Frozen Held-Out Test Set (Part III)

These **5 scenes** are strictly reserved as the **OFFICIAL HELD-OUT TEST SET**. Under no circumstances may any model weights, hyperparameters, or detection thresholds be tuned or selected using these scenes.

| # | Scene ID | Category | Zenodo Source | Image Path | Mask Path | Dimensions | GT Positive Pixels | GT Area ($\text{km}^2$) |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| 1 | `real_part3_test_00060` | Test (Clean/No-Oil) | Part III (`10.5281/zenodo.13761290`) | `data/raw/satellite/real/part3_test/images/00060.tif` | `data/raw/satellite/real/part3_test/masks/00060.tif` | $2048 \times 2048$ | 0 | 0.0000 |
| 2 | `real_part3_test_00062` | Test (Oil Spill) | Part III (`10.5281/zenodo.13761290`) | `data/raw/satellite/real/part3_test/images/00062.tif` | `data/raw/satellite/real/part3_test/masks/00062.tif` | $2048 \times 2048$ | 24,162 | 1.3801 |
| 3 | `real_part3_test_00063` | Test (Clean/No-Oil) | Part III (`10.5281/zenodo.13761290`) | `data/raw/satellite/real/part3_test/images/00063.tif` | `data/raw/satellite/real/part3_test/masks/00063.tif` | $2048 \times 2048$ | 0 | 0.0000 |
| 4 | `real_part3_test_00064` | Test (Oil Spill) | Part III (`10.5281/zenodo.13761290`) | `data/raw/satellite/real/part3_test/images/00064.tif` | `data/raw/satellite/real/part3_test/masks/00064.tif` | $2048 \times 2048$ | 52,620 | 3.0055 |
| 5 | `real_part3_test_00080` | Test (Oil Spill) | Part III (`10.5281/zenodo.13761290`) | `data/raw/satellite/real/part3_test/images/00080.tif` | `data/raw/satellite/real/part3_test/masks/00080.tif` | $2048 \times 2048$ | 128,475 | 7.3382 |

### Held-Out Aggregate Statistics
- **Total Test Pixels**: $5 \times 2048 \times 2048 = 20,971,520$ pixels
- **Total Ground-Truth Positive Pixels**: $205,257$ pixels ($0.9787\%$ class prevalence)
- **Total Ground-Truth Negative Pixels**: $20,766,263$ pixels ($99.0213\%$ class prevalence)
- **Total Ground-Truth Slick Area**: $11.7238\text{ km}^2$

---

## 3. Validation Set (7 Scenes)

Used exclusively for epoch validation, checkpoint selection, and threshold optimization sweeps ($\tau \in [0.10, 0.50]$):

| # | Scene ID | Category | Zenodo Part | Image Path | Mask Path | GT Positive Pixels |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: |
| 1 | `real_part1_oil_00006` | Oil Spill | Part I (`zenodo.8346860`) | `data/raw/satellite/real/part1_oil/images/00006.tif` | `.../masks/00006.tif` | 89,378 |
| 2 | `real_part1_oil_00011` | Oil Spill | Part I (`zenodo.8346860`) | `data/raw/satellite/real/part1_oil/images/00011.tif` | `.../masks/00011.tif` | 49,967 |
| 3 | `real_part1_oil_00204` | Oil Spill | Part I (`zenodo.8346860`) | `data/raw/satellite/real/part1_oil/images/00204.tif` | `.../masks/00204.tif` | 16,048 |
| 4 | `real_part2_no_oil_00004` | Clean Ocean | Part II (`zenodo.8253899`) | `data/raw/satellite/real/part2_no_oil/images/00004.tif` | `.../masks/00004.tif` | 0 |
| 5 | `real_part2_no_oil_00017` | Clean Ocean | Part II (`zenodo.8253899`) | `data/raw/satellite/real/part2_no_oil/images/00017.tif` | `.../masks/00017.tif` | 0 |
| 6 | `real_part2_lookalike_00004` | Look-Alike | Part II (`zenodo.8253899`) | `data/raw/satellite/real/part2_lookalike/images/00004.tif` | `.../masks/00004.tif` | 0 |
| 7 | `real_part2_lookalike_00090` | Look-Alike | Part II (`zenodo.8253899`) | `data/raw/satellite/real/part2_lookalike/images/00090.tif` | `.../masks/00090.tif` | 0 |

---

## 4. Training Set (28 Scenes)

Used strictly for model parameter optimization via gradient descent:

- **Part I Oil Scenes (12 scenes)**: `00000`, `00002`, `00003`, `00004`, `00007`, `00008`, `00009`, `00010`, `00013`, `00015`, `00017`, `00203`
- **Part II No-Oil Clean Scenes (8 scenes)**: `00000`, `00001`, `00002`, `00003`, `00005`, `00006`, `00007`, `00008`
- **Part II Look-Alike Scenes (8 scenes)**: `00000`, `00001`, `00002`, `00003`, `00005`, `00006`, `00007`, `00008`

> [!IMPORTANT]
> **Scene `real_part1_oil_00000` is strictly a TRAINING SCENE**.
> Metrics on Scene 00000 represent a **training-scene diagnostic** only and must NEVER be reported as generalization capability.

---

## 5. Frozen Evaluation Rules

1. **Deterministic Inference**: Seed must be fixed (`seed=42`) with deterministic PyTorch operations.
2. **Preprocessing Invariance**: Input rasters must be calibrated Sentinel-1 Sigma0 in decibels with finite validity masking (`valid_mask = np.isfinite(arr) & (arr != nodata)`).
3. **Threshold Protocol**: Thresholds must be selected **strictly on the 7 validation scenes** prior to testing. Held-out test scenes must be evaluated exactly once per model version.
4. **Separation of Inference Modes**:
   - **Mode A (Baseline Benchmark)**: $512 \times 512$ non-overlapping tiles ($\text{stride}=512$) for direct historical comparison.
   - **Mode B (Overlapping Inference)**: $512 \times 512$ tiles with $50\%$ overlap ($\text{stride}=256$) and 2D Hann window blending.
