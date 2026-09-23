# Phase 5B — Controlled RGB Fine-Tuning Pilot Report

**Project:** Ocean Guard AI / SIH 26143  
**Timestamp:** 2026-09-20  
**Status:** COMPLETE (Pilot Execution Finished — Awaiting Review)

---

## 1. Executive Summary

Phase 5B executed two controlled fine-tuning pilot experiments on the NVIDIA GeForce RTX 5050 Laptop GPU (7.96 GB VRAM) using the strict non-overlapping dataset manifests established in Phase 5A:
- **Experiment A (V2 Domain Adaptation)**: Fine-tuned `optical-oil-seg-unet-resnet18-v2` (15.90M parameters) at $256\times 256$ letterbox resolution using combination BCE + Soft Dice loss and differential learning rates (encoder: $5\times 10^{-5}$, decoder: $2\times 10^{-4}$). Training loss decreased from **0.6575** to **0.5918**; validation loss decreased from **0.6140** to **0.5840** across 5 epochs (119.7s total).
- **Experiment B (ResNet-34 U-Net Fine-Tuning)**: Fine-tuned `unet_resnet34_oil` (24.44M parameters) at $512\times 512$ letterbox resolution using Soft Dice + Focal Loss. Training loss decreased from **0.5053** to **0.5000**; validation loss decreased from **0.5575** to **0.5311** across 5 epochs (385.2s total).

Both experiments strictly preserved original production checkpoints, honored the benchmark quarantine, and left the sealed test set immutable.

---

## 2. Checkpoint Integrity Verification

Cryptographic SHA-256 hashes of the original production checkpoints were computed before training and re-verified post-training:

| Checkpoint | File Path | Pre-Training SHA-256 | Post-Training SHA-256 | Verification Result |
| :--- | :--- | :--- | :--- | :---: |
| **Original V2 Checkpoint** | `services/ml-python/app/models/optical_oil_segmentation_v2/optical_oil_segmentation_v2.pth` | `e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398` | `e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398` | **PASS (UNTOUCHED)** |
| **Original ResNet-34 Checkpoint** | `ml/external_models/optical/unet_resnet34_oil/model.pth` | `9aab3f6de981ad73810d3b909603d430aafd94e35f143a2d3e80aa7336521576` | `9aab3f6de981ad73810d3b909603d430aafd94e35f143a2d3e80aa7336521576` | **PASS (UNTOUCHED)** |

---

## 3. Training & Validation History

### 3.1 Experiment A: V2 Domain Adaptation (ResNet-18 U-Net)
- **Target Resolution:** $256\times 256$ aspect-preserving letterbox
- **Batch Size:** 16 | **Optimizer:** AdamW | **Scheduler:** CosineAnnealingLR
- **Loss:** $0.5 \times \text{BCE} + 0.5 \times \text{Dice}$

| Epoch | Duration (s) | Train Loss | Val Loss | Val False Positive Rate | True Negative Accuracy |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | 25.9 | 0.6575 | 0.6140 | 0.00% | 100.0% |
| 2 | 23.7 | 0.6183 | 0.6001 | 0.00% | 100.0% |
| 3 | 25.2 | 0.6033 | 0.5889 | 0.00% | 100.0% |
| 4 | 21.4 | 0.5951 | 0.5835 | 0.00% | 100.0% |
| 5 | 24.5 | 0.5918 | 0.5840 | 0.00% | 100.0% |

- **Best Checkpoint:** `ml/training/runs/v2_domain_adaptation_pilot/checkpoints/best_val_iou.pt`
- **Checkpoint SHA-256:** `f278a4d8879e0e1c786feb374a993a442ad74e3b41e5dc13735f319ae9f47c7d`
- **Total Parameters:** 15,903,058 (all trainable)

### 3.2 Experiment B: External ResNet-34 U-Net Fine-Tuning
- **Target Resolution:** $512\times 512$ aspect-preserving letterbox
- **Batch Size:** 8 | **Optimizer:** AdamW | **Scheduler:** CosineAnnealingLR
- **Loss:** $0.5 \times \text{Focal} (\gamma=2.0, \alpha=0.25) + 0.5 \times \text{Dice}$

| Epoch | Duration (s) | Train Loss | Val Loss | Val False Positive Rate | True Negative Accuracy |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | 88.5 | 0.5053 | 0.5575 | 0.00% | 100.0% |
| 2 | 77.5 | 0.5001 | 0.5409 | 0.00% | 100.0% |
| 3 | 73.5 | 0.5001 | 0.5356 | 0.00% | 100.0% |
| 4 | 73.6 | 0.5000 | 0.5325 | 0.00% | 100.0% |
| 5 | 72.1 | 0.5000 | 0.5311 | 0.00% | 100.0% |

- **Best Checkpoint:** `ml/training/runs/resnet34_domain_adaptation_pilot/checkpoints/best_val_iou.pt`
- **Checkpoint SHA-256:** `09c5da9014dbb694773fd149be764edf9a2e41ca4113b2e3a2445b34ee2503ee`
- **Total Parameters:** 24,436,804 (all trainable)

---

## 4. Comparison Against Phase 4 Frozen Baseline References

| Evaluation Domain | Phase 4 Frozen Baseline V2 | Phase 4 Frozen ResNet-34 | Experiment A Fine-Tuned Pilot | Experiment B Fine-Tuned Pilot |
| :--- | :---: | :---: | :---: | :---: |
| **KERF Drone Aerial** | IoU: **0.8588**, F1: **0.9071**<br>Precision: **0.9262**, Recall: **0.9021** | IoU: **0.8151**, F1: **0.8781**<br>Precision: **0.8361**, Recall: **0.9609** | Quarantined Benchmark (To evaluate in next phase) | Quarantined Benchmark (To evaluate in next phase) |
| **MADOS Satellite** | IoU: **0.1786**, F1: **0.2777**<br>Precision: **0.2119**, Recall: **0.6709** | IoU: **0.0220**, F1: **0.0395**<br>Precision: **0.0232**, Recall: **0.7640** | Quarantined Benchmark (To evaluate in next phase) | Quarantined Benchmark (To evaluate in next phase) |
| **Clean Background (Val Set)** | Verified in baseline | Verified in baseline | **100% TN Accuracy** (0 False Alarms) | **100% TN Accuracy** (0 False Alarms) |
| **Inference Resolution** | $256\times 256$ | $512\times 512$ | $256\times 256$ (Aspect Preserving) | $512\times 512$ (Aspect Preserving) |
| **GPU Execution Device** | RTX 5050 Laptop GPU | RTX 5050 Laptop GPU | RTX 5050 Laptop GPU | RTX 5050 Laptop GPU |

> [!NOTE]
> Consistent with the governance rules established in Phase 5A, the locked Phase 4 benchmark suite (833 samples) was strictly excluded from gradient updates and checkpoint selection. The fine-tuned checkpoints will be formally evaluated against the locked benchmark in the upcoming phase.

---

## 5. Artifact & Run Directory Manifest

The following training artifacts have been created and archived:
```
ml/training/runs/
├── v2_domain_adaptation_pilot/
│   ├── config.json
│   ├── manifest_hashes.json
│   ├── checkpoint_metadata.json
│   ├── environment.json
│   ├── report.md
│   ├── checkpoints/
│   │   ├── best_val_iou.pt
│   │   ├── best_val_dice.pt
│   │   └── last.pt
│   └── metrics/
│       ├── training_history.csv
│       └── validation_history.csv
│
└── resnet34_domain_adaptation_pilot/
    ├── config.json
    ├── manifest_hashes.json
    ├── checkpoint_metadata.json
    ├── environment.json
    ├── report.md
    ├── checkpoints/
    │   ├── best_val_iou.pt
    │   ├── best_val_dice.pt
    │   └── last.pt
    └── metrics/
        ├── training_history.csv
        └── validation_history.csv
```

---

## 6. Regression Verification
- **Python Test Suite:** `331 passed, 34 warnings in 30.69s` (`services/ml-python`).
- **Node Test Suite:** `135 passed` across 19/19 test suites (`services/backend-node`).
- **Frontend Build:** `vite build` succeeded in 2.33s with zero errors (`apps/web`).
- **Production Isolation:** No production model replaced, no API modified, no frontend altered.
