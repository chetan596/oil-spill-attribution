# Phase 3A — Real Sentinel-1 / SAR ML Implementation Plan

**System:** AI-Powered Oil Spill Detection & Vessel Attribution System (SIH26143)  
**Document:** Technical Implementation Plan for Phase 3B ML Integration  
**Date:** September 2026  

---

## 1. Objective & Scope

Transition the SAR slick detection stage from mock deterministic geometries to real Sentinel-1 C-Band SAR semantic segmentation in `services/ml-python` while maintaining zero disruption to the operational Node.js backend and React web UI.

---

## 2. Technical Architecture & Data Flow

```
[Sentinel-1 GeoTIFF Image] (data/raw/satellite/*.tif)
             │
             ▼
 [1. SAR Preprocessing & Tiling] (services/ml-python/app/preprocessing/)
   • Radiometric calibration (Linear / Sigma0 dB)
   • Speckle filtering (Lee filter / Median 3x3)
   • 512x512 tiling with 64px overlap
             │
             ▼
 [2. Deep Learning Segmentation] (services/ml-python/app/models/unet/)
   • U-Net with ResNet34 / EfficientNet-B0 backbone
   • Dual polarization input: VV + VH (or single VV)
   • Multi-class or binary probability logits
             │
             ▼
 [3. Postprocessing & Look-alike Rejection] (services/ml-python/app/postprocessing/)
   • Sigmoid thresholding (τ = 0.5)
   • Morphological closing & speckle noise removal
   • Contextual look-alike filtering (compactness, gradient)
             │
             ▼
 [4. Georeferenced Polygonization] (services/ml-python/app/postprocessing/mask_to_polygon.py)
   • rasterio.features.shapes() affine transform
   • Shapely Polygon creation & EPSG:4326 reprojection
   • Polygon simplification (Douglas-Peucker tolerance = 0.0001°)
   • Surface area computation in km²
             │
             ▼
 [5. FastAPI Detection Endpoint] (POST /api/v1/detection/segment)
             │
             ▼
 [6. Node.js Worker Pipeline] (services/backend-node/src/jobs/)
   • Persists PostGIS Slick Polygon in `analyses` & `spills`
```

---

## 3. Recommended 2-Day Prototype Model Strategy

### Selected Path: **Option D (Modular Inference Engine + Pretrained Weights Adaptation)**
- **Rationale**:
  1. Training a deep segmentation model from scratch in 48 hours carries high convergence and GPU infrastructure risks.
  2. Pretrained U-Net architectures with ResNet backbones fine-tuned on benchmark SAR oil spill datasets (e.g. KREST / M4D SAR dataset) achieve $\ge 82\%$ IoU out-of-the-box.
  3. Building a robust GeoTIFF-to-WGS84 polygonizer ensures mathematical spatial accuracy regardless of the specific model checkpoint attached.

---

## 4. Step-by-Step Execution Plan for Phase 3B

### Stage 1: Preprocessing & Georeferencing Pipeline
- Implement `sar_preprocessor.py` to read Sentinel-1 GeoTIFF rasters using `rasterio`.
- Extract spatial transform, bounding box, projection, and pixel size.
- Normalize VV/VH amplitude values to $[0.0, 1.0]$.

### Stage 2: Deep Learning Model Architecture
- Implement production-grade `UNet` with ResNet34 encoder in `services/ml-python/app/models/unet/architecture.py`.
- Support weights loading from `ml/model_registry/versions/unet_sar_v1.pth`.

### Stage 3: Raster-to-Vector Polygonizer
- Implement `mask_to_polygon.py` using `rasterio.features.shapes` and `shapely.geometry.shape`.
- Convert predicted binary 2D mask directly to WGS84 GeoJSON Polygons.
- Compute surface area in $\text{km}^2$ using geodesic or UTM projection.

### Stage 4: Python FastAPI Service Route
- Expose `POST /api/v1/detection/segment` adhering to the verified contract:
  ```json
  {
    "scene_id": "demo-scene-001",
    "detection_status": "detected",
    "confidence": 0.94,
    "slick_polygons": [
      {
        "type": "Polygon",
        "coordinates": [[[72.81, 18.91], [72.84, 18.91], [72.84, 18.93], [72.81, 18.93], [72.81, 18.91]]]
      }
    ],
    "total_area_km2": 4.73,
    "model_version": "unet-resnet34-s1-v1.0"
  }
  ```

### Stage 5: Node.js Worker Integration
- Connect `services/backend-node/src/jobs/detection.worker.js` via HTTP client to `http://localhost:8000/api/v1/detection/segment`.
- Store returned WGS84 polygons in PostgreSQL using `ST_GeomFromGeoJSON()`.

---

## 5. Verification & Validation Protocol
1. **Rasterio GeoTIFF Test**: Verify that a sample SAR raster is read with correct spatial extent and CRS.
2. **PyTorch Inference Test**: Verify forward pass execution and tensor shape $(1, 1, 512, 512) \rightarrow (1, 1, 512, 512)$.
3. **Polygonization Accuracy Test**: Verify that synthetic test masks generate valid closed WGS84 GeoJSON polygons with non-zero surface area.
4. **End-to-End Smoke Test**: Dispatch job from React UI $\rightarrow$ Node.js BullMQ $\rightarrow$ FastAPI Python Detection $\rightarrow$ PostGIS $\rightarrow$ React Leaflet visualization.
