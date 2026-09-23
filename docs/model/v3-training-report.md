# Model Training & Validation Report: `unet-dual-pol-sar-v3`

**Experiment Identifier**: `EXP-UNET-SAR-DUALPOL-V3`  
**Framework**: PyTorch 2.x  
**Model Architecture**: Standard Dual-Polarization (VV+VH) U-Net  
**Checkpoint Path**: `ml/model_registry/versions/unet_dual_pol_sar_v3.pth`  

---

## 1. Dataset Composition & Scene Distribution Audit

The dataset consists of 40 verified real Sentinel-1 SAR scenes sourced from the Zenodo Sentinel-1 SAR Oil Spill Benchmark (Parts I, II, and III):

| Split | Scene Count | Tile Count ($512 \times 512$) | Positive Tiles | Negative Tiles | Positive Pixels | Positive Ratio |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Train** | 28 | 448 | 67 | 381 | 710,790 | 0.6053% |
| **Val** | 7 | 112 | 14 | 98 | 155,393 | 0.5310% |
| **Test** | 5 | 80 | 14 | 66 | 205,257 | 0.6117% |
| **Total Corpus** | **40** | **640** | **95** | **545** | **1,071,440** | **0.6386%** |

### Category Breakdown
* **Oil-Spill Scenes (Part I)**: 15 scenes (12 Train, 3 Val)
* **Clean Sea / No-Oil Scenes (Part II)**: 10 scenes (8 Train, 2 Val)
* **Look-Alike Feature Scenes (Part II)**: 10 scenes (8 Train, 2 Val)
* **Held-Out Test Scenes (Part III)**: 5 scenes (00060, 00062, 00063, 00064, 00080)

### Class Imbalance Diagnosis
* The positive slick pixel ratio is **0.6386%** across the entire dataset.
* Over **99.36%** of all pixels represent background/clean water, constituting severe spatial class imbalance.

---

## 2. Model Architecture & Training Configuration

* **Input Channels**: 2 (`Channel 0: Normalized VV`, `Channel 1: Normalized VH`)
* **Output Channels**: 2 (`Class 0: Clean Sea`, `Class 1: Oil Spill Candidate`)
* **Encoder Channels**: `[16, 32, 64, 128]` with double convolution blocks and BatchNorm
* **Decoder Channels**: `[128, 64, 32, 16]` with transposed convolutions and skip connections
* **Parameter Count**: `~480,000` trainable parameters
* **Loss Function**: **Focal Soft-Dice Loss** ($\alpha = 0.75, \gamma = 2.0, w_{\text{dice}} = 1.0$)
* **Sampling Strategy**: `WeightedRandomSampler` over-weighting positive slick tiles ($10\times$ weight)
* **Data Augmentations**: Random horizontal flip, vertical flip, random 90-degree rotations
* **Optimizer**: `AdamW` (Weight decay = $1\times 10^{-4}$)
* **Learning Rate**: $5 \times 10^{-4}$ with Cosine Annealing scheduler
* **Batch Size**: 8
* **Epochs**: 6
* **Random Seed**: 42

---

## 3. Validation Threshold Sweep ($\tau \in [0.10, 0.50]$)

Evaluated strictly on the 7 validation scenes (112 tiles, $29,360,128$ total pixels):

| Threshold ($\tau$) | IoU (%) | Dice (%) | Precision (%) | Recall (%) | FPR (%) | Predicted Area ($\text{km}^2$) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **0.10** | 0.5311% | 1.0567% | 0.5311% | 100.0000% | 99.6436% | 2,925.60 |
| **0.15** | 0.5317% | 1.0578% | 0.5317% | 100.0000% | 99.5343% | 2,922.41 |
| **0.20** | 0.5324% | 1.0592% | 0.5324% | 100.0000% | 99.4084% | 2,918.74 |
| **0.25** | **0.7532%** | **1.4952%** | **0.7853%** | **15.5696%** | **10.4661%** | **308.08** |
| **0.30** | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.0048% | 0.14 |
| **0.35** | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.00 |
| **0.40** | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.00 |
| **0.45** | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.00 |
| **0.50** | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.0000% | 0.00 |

### Operating Threshold Selection
* Selected Operating Threshold: **$\tau^* = 0.25$** (Validation Dice = $1.50\%$, IoU = $0.75\%$).
* Thresholds $\ge 0.30$ produce zero detections on the validation split.

---

## 4. Held-Out Test Evaluation

Evaluated on the 5 held-out Part III test scenes at $\tau^* = 0.25$:

* **True Positives (TP)**: 16,752 pixels
* **False Positives (FP)**: 2,184,434 pixels
* **False Negatives (FN)**: 188,505 pixels
* **True Negatives (TN)**: 18,581,829 pixels
* **IoU**: **0.7010%**
* **Dice / F1**: **1.3923%**
* **Precision**: **0.7610%**
* **Recall**: **8.1615%**
* **False Positive Rate (FPR)**: **10.5191%**

---

## 5. Conclusion

**V3 did not demonstrate sufficient improvement; model remains experimental.**
The model provides insight into the high sensitivity of U-Net segmentation to dark oceanic clutter when trained under severe class imbalance, informing the next research direction in context-aware attention and wind-speed conditioning.
