# GPU & CUDA Runtime Environment Report

**Project**: Ocean Guard AI / SIH 26143  
**Subsystem**: `services/ml-python`  
**Date**: 2026-09-19  
**Status**: VALIDATED & OPERATIONAL (100% PASS)

---

## 1. Hardware Specifications

| Property | Value |
| :--- | :--- |
| **GPU Model** | NVIDIA GeForce RTX 5050 Laptop GPU |
| **Architecture** | Blackwell Generation (`sm_120` / Compute Capability 12.0) |
| **Total Dedicated VRAM** | 8150.56 MiB (~8.0 GB GDDR7) |
| **Driver Version** | 610.74 (WDDM 3.2) |
| **Maximum CUDA UMD** | 13.3 |
| **Power Profile / Cap** | 55W – 70W Dynamic Boost |

---

## 2. Software & Deep Learning Stack

| Component | Verified Version | Notes |
| :--- | :--- | :--- |
| **Operating System** | Microsoft Windows 11 Pro 64-bit | Local host |
| **Python Environment** | Python 3.11.9 (64-bit) | `services/ml-python/.venv` |
| **PyTorch** | `2.11.0+cu128` | Official Blackwell CUDA 12.8 wheel |
| **Torchvision** | `0.26.0+cu128` | Official CUDA 12.8 matching build |
| **CUDA Runtime** | 12.8 | Supported by PyTorch |
| **cuDNN** | 91900 (v9.1.9) | Accelerated convolution kernels |
| **Pillow (PIL)** | 12.3.0 | Verified clean image I/O |

---

## 3. Kernel & Compute Validation Matrix

| Test Phase | Workload / Shape | Outcome | Metrics & Observations |
| :--- | :--- | :--- | :--- |
| **CUDA Availability** | `torch.cuda.is_available()` | **PASSED** | 1 GPU detected (`cuda:0`) |
| **Tensor Math & Sync** | $1024 \times 1024$ FP32 Matmul | **PASSED** | $0.88\text{ ms}$ GPU latency ($19.4\times$ speedup over CPU) |
| **Precision Support** | FP32, FP16, BF16 | **PASSED** | Native Blackwell tensor allocations verified |
| **Forward Pass** | $1 \times 2 \times 512 \times 512$ CNN | **PASSED** | Loss: $1.1532$, finite & deterministic |
| **Backward Pass** | Autograd MSE loss gradient | **PASSED** | Valid non-zero finite weight gradients across all layers |
| **Optimizer Step** | AdamW parameter update | **PASSED** | Successful parameter migration & CUDA synchronization |
| **AMP Autocast** | `torch.amp.autocast('cuda')` | **PASSED** | Stable FP16 execution, zero NaN / Inf anomalies |
| **AMP GradScaler** | `torch.amp.GradScaler('cuda')` | **PASSED** | Dynamic loss scaling & unscaling verified |
| **512×512 VRAM (Batch 1)** | $1 \times 2 \times 512 \times 512$ Full Step | **PASSED** | Peak Allocated: **69.74 MiB**, Peak Reserved: **82.00 MiB** |
| **512×512 VRAM (Batch 2)** | $2 \times 2 \times 512 \times 512$ Full Step | **PASSED** | Peak Allocated: **112.18 MiB**, Peak Reserved: **158.00 MiB** |
| **Existing U-Net Forward** | Dual-Pol $1 \times 2 \times 512 \times 512$ | **PASSED** | Output: $(1, 2, 512, 512)$, Peak Alloc: **333.00 MiB**, Peak Res: **420.00 MiB** |

---

## 4. Package Ecosystem Compatibility Audit

All core spatial, scientific, machine learning, and API packages were verified against the new PyTorch CUDA 12.8 environment:

- `torch`: **2.11.0+cu128** (PASSED)
- `torchvision`: **0.26.0+cu128** (PASSED)
- `numpy`: **2.4.6** (PASSED)
- `rasterio`: **1.4.4** (PASSED)
- `geopandas`: **1.1.4** (PASSED)
- `shapely`: **2.1.2** (PASSED)
- `scipy`: **1.17.1** (PASSED)
- `cv2` (OpenCV): **5.0.0** (PASSED)
- `fastapi`: **0.141.1** (PASSED)
- `pydantic`: **2.13.5** (PASSED)

---

## 5. Unit & Integration Test Regression Audit

- **Unit Tests (`tests/unit`)**: **68 / 68 PASSED** (100% pass rate, 0 failed, 0 skipped)
- **Integration Tests (`tests/integration`)**: **3 / 3 PASSED** (100% pass rate, 0 failed, 0 skipped)
- **Total Test Suite**: **71 PASSED**, zero regressions.

---

## 6. Initial Training Configuration Baseline

> [!NOTE]
> **INITIAL TRAINING CONFIGURATION**
> These parameters represent the verified safe baseline constraints for initiating model training on the RTX 5050 Blackwell GPU. They are NOT scientifically optimized final hyperparameters.

```yaml
training_runtime:
  device: "cuda:0"
  precision: "amp_fp16" # Verified via torch.amp.autocast('cuda')
  grad_scaler: true     # Verified via torch.amp.GradScaler('cuda')
  input_spatial_shape: [512, 512]
  input_channels: 2     # [VV_dB_norm, VH_dB_norm]
  initial_batch_size: 2 # Verified safe; peak VRAM < 450 MiB
  max_safe_batch_size: 8 # Estimated ceiling for 8 GB VRAM with U-Net backbone
  num_workers: 0        # 0 recommended on Windows to prevent multiprocessing deadlock
  pin_memory: true
  gradient_accumulation_steps: 1
  checkpointing:
    save_best: true
    metric: "val_f1"
    save_optimizer: true
```
