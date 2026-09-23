# PART 0.3 — MODEL REGISTRY + REAL EVALUATION HARNESS REPORT

**Project**: Ocean Guard AI / SIH 26143  
**Repository**: `oil-spill-attribution`  
**Date**: 2026-09-19  
**Execution Host**: Windows 11 Pro / Python 3.11.9 / NVIDIA GeForce RTX 5050 Laptop GPU (Blackwell `sm_120`, CUDA 12.8)  

---

## 1. OVERALL STATUS
**`COMPLETE`**  
*(Model registry audited, physical checkpoint load and SHA-256 integrity verified, REAL_CHECKPOINT_ONLY evaluation harness established with Part 0.1 metrics, dataset availability and split isolation verified, and test suite expanded to 80/80 passing tests with 0 regressions).*

---

## 2. REGISTRY AUDIT SUMMARY
- **Registry Schema Location**: [`ml/model_registry/registry.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/model_registry/registry.json)
- **Active Baseline Model**: `unet-dual-pol-sar-v2`
- **Total Models in Registry Metadata**: 5 declared models
- **Total Physical `.pth` Checkpoints Found**: 5 physical checkpoint files
- **Machine-Readable Audit Artifact**: [`ml/experiments/results/model_registry_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/model_registry_audit.json)

---

## 3. MODEL VERSIONS DISCOVERED

| Version Key | Model ID | Registry Status | Architecture | In / Out Channels | Base Channels | Physical File |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **V1 (Single-Pol)** | `unet-sar-oil-spill-v1` | `untrained` | UNet | 1 / 2 | 32 | *None (Absent on disk)* |
| **V1 (Dual-Pol)** | `unet-dual-pol-sar-v1` | `trained` | UNet | 2 / 2 | 16 | `unet_dual_pol_sar_v1.pth` |
| **V2 (Baseline)** | `unet-dual-pol-sar-v2` | `trained` (`ACTIVE_BASELINE`) | UNet | 2 / 2 | 16 | `unet_dual_pol_sar_v2.pth` |
| **V3 (Oversampled)** | `unet-dual-pol-sar-v3` | `trained` | UNet | 2 / 2 | 16 | `unet_dual_pol_sar_v3.pth` |
| **V4 (Corrected dB)** | `unet-dual-pol-sar-v4` | `experimental` | UNet | 2 / 2 | 16 | `unet_dual_pol_sar_v4.pth` |
| **V5A (Experimental)** | `unet-dual-pol-sar-v5a` | `UNREGISTERED_CHECKPOINT` | UNet | 2 / 2 | 16 | `unet_dual_pol_sar_v5a.pth` |

---

## 4. CHECKPOINTS PHYSICALLY PRESENT
All physical checkpoint files reside in `ml/model_registry/versions/`:
1. `unet_dual_pol_sar_v1.pth` (13,066,111 bytes)
2. `unet_dual_pol_sar_v2.pth` (13,066,175 bytes)
3. `unet_dual_pol_sar_v3.pth` (13,066,239 bytes)
4. `unet_dual_pol_sar_v4.pth` (4,367,239 bytes)
5. `unet_dual_pol_sar_v5a.pth` (4,367,355 bytes)

---

## 5. CHECKPOINT LOAD RESULTS

| Model ID | CPU State-Dict Load | CUDA Load & Forward ($1\times 2\times 512\times 512$) | Keys Verification | Status |
| :--- | :---: | :---: | :---: | :---: |
| `unet-sar-oil-spill-v1` | N/A (File missing) | N/A (Skipped) | N/A | **`CHECKPOINT_NOT_FOUND`** |
| `unet-dual-pol-sar-v1` | **PASSED** | **PASSED** (Output: `(1, 2, 512, 512)`) | 0 Missing / 0 Unexpected | **`LOAD_PASSED`** |
| `unet-dual-pol-sar-v2` | **PASSED** | **PASSED** (Output: `(1, 2, 512, 512)`) | 0 Missing / 0 Unexpected | **`LOAD_PASSED`** |
| `unet-dual-pol-sar-v3` | **PASSED** | **PASSED** (Output: `(1, 2, 512, 512)`) | 0 Missing / 0 Unexpected | **`LOAD_PASSED`** |
| `unet-dual-pol-sar-v4` | **PASSED** | **PASSED** (Output: `(1, 2, 512, 512)`) | 0 Missing / 0 Unexpected | **`LOAD_PASSED`** |
| `unet-dual-pol-sar-v5a` | **PASSED** | **PASSED** (Output: `(1, 2, 512, 512)`) | 0 Missing / 0 Unexpected | **`LOAD_PASSED`** |

---

## 6. SHA-256 HASHES (INTEGRITY MATRIX)

```json
{
  "unet_dual_pol_sar_v1.pth": "801f37034f9a0bc64827dee59da661350090924525e985ca8c6035716a1eb593",
  "unet_dual_pol_sar_v2.pth": "905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd",
  "unet_dual_pol_sar_v3.pth": "41258458dfd911de1734e1b763b9ee64a91d8485039fabb338ae5d618726686e",
  "unet_dual_pol_sar_v4.pth": "c1395f1deae819b222f9e1034472d18a84f502fd89d4076981d3291f4af4fd63",
  "unet_dual_pol_sar_v5a.pth": "07267fd52382113417643b845ed54bdb4fd53521affd4756969e3b085ad9b067"
}
```

---

## 7. ARCHITECTURE COMPATIBILITY
- All dual-pol models (V1, V2, V3, V4, V5A) utilize the modular [`app.models.unet.architecture.UNet`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/app/models/unet/architecture.py) with:
  - `in_channels=2` (Dual-polarization SAR)
  - `num_classes=2` (Binary segmentation: Clean Sea vs Slick)
  - `base_channels=16`
  - `bilinear=True`
- Weight dictionaries correspond exactly to double-conv encoder/decoder blocks without structural alterations.

---

## 8. PREPROCESSING CONTRACT

The harness enforces strict, explicit preprocessing contracts without silent defaults:

1. **V4 / V5A (Corrected Decibel Normalization Lineage)**:
   - **Name**: `Decibel_Calibrated_Clipping`
   - **VV Range**: $[-35.0\text{ dB}, -5.0\text{ dB}] \to [0.0, 1.0]$
   - **VH Range**: $[-45.0\text{ dB}, -15.0\text{ dB}] \to [0.0, 1.0]$
   - **Formula**: $\text{clip}\left(\frac{\text{val}_{\text{dB}} - \text{min}_{\text{dB}}}{\text{max}_{\text{dB}} - \text{min}_{\text{dB}}}, 0, 1\right)$
   - **Invalid/NaN Handling**: Replaced with 0.0.

2. **V1 / V2 / V3 (Historical Uncorrected Positive-Mask Lineage)**:
   - **Name**: `Historical_Uncorrected_Positive_Mask`
   - **Formula**: $\text{arr} \times (\text{arr} > 0)$
   - **Behavior**: Truncates negative dB backscatter to zero; preserved strictly for reproducibility of historical baselines.

---

## 9. REAL EVALUATOR STATUS
- **Module**: [`ml/evaluation/real_evaluator.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/evaluation/real_evaluator.py)
- **Engine Class**: `RealEvaluator`
- **Enforcement Level**: `REAL_CHECKPOINT_ONLY`
  - Untrained models (`unet-sar-oil-spill-v1`) or missing checkpoints raise `RealCheckpointRequiredError`.
  - Heuristic prediction fallbacks (such as $p = 1 - \frac{\text{tile}}{0.35}$) are strictly prohibited.
  - Random weight initialization is prohibited.

---

## 10. METRICS IMPLEMENTATION USED
The evaluation harness directly imports and executes the authoritative Part 0.1 implementations:
- [`ml/evaluation/metrics.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/evaluation/metrics.py): `compute_iou`, `compute_precision`, `compute_recall`, `compute_fpr`, `compute_f1`
- [`ml/evaluation/segmentation_metrics.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/evaluation/segmentation_metrics.py): `dice_coefficient`, `compute_dice`
- [`ml/evaluation/confusion_matrix.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/evaluation/confusion_matrix.py): `generate_confusion_matrix`, `calculate_confusion_metrics`

---

## 11. CLEAN-OCEAN FPR HANDLING
- For scenes labeled as pure clean sea (`category` in `no_oil`, `clean_ocean`), the evaluator computes:
  $$\text{FPR}_{\text{clean}} = \frac{\text{FP}}{\text{FP} + \text{TN}}$$
- Evaluated and reported independently from the overall multi-scene FPR.
- If scene metadata does not distinguish clean sea subcategories, it reports `"CLASS_SEPARATION_NOT_AVAILABLE"` rather than guessing.

---

## 12. LOOK-ALIKE FPR HANDLING
- For scenes labeled as low-wind / biogenic look-alikes (`category` in `lookalike`, `look_alike`), the evaluator computes:
  $$\text{FPR}_{\text{lookalike}} = \frac{\text{FP}}{\text{FP} + \text{TN}}$$
- Isolates dark formation false alarms from ambient open water noise.

---

## 13. THRESHOLD HANDLING
- Supports configurable segmentation threshold sweeps (e.g., $\tau \in [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]$).
- Computes complete confusion matrices and derived metrics for each individual threshold without hardcoding an arbitrary "winner" threshold.

---

## 14. DATASET AVAILABILITY
- **Full Zenodo Benchmark** (3,020 scenes): **NOT_AVAILABLE_LOCALLY** (as planned; no multi-GB download during audit).
- **Expanded Verified Real Subset**: **AVAILABLE** (40 verified Sentinel-1 SAR scenes located in `data/raw/satellite/real/` paired with `data/raw/satellite/dataset_manifest.json`).
- **Absence Handling**: When a requested dataset path or scene files are missing, the evaluator returns `DATASET_NOT_AVAILABLE` with null metric entries, preventing fabricated evaluations.

---

## 15. DATA LEAKAGE VERIFICATION STATUS
- **Status**: **`LEAKAGE_STATUS: VERIFIED_DISJOINT_SCENE_LEVEL_SPLITS`**
- Verified that splits in `dataset_manifest.json` and `splits.json` partition by `scene_id` rather than random tile mixing. No scene appears in multiple splits simultaneously.

---

## 16. TESTS EXECUTED AND EXACT COUNTS
- **Unit Tests (`services/ml-python/tests/unit`)**: **77 / 77 PASSED** (0 failed, 0 skipped)
  - Added [`test_real_evaluator.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/tests/unit/test_real_evaluator.py) (9 comprehensive test suites for registry audit, checkpoint loading, Part 0.1 metric integration, FPR separation, threshold sweeps, and dataset missing safety).
- **Integration Tests (`services/ml-python/tests/integration`)**: **3 / 3 PASSED** (0 failed, 0 skipped)
- **Total Test Suite**: **80 / 80 PASSED (100% PASS RATE)**.

---

## 17. FILES CREATED/MODIFIED
- **Created**:
  - [`scripts/audit_model_checkpoints.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/scripts/audit_model_checkpoints.py)
  - [`ml/evaluation/real_evaluator.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/evaluation/real_evaluator.py)
  - [`ml/experiments/results/evaluation_report.schema.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/evaluation_report.schema.json)
  - [`ml/experiments/results/model_registry_audit.json`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/experiments/results/model_registry_audit.json)
  - [`services/ml-python/tests/unit/test_real_evaluator.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/tests/unit/test_real_evaluator.py)
  - [`docs/model/PART_0_3_MODEL_REGISTRY_EVALUATION_REPORT.md`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/docs/model/PART_0_3_MODEL_REGISTRY_EVALUATION_REPORT.md)
- **Updated**:
  - [`ml/evaluation/__init__.py`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/evaluation/__init__.py) (Exported `RealEvaluator`, `RealCheckpointRequiredError`, `DatasetNotFoundError`)
  - [`services/ml-python/pyproject.toml`](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/services/ml-python/pyproject.toml) (Configured `pythonpath = [".", "../.."]`)

---

## 18. HISTORICAL FILES PRESERVED
- Historical benchmark reports (`docs/model/v2-v3-v4-final-comparison.md`, `ml/experiments/results/v1_threshold_analysis.json`, `v2_training_metrics.json`, `v3_threshold_analysis.json`, `training_metrics.json`) remain strictly untouched.
- `unet-dual-pol-sar-v2` remains the designated `ACTIVE_BASELINE`.
- `unet-dual-pol-sar-v4` remains designated as `EXPERIMENTAL`.

---

## 19. CUDA REGRESSION CHECK
- Verified PyTorch CUDA 12.8 on RTX 5050 Laptop GPU (`cuda:0`, Blackwell `sm_120`, compute capability 12.0).
- Forward passes executed on CUDA during checkpoint load audit without errors.

---

## 20. WHAT IS READY
- Centralized model registry and audit tools.
- `REAL_CHECKPOINT_ONLY` evaluation harness enforcing Part 0.1 metrics.
- Multi-threshold sweep capability with explicit clean-ocean and look-alike FPR separation.
- Checkpoint integrity hashing (SHA-256) and schema-compliant JSON evaluation outputs.
- Fully operational test suite with 80 passing tests.

---

## 21. WHAT IS NOT READY
- Full multi-gigabyte Zenodo benchmark dataset evaluation (pending real dataset download/mount).
- New model training (out of scope for Part 0.3).
- Model promotion to production (V2 remains baseline; V4 remains experimental).

---

## 22. EXACT NEXT STEP
**`PART 0.4 — DATASET HARNESS + SPLIT VALIDATION`**
