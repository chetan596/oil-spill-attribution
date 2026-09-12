# Phase 3A — Real Sentinel-1 / SAR Data & ML Audit

**System:** AI-Powered Oil Spill Detection & Vessel Attribution System (SIH26143)  
**Document:** Dataset & ML Infrastructure Audit  
**Date:** September 2026  
**Status:** Audit Complete  

---

## 1. Executive Summary

This audit evaluates the current state of data assets, preprocessing utilities, neural network architectures, model registries, and API schemas across the `data/`, `ml/`, and `services/ml-python/` directories.

**Key Finding:** No physical satellite imagery, ground-truth masks, AIS records, or trained neural network weights (`.pth` / `.onnx`) currently exist locally within the repository. The project contains architectural scaffolding, configuration YAMLs, and API stubs designed to accept a standardized Sentinel-1 SAR semantic segmentation pipeline.

---

## 2. Directory-by-Directory Audit

### 2.1 `data/` Directory
- `data/raw/satellite/`: Contains `.gitkeep` only. No `.SAFE`, `.tif`, or `.nc` files.
- `data/raw/ais/`: Contains `.gitkeep` only.
- `data/raw/weather/`: Contains `.gitkeep` only.
- `data/raw/ocean/`: Contains `.gitkeep` only.
- `data/interim/`: Contains `.gitkeep` only.
- `data/processed/`: Contains `.gitkeep` only.
- `data/samples/`: Contains `.gitkeep` only.
- `data/mock/`: Contains `.gitkeep` only.

### 2.2 `ml/` Directory
- `ml/datasets/raw/`, `ml/datasets/processed/`, `ml/datasets/splits/`, `ml/datasets/annotations/`: Contain `.gitkeep` only.
- `ml/configs/`:
  - `unet.yaml`: Configured for `in_channels: 1`, `classes: 1`, `epochs: 50`, `batch_size: 16`, `loss: dice_bce`.
  - `super_resolution.yaml`: Configured for `scale_factor: 2`, `epochs: 30`, `batch_size: 8`.
  - `inference.yaml`: Configured for `threshold: 0.5`, `tile_size: 512`, `stride: 448`, `device: cuda`.
- `ml/model_registry/`:
  - `README.md`: Notes target models `unet_sar_oil_spill_v1.pth` and `sar_sr_enhancer_v1.pth`.
  - `versions/`: Contains `.gitkeep` only (no binary weights).
- `ml/training/`:
  - `train_unet.py`, `train_sr.py`, `cross_validation.py`, `evaluate.py`: Contain single-line print statement stubs.
- `ml/evaluation/`:
  - `metrics.py`, `confusion_matrix.py`, `segmentation_metrics.py`: Contain dummy return stubs (e.g., `return 0.82`).

### 2.3 `scripts/` Directory
- `scripts/download-dataset.py`: Stub script containing `print("Downloading sample Sentinel-1 SAR and AIS benchmark dataset...")`.

### 2.4 `services/ml-python/` Directory
- `requirements.txt`: Specifies modern scientific packages: `fastapi`, `torch>=2.2.0`, `torchvision`, `rasterio>=1.3.9`, `shapely>=2.0.3`, `geopandas>=0.14.3`, `opencv-python-headless>=4.9.0.80`.
- `app/api/routes/detection.py`: Stub endpoint returning mock `DetectionResponse(confidence=0.92, total_area_km2=0.0)`.
- `app/api/schemas/detection.py`: Defines basic `DetectionRequest` and `DetectionResponse` models.
- `app/models/unet/architecture.py`: Toy 2-layer convolutional stub (not a complete encoder-decoder U-Net).
- `app/models/registry.py`: Stub returning `None`.
- `app/preprocessing/`: Contains stubs for `georeferencing.py`, `sar_preprocessor.py`, `normalization.py`, `tiling.py`.
- `app/postprocessing/`: Contains stubs for `mask_to_polygon.py`, `area.py`, `geometry.py`.

---

## 3. Dataset Characteristics Audit

| Dimension | Audit Finding | Status |
| :--- | :--- | :--- |
| **Local Dataset Files** | 0 image files present | ❌ Missing |
| **File Formats** | Target: GeoTIFF (`.tif`), NetCDF (`.nc`), Sentinel-1 SAFE | ⚠️ Not yet loaded |
| **Image Dimensions** | Configured tile size: 512×512 (Stride 448) | 📋 Defined in config |
| **Bands / Channels** | C-Band SAR, 1 channel (Single VV) or 2 channels (Dual VV + VH) | 📋 Configured in YAML |
| **Labels / Classes** | Binary (0: Sea, 1: Oil Spill) or Multi-class (Look-alike, Ship, Land) | 📋 Architecture ready |
| **Ground Truth Masks** | Binary / Multi-class 8-bit PNG / GeoTIFF masks | ❌ Missing |
| **Train/Val/Test Splits** | `ml/datasets/splits/` empty | ❌ Missing |
| **Coordinate System** | WGS 84 / UTM (`EPSG:4326` or projected UTM for area calculation) | 📋 Handled by rasterio |
| **Pretrained Weights** | 0 weights in `ml/model_registry/versions/` | ❌ Missing |

---

## 4. Summary of Technical Needs

1. Acquire/mount the official SIH26143 benchmark Sentinel-1 SAR dataset into `data/raw/satellite/`.
2. Implement true U-Net segmentation architecture with ResNet/EfficientNet encoder in PyTorch.
3. Build georeferenced raster-to-vector polygonizer using `rasterio` and `shapely`.
4. Implement look-alike rejection filtering.
