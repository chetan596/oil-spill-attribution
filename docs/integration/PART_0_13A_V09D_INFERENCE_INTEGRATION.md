# PART 0.13A — V09D INFERENCE SERVICE INTEGRATION REPORT

**Release:** `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Model Identifier:** `unet-dual-pol-sar-v09d-residual-loss` (V09D)  
**Status:** `EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS`  
**Integration Scope:** Python FastAPI Inference Service (`services/ml-python/app/`)  
**Audit Date:** September 2026  

---

## 1. Executive Summary

In Part 0.13A, the frozen Ocean Guard AI research release candidate **V09D** (`unet-dual-pol-sar-v09d-residual-loss`) from `OG-SAR-ML-RESEARCH-RELEASE-V0.12` was integrated into the active Python ML service without modifying or mutating any frozen research weights, manifests, or benchmark artifacts.

The integration establishes an authoritative, cryptographically verified, fail-closed model loading pathway and exposes full-scene inference with Hann-window spatial blending through the existing FastAPI service architecture.

---

## 2. Frozen Model Specifications & Verification

### 2.1 Model Registry & Manifest
The model loader references `ml/model_registry/frozen_release_manifest.json` and `ml/model_registry/registry.json`.

- **Architecture:** `UNetResidual` (`Residual U-Net`)
- **Parameters:** `1,114,338`
- **Input Channels:** `2` (VV, VH)
- **Checkpoint Location:** `ml/model_registry/versions/unet_dual_pol_sar_v09d_residual_loss.pth`
- **Expected SHA-256:** `ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d`

### 2.2 Authoritative Fail-Closed Verification
Implemented in `services/ml-python/app/models/registry.py` via `load_verified_model()`:
1. **File Existence Check:** Validates checkpoint presence on disk.
2. **Cryptographic Checksum Verification:** Computes SHA-256 hash over checkpoint binary bytes and verifies exact match against `ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d`.
3. **Architecture Verification:** Ensures class instantiation is strictly `UNetResidual` with `in_channels=2, out_channels=1`.
4. **Parameter Count Audit:** Counts exact total trainable and non-trainable parameters ($1,114,338$).
5. **State Dict Loading:** Loads weights in `eval()` mode.

If any check fails, the loader immediately raises `ModelVerificationError` (Fail-Closed). It **never** silently falls back to random weights, demo data, or uninitialized baselines.

---

## 3. Preprocessing Protocol

The service adheres strictly to the frozen research standard:

- **Pipeline Name:** `sentinel1_sigma0_db_v1`
- **VV Normalization:** $\sigma^0_{\text{VV}} \in [-35.0 \text{ dB}, -5.0 \text{ dB}] \to [0.0, 1.0]$
- **VH Normalization:** $\sigma^0_{\text{VH}} \in [-45.0 \text{ dB}, -15.0 \text{ dB}] \to [0.0, 1.0]$
- **Formulas:**
  $$\text{VV}_{\text{norm}} = \text{clip}\left(\frac{\sigma^0_{\text{VV}} - (-35.0)}{-5.0 - (-35.0)}, 0.0, 1.0\right)$$
  $$\text{VH}_{\text{norm}} = \text{clip}\left(\frac{\sigma^0_{\text{VH}} - (-45.0)}{-15.0 - (-45.0)}, 0.0, 1.0\right)$$
- **Non-Finite Handling:** Replaces `NaN` and `Inf` with minimum dB values before scaling.
- **Channel Order:** Strict `[C, H, W]` where `C[0] = VV`, `C[1] = VH`.

---

## 4. Input Validation & Fail-Closed Safeguards

Input validation in `services/ml-python/app/inference/v09d_engine.py` enforces:
1. **Channel Count:** Enforces dual-pol $(2, H, W)$ or allows single-band VV replication with warnings.
2. **Optical / RGB Imagery Rejection:** Computes inter-channel chromatic divergence. If visual RGB photography is supplied instead of radar amplitude, the engine throws an explicit `422 Unprocessable Entity` ("Optical RGB imagery is not supported; dual-pol SAR (VV/VH) required").
3. **Spatial Dimension:** Rejects rasters smaller than 32x32 pixels.
4. **Geospatial Reference:** Checks affine transform and coordinate reference system (CRS).

---

## 5. Full-Scene Inference Engine

Implemented in `services/ml-python/app/inference/v09d_engine.py`:
- **Tile Dimension:** $512 \times 512$
- **Stride:** $448$ pixels (64-pixel overlap)
- **Window Blending:** 2D separable Hann window function:
  $$w(x, y) = \sin^2\left(\frac{\pi x}{W}\right) \cdot \sin^2\left(\frac{\pi y}{H}\right)$$
- **Accumulation:** Accumulates weighted probabilities and normalizes by total overlap weight per pixel.
- **Operating Threshold:** Pre-registered fixed value $0.50$ (no post-hoc dynamic optimization).

---

## 6. Output Contract & API Routes

### 6.1 Endpoints
1. `POST /api/v1/detection/v09d-inference`: Dedicated structured inference endpoint for V09D research release.
2. `POST /api/v1/detection/segment`: Core detection endpoint updated to support `model_id="unet-dual-pol-sar-v09d-residual-loss"`.
3. `POST /api/v1/detection/manual-analysis`: Manual analysis pipeline integrated with verified V09D loader.

### 6.2 Structured Response Schema
```json
{
  "model": {
    "id": "unet-dual-pol-sar-v09d-residual-loss",
    "release": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
    "status": "EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS",
    "checkpointSha256": "ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d",
    "architecture": "UNetResidual",
    "parameterCount": 1114338,
    "heldOutBenchmark": {
      "iou": 0.011823,
      "recall": 0.015054,
      "precision": 0.046892,
      "f1": 0.017551,
      "dataset": "Part III Sealed Held-Out Test Set"
    }
  },
  "input": {
    "sourceType": "UPLOADED_REAL_SAR",
    "polarizations": ["VV", "VH"],
    "preprocessing": "sentinel1_sigma0_db_v1",
    "shape": [2, 512, 512]
  },
  "inference": {
    "threshold": 0.50,
    "tileSize": 512,
    "stride": 448,
    "blending": "hann"
  },
  "prediction": {
    "positivePixelCount": 124,
    "estimatedAreaKm2": 0.031,
    "polygonCount": 1,
    "features": [...]
  },
  "geospatial": {
    "crs": "EPSG:4326",
    "bbox": [-122.5, 37.7, -122.3, 37.9],
    "centroid": [-122.4, 37.8]
  },
  "performance": {
    "totalDurationMs": 118.4,
    "preprocessingDurationMs": 10.2,
    "inferenceDurationMs": 76.5,
    "postprocessingDurationMs": 22.1,
    "tileCount": 1
  },
  "status": "SUCCESS"
}
```

---

## 7. Demo Data Isolation

To prevent accidental confusion between synthetic/demo scenarios and genuine radar satellite processing:
- Input sources are strictly tagged (`REAL_CDSE`, `UPLOADED_REAL_SAR`, `DEMO_FIXTURE`).
- Failures on real SAR imagery return explicit error structures and **never** fall back to pre-packaged demo scenarios.

---

## 8. Verification & Performance

### 8.1 Test Results
- **Unit Tests:** `services/ml-python/tests/unit/test_v013a_v09d_integration.py` (6 passed)
- **Integration Tests:** `services/ml-python/tests/integration/test_v09d_inference_api.py` (4 passed)
- **Full Test Suite:** 190 passed, 0 regressions.

### 8.2 Measured CPU Runtimes (512x512 Scene)
- Preprocessing: $9.8$ ms
- Neural Network Inference: $74.2$ ms
- Full-Scene Reconstruction & Blending: $12.1$ ms
- Mask Polygonization: $18.5$ ms
- Total Pipeline Latency: $114.6$ ms
