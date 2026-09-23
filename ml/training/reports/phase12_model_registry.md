# Ocean Guard AI / SIH 26143
# Phase 12 Report: Optical Model Registry

**Date:** 2026-09-21  
**Author:** AI Research & Engineering Subagent  
**Status:** VALIDATED & CRYPTOGRAPHICALLY LOCKED  
**Module:** `services/ml-python/app/models/optical_model_registry.py`  

---

## 1. Registry Overview

The Ocean Guard AI Optical Model Registry establishes a single, immutable, cryptographically verified catalog of validated optical deep learning models.

Every registered model has:
1. An immutable identifier and schema contract.
2. A pinned checkpoint path and expected SHA-256 cryptographic digest.
3. Preprocessing version specification (exact input channels, normalization statistics, spatial resampling rules).
4. Reference benchmark performance metrics.

> **CRITICAL SCIENTIFIC GOVERNANCE:** Reference benchmark metrics (e.g., IoU, F1) recorded in the registry are historical metadata from locked benchmark evaluations. They are strictly prohibited from being returned as runtime prediction confidence.

---

## 2. Registered Model Catalog

| Model ID | Domain | Input Channels & Bands | Checkpoint Path | Cryptographic SHA-256 | Benchmark Dataset | Benchmark IoU | Benchmark F1 |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: |
| **`mados-resnet34-rgbnir-swir-v1`** | Sentinel-2 Multi-Spectral | 6 channels: `[B4, B3, B2, B8, B11, B12]` | `ml/training/runs/mados_rgbnir_swir_resnet34/checkpoints/best_val_iou.pt` | `856ea016b8f750a40af942ee2e59f5919d2f04fbc510d01d2c772ecbdb3ee983` | MADOS Locked Benchmark (361 positive scenes) | **0.4273** | **0.5987** |
| **`kerf-resnet34-focaldice-v1`** | Drone / Aerial RGB | 3 channels: `[R, G, B]` | `ml/training/runs/resnet34_balanced_focaldice_pilot/checkpoints/best_val_iou.pt` | `d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264` | KERF Locked Benchmark (134 scenes) | **0.8268** | **0.9052** |
| **`mados-resnet34-rgb-v1`** | Satellite RGB Fallback | 3 channels: `[B4, B3, B2]` | `ml/training/runs/phase11_rgb_control/checkpoints/best_val_iou.pt` | `a4c32de7177bc42c2f0298427ce8bef4a2bf8d4a35e25c3450a67eb16f8e099a` | MADOS Locked Benchmark (361 positive scenes) | **0.3554** | **0.5245** |

---

## 3. Model Specifications

### Model A: `mados-resnet34-rgbnir-swir-v1`
- **Domain:** Satellite Multi-Spectral (Sentinel-2 Level-2R MSI)
- **Architecture:** ResNet-34 U-Net with modified 6-channel input layer (`encoder.conv1` initialized from pretrained RGB weights + spatial mean transfer).
- **Target Resolution:** $512 \times 512$ pixels.
- **Input Channels:** 6 bands in exact physical order: `[B4, B3, B2, B8, B11, B12]`
  - B4 (Red, 665nm, 10m)
  - B3 (Green, 560nm, 10m)
  - B2 (Blue, 490nm, 10m)
  - B8 (NIR, 833nm, 10m)
  - B11 (SWIR-1, 1610nm, 20m continuous bilinear resampled to 10m grid)
  - B12 (SWIR-2, 2186nm, 20m continuous bilinear resampled to 10m grid)
- **Normalization (Training Set Only):**
  - Means: `[0.036934, 0.046210, 0.053790, 0.038064, 0.028343, 0.020602]`
  - Stds: `[0.035496, 0.034394, 0.032938, 0.057896, 0.042911, 0.029753]`
- **Default Operating Threshold:** $\tau = 0.50$
- **Benchmark Performance:**
  - Full Benchmark IoU: **0.4273**
  - F1 Score: **0.5987**
  - Precision: **0.6062**
  - Recall: **0.5915**
  - Positive Sample Recall: **80.06%**
  - Clean Ocean False Alarm Rate: **2.31%** (14 / 607 validation crops)

---

### Model B: `kerf-resnet34-focaldice-v1`
- **Domain:** Drone & Aerial High-Resolution Photography
- **Architecture:** ResNet-34 U-Net (3 channels, 4 output classes).
- **Target Resolution:** $512 \times 512$ pixels (aspect-preserving letterbox with inverse coordinate mapping).
- **Input Channels:** 3 bands: `[R, G, B]`
- **Normalization (ImageNet Standard):**
  - Means: `[0.485, 0.456, 0.406]`
  - Stds: `[0.229, 0.224, 0.225]`
- **Default Operating Threshold:** $\tau = 0.50$
- **Benchmark Performance:**
  - KERF Benchmark IoU: **0.8268**
  - Precision: **0.8654**
  - Recall: **0.9496**

---

### Model C: `mados-resnet34-rgb-v1`
- **Domain:** Satellite RGB Fallback (Sentinel-2 RGB or general optical satellite when SWIR/NIR is unavailable)
- **Architecture:** ResNet-34 U-Net (3 channels, 4 output classes).
- **Target Resolution:** $512 \times 512$ pixels.
- **Input Channels:** 3 bands: `[B4, B3, B2]`
- **Normalization (Training Set Only):**
  - Means: `[0.036934, 0.046210, 0.053790]`
  - Stds: `[0.035496, 0.034394, 0.032938]`
- **Default Operating Threshold:** $\tau = 0.50$
- **Benchmark Performance:**
  - Full Benchmark IoU: **0.3554**
  - F1 Score: **0.5245**
  - Precision: **0.5651**
  - Recall: **0.4893**
  - Positive Sample Recall: **73.13%**
  - Clean Ocean False Alarm Rate: **5.11%** (31 / 607 validation crops)

---

## 4. Integrity Verification & Fail-Closed Policy

The registry enforces lazy loading with cryptographic SHA-256 verification:
1. `get_model(model_id)` reads the on-disk checkpoint and computes its SHA-256 digest in $64\text{ KB}$ chunks.
2. If the computed digest does not match `spec.expected_sha256`, the registry raises `ModelVerificationError` and blocks model execution (**FAIL-CLOSED**).
3. If the checkpoint file is missing or corrupted, execution is immediately halted without fallback to untrusted weights.
