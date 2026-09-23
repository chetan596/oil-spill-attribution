# Phase 7B: Corrected Balanced Fine-Tuning Pilot Report

## Executive Summary

Phase 7B successfully executed three controlled pilot fine-tuning experiments on the newly recovered balanced candidate pool (**1,059 training samples**: 353 positive / 706 hard negative; **264 validation samples**: 88 positive / 176 hard negative).

Unlike the failed Phase 5B pilot (which had an acute foreground deficit of only 5 positives to 2,562 negatives leading to complete zero-foreground background collapse), Phase 7B implemented:
1. **Dynamic Balanced 1:1 Batch Sampling** (8 positive : 8 hard negative per effective batch of 16).
2. **Foreground-Aware Loss Functions** (Focal-Dice with $\gamma=2.0, \alpha=0.75$ and BCE-Dice ablation).
3. **Differential Learning Rates** ($10^{-3}$ for decoder/segmentation heads, $10^{-5}$ for frozen/fine-tuned backbone encoders).
4. **Positive-Prediction Collapse Monitoring** (early-stopping safety trigger if 0 foreground predicted for 2 consecutive epochs).

All three experiments trained stably, completely avoided background collapse, and achieved strong validation segmentation performance (>0.90 IoU, >0.95 Dice) while maintaining ultra-low false alarm rates (0.0% - 1.14%) on hard look-alike negatives.

---

## Benchmark & Data Isolation Governance

- **Phase 4 / Phase 6 Locked Benchmark (833 samples)**: Immutable, strictly quarantined, NOT used for training, validation, early stopping, or checkpoint selection.
- **Sealed External Test Set (130 samples)**: Immutable and unopened.
- **Base Production Checkpoints**:
  - `optical-oil-seg-unet-resnet18-v2`: `e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398` (VERIFIED UNCHANGED)
  - `unet_resnet34_oil`: `9aab3f6de981ad73810d3b909603d430aafd94e35f143a2d3e80aa7336521576` (VERIFIED UNCHANGED)
- **Training Manifest SHA-256**: `c1061626013fe23daa1cf443509315887f8bf5c04379c5fcd1330fafddf22fbd` (1,059 samples)
- **Validation Manifest SHA-256**: `3d83ffaa61a54733c91a8f0c641e0efe270935b02cd72e4ed8cf15fea47c85ab` (264 samples)

---

## Experiment Results Summary

| Experiment | Model Architecture | Resolution | Loss Function | Best Epoch | Best Val IoU | Best Val Dice | Val Recall | Val Precision | Pos Pred Rate | Clean Ocean FP Rate | Look-Alike FP Rate |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **A** | V2 (ResNet-18 U-Net) | $256 \times 256$ | Focal-Dice ($\gamma=2.0, \alpha=0.75$) | 13 | **0.9346** | **0.9662** | 97.34% | 95.92% | 33.7% | 0.0% (0/88) | 1.14% (1/88) |
| **B** | ResNet-34 U-Net | $512 \times 512$ | Focal-Dice ($\gamma=2.0, \alpha=0.75$) | 9 | **0.9096** | **0.9527** | 95.95% | 94.59% | 33.3% | 0.0% (0/88) | 0.00% (0/88) |
| **C** | V2 (ResNet-18 U-Net) | $256 \times 256$ | BCE-Dice (Ablation) | 13 | **0.9368** | **0.9674** | 96.80% | 96.68% | 33.3% | 0.0% (0/88) | 0.00% (0/88) |

---

## Detailed Experiment Reports

### 1. Experiment A: V2 Balanced Focal-Dice Pilot (`v2_balanced_focaldice_pilot`)

- **Base Architecture**: Optical UNet ResNet-18 V2 (15,903,058 parameters; 11,242,304 backbone, 4,660,754 decoder)
- **Input Resolution**: $256 \times 256$ (aspect-preserving letterbox with nearest-neighbor mask interpolation)
- **Effective Batch Size**: 16 (8 positive, 8 hard negative)
- **Optimization**: AdamW ($\text{LR}_{\text{backbone}}=10^{-5}$, $\text{LR}_{\text{decoder}}=10^{-3}$, weight decay $=10^{-4}$), Cosine Annealing scheduler.
- **Loss Configuration**: Focal-Dice ($\gamma=2.0$, $\alpha=0.75$ applied to the focal weighting term $\alpha_t$).
- **Best Epoch**: Epoch 13
- **Best Checkpoint**: `ml/training/runs/v2_balanced_focaldice_pilot/checkpoints/best_val_iou.pt`
- **Output Checkpoint SHA-256**: `339f7aaa8a56a10069438e524848dd99078d5989f942f535f606095eaf37963d`
- **Training Duration**: 637.5 seconds (~10.6 minutes)
- **Epoch Progression**:
  - Epoch 1: Val IoU = 0.8562, Recall = 96.28%, Pos Pred Rate = 33.71%
  - Epoch 5: Val IoU = 0.8919, Recall = 97.95%, Pos Pred Rate = 33.71%
  - Epoch 10: Val IoU = 0.9162, Recall = 95.20%, Pos Pred Rate = 33.71%
  - Epoch 13: **Val IoU = 0.9346, Val Dice = 0.9662, Recall = 97.34%, Precision = 95.92%**

---

### 2. Experiment B: ResNet-34 Balanced Focal-Dice Pilot (`resnet34_balanced_focaldice_pilot`)

- **Base Architecture**: ResNet-34 U-Net (24,436,804 parameters; 23,649,568 backbone, 787,236 decoder)
- **Input Resolution**: $512 \times 512$ (aspect-preserving letterbox with nearest-neighbor mask interpolation)
- **Batching & Accumulation**: Physical batch size 8, 2 gradient accumulation steps (Effective batch size = 16: 8 positive, 8 hard negative).
- **Optimization**: AdamW ($\text{LR}_{\text{backbone}}=10^{-5}$, $\text{LR}_{\text{decoder}}=10^{-3}$, weight decay $=10^{-4}$), Cosine Annealing scheduler.
- **Loss Configuration**: Focal-Dice ($\gamma=2.0$, $\alpha=0.75$).
- **Best Epoch**: Epoch 9 (Early stopped at Epoch 13 after 4-epoch plateau)
- **Best Checkpoint**: `ml/training/runs/resnet34_balanced_focaldice_pilot/checkpoints/best_val_iou.pt`
- **Output Checkpoint SHA-256**: `d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264`
- **Training Duration**: 1550.8 seconds (~25.8 minutes)
- **Epoch Progression**:
  - Epoch 1: Val IoU = 0.8178, Recall = 91.64%, Pos Pred Rate = 36.36%
  - Epoch 4: Val IoU = 0.8988, Recall = 95.55%, Pos Pred Rate = 33.33%
  - Epoch 6: Val IoU = 0.9037, Recall = 95.01%, Pos Pred Rate = 33.33%
  - Epoch 9: **Val IoU = 0.9096, Val Dice = 0.9527, Recall = 95.95%, Precision = 94.59%**
  - Epoch 13: Val IoU = 0.8921 (Early stopped on patience = 4)

---

### 3. Experiment C: V2 Balanced BCE-Dice Ablation (`v2_balanced_bcedice_ablation`)

- **Base Architecture**: Optical UNet ResNet-18 V2 (15,903,058 parameters)
- **Input Resolution**: $256 \times 256$
- **Effective Batch Size**: 16 (8 positive, 8 hard negative)
- **Optimization**: Identical to Experiment A (AdamW, $\text{LR}_{\text{backbone}}=10^{-5}$, $\text{LR}_{\text{decoder}}=10^{-3}$)
- **Loss Configuration**: Standard BCE + Soft Dice Loss (Ablation to isolate balanced batch sampling vs focal loss weighting)
- **Best Epoch**: Epoch 13
- **Best Checkpoint**: `ml/training/runs/v2_balanced_bcedice_ablation/checkpoints/best_val_iou.pt`
- **Output Checkpoint SHA-256**: `4859c52a711351515ece9c9f7821837b29bb0ad1cc3a715d0b55d727b01dd5a8`
- **Training Duration**: 674.3 seconds (~11.2 minutes)
- **Epoch Progression**:
  - Epoch 1: Val IoU = 0.8162, Recall = 95.82%, Pos Pred Rate = 33.33%
  - Epoch 6: Val IoU = 0.9142, Recall = 96.02%, Pos Pred Rate = 33.33%
  - Epoch 8: Val IoU = 0.9284, Recall = 96.39%, Pos Pred Rate = 33.71%
  - Epoch 13: **Val IoU = 0.9368, Val Dice = 0.9674, Recall = 96.80%, Precision = 96.68%**

---

## Foreground & Collapse Analysis

### Background Collapse Check
- **Phase 5B Background Collapse**: In Phase 5B, models predicted 0 foreground pixels across 100% of samples because positive samples constituted <0.2% of the training pool.
- **Phase 7B Outcome**: **NO COLLAPSE OCCURRED IN ANY EXPERIMENT.**
  - Positive prediction image rates on validation set were stable at **33.3% to 33.7%** (matching the exact ground-truth validation proportion: 88 positive / 264 total = 33.33%).
  - Positive sample recall was **100%** (every positive sample had oil detected).
  - Mean predicted oil foreground area on positives was **20.27% - 20.54%** (matching ground truth mean of **20.24%**).

### Positive Image Oil Percentage Distributions

| Model | Metric | Mean | Median | P10 | P90 |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Ground Truth** | Oil Coverage % | 20.24% | 19.50% | 9.08% | 36.21% |
| **Exp A (V2 Focal-Dice)** | Predicted Oil % | 20.54% | 19.16% | 9.37% | 37.54% |
| | Intersection % | 19.71% | 18.91% | 8.22% | 35.84% |
| | False Negative % | 0.54% | 0.26% | 0.03% | 1.29% |
| | False Positive % | 0.84% | 0.47% | 0.12% | 1.77% |
| **Exp B (ResNet-34 Focal-Dice)** | Predicted Oil % | 20.51% | 19.95% | 8.42% | 33.02% |
| | Intersection % | 19.41% | 19.15% | 7.89% | 32.61% |
| | False Negative % | 0.82% | 0.28% | 0.07% | 2.29% |
| | False Positive % | 1.11% | 0.48% | 0.17% | 2.33% |
| **Exp C (V2 BCE-Dice)** | Predicted Oil % | 20.27% | 19.08% | 8.72% | 37.44% |
| | Intersection % | 19.60% | 18.86% | 8.06% | 35.83% |
| | False Negative % | 0.65% | 0.33% | 0.06% | 1.50% |
| | False Positive % | 0.67% | 0.41% | 0.12% | 1.39% |

---

## Hard Negative False Alarm Analysis

The validation negative set consists of 176 hard negatives (88 clean ocean scenes and 88 challenging look-alike scenes including waves, wakes, cloud reflections, and vessels):

| Negative Category | Total Samples | Exp A FP Count (Rate) | Exp B FP Count (Rate) | Exp C FP Count (Rate) |
| :--- | :---: | :---: | :---: | :---: |
| **Clean Ocean** | 88 | 0 (0.00%) | 0 (0.00%) | 0 (0.00%) |
| **Look-Alike (Waves, Wakes, Ships)** | 88 | 1 (1.14%) | 0 (0.00%) | 0 (0.00%) |
| **Overall Negative FP Rate** | 176 | **0.57% (1/176)** | **0.00% (0/176)** | **0.00% (0/176)** |

---

## Ablation Findings: Balanced Sampler vs Loss Function

Comparing Experiment A (Balanced Sampler + Focal-Dice) and Experiment C (Balanced Sampler + BCE-Dice):
1. **Primary Factor**: The balanced batch sampling (1:1 ratio) is the primary driver in resolving background collapse and achieving high IoU (>0.93).
2. **Loss Nuance**:
   - BCE-Dice achieved slightly higher validation precision (96.68% vs 95.92%) and lower look-alike false positive rate (0.0% vs 1.14%).
   - Focal-Dice achieved higher recall on positive pixels (97.34% vs 96.80%) and smaller false negative area (0.54% vs 0.65%).

---

## Strict Domain Context Note

The 441 recovered positive candidate images in the Phase 7 training/validation pool are primarily drone optical imagery. Therefore, these validation results reflect strong domain-specific optical segmentation learning. Whether this translates to improved performance on satellite MADOS/look-alike benchmarks will be rigorously and objectively tested in Phase 8 without modifying benchmark samples or labels.
