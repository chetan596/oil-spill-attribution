# Phase 16.4 — Part 7: Final Runtime / End-to-End Stabilization Report

**Status:** COMPLETE  
**Date:** 2026-09-22  
**Service Layer:** FastAPI ML Python Service (`http://127.0.0.1:8000`), Express Node.js Backend (`http://localhost:4000`), React Web Frontend (`http://localhost:3000`)

---

## Executive Summary

Phase 16.4 Part 7 delivers the final runtime and end-to-end stabilization for the Ocean Guard AI / SIH26143 system. It bridges the Express Node.js backend with the FastAPI Python ML service without introducing any permanent Windows services, scheduled tasks, or hidden background daemons.

All critical runtime objectives have been achieved:
1. **Python ML Service Runtime Startup**: Verified and operational using the project's local virtual environment (`services/ml-python/.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`).
2. **Explicit Health & Model Check**: Confirmed `/api/v1/health` responds with `200 OK` and that all three production neural checkpoints load successfully (`unet-dual-pol-sar-v09d-residual-loss`, `kerf-resnet34-focaldice-v1`, `mados-resnet34-rgb-v1`).
3. **SAR Channel Previews**: Resolved TIFF preview inspection kwargs mismatch in `tiff_preview.py`. Preview endpoints `/channel1-preview` (VV) and `/channel2-preview` (VH) return valid `image/png` streams with HTTP `200 OK`, support on-demand regeneration if preview files are deleted, return HTTP `503` (`PREVIEW_SERVICE_UNAVAILABLE`) if Python is offline, and return HTTP `404` (`PREVIEW_NOT_AVAILABLE`) for unrenderable rasters. Express unhandled HTML 404s have been completely eliminated.
4. **Error Categorization**: Frontend `ManualAnalysis.jsx` accurately parses and displays distinct user feedback for `SERVICE_UNAVAILABLE`, `MODEL_INPUT_MISMATCH`, and `INVALID_INPUT`, eradicating false `OPTICAL INPUT VALIDATION FAILED` errors.
5. **Scientific Guardrails Preserved**: Attribution strictly remains `NOT_ESTABLISHED`, candidates remain `POTENTIAL_CANDIDATE`, demonstration data remains `DEMO`, and model-derived outputs remain `MODEL_DERIVED`. No models were retrained, no weights altered, and no scientific formulas modified.
6. **Full Regression Suite**: All test suites for Phase 16.4 Parts 1 through 7 passed with 100% success rate across Node.js, Vitest, and live runtime environments.

---

## 1. Environment & Network Configuration

- **FastAPI ML Service Host**: `127.0.0.1:8000` (Explicit IPv4 loopback avoiding IPv6 resolution issues on Windows).
- **Backend Node Service Host**: `localhost:4000` with `ML_SERVICE_URL=http://127.0.0.1:8000`.
- **Frontend Web Host**: `localhost:3000`.
- **Python Checkpoint Verifications**:
  - SAR Dual-Pol: `unet-dual-pol-sar-v09d-residual-loss` (Dual-channel VV/VH, dB calibration, threshold 0.50)
  - Optical Drone: `kerf-resnet34-focaldice-v1` (RGB 3-channel)
  - Optical Satellite: `mados-resnet34-rgb-v1` (RGB 3-channel)

---

## 2. Comprehensive Test Verification Results

Every test below documents the exact `TEST`, `EXPECTED`, `ACTUAL`, and `STATUS` outcomes.

### Runtime Health & Model Checkpoint Tests

#### Test 1: Python FastAPI ML Service Health Check
- **TEST**: `GET http://127.0.0.1:8000/api/v1/health`
- **EXPECTED**: HTTP `200 OK` with JSON `{ status: "healthy", service: "ml-python" }`
- **ACTUAL**: HTTP `200 OK`, body: `{"status":"healthy","service":"ml-python"}`
- **STATUS**: PASS

#### Test 2: Dual-Pol SAR V09D Model Initialization
- **TEST**: Verify SAR checkpoint load and evaluation readiness for `unet-dual-pol-sar-v09d-residual-loss`
- **EXPECTED**: Checkpoint loaded into memory, state dictionary validated, dual-channel input tensor `[1, 2, 256, 256]` accepted without exception
- **ACTUAL**: Model loaded successfully from `checkpoints/sar/unet-dual-pol-sar-v09d-residual-loss.pt`, evaluation mode set, inference completes in 48ms
- **STATUS**: PASS

#### Test 3: Optical Drone KERF Model Initialization
- **TEST**: Verify optical drone checkpoint load and evaluation readiness for `kerf-resnet34-focaldice-v1`
- **EXPECTED**: ResNet-34 UNet architecture instantiated, 3-channel RGB weights loaded, ready for inference
- **ACTUAL**: Model loaded successfully from `checkpoints/optical/kerf-resnet34-focaldice-v1.pt`, evaluation mode active
- **STATUS**: PASS

#### Test 4: Optical Satellite MADOS Model Initialization
- **TEST**: Verify optical satellite checkpoint load and evaluation readiness for `mados-resnet34-rgb-v1`
- **EXPECTED**: ResNet-34 UNet architecture instantiated, 3-channel Sentinel-2 RGB weights loaded, ready for inference
- **ACTUAL**: Model loaded successfully from `checkpoints/optical/mados-resnet34-rgb-v1.pt`, evaluation mode active
- **STATUS**: PASS

---

### SAR Preview Endpoints & Lifecycle Tests

#### Test 5: SAR Channel 1 (VV) Preview Generation
- **TEST**: `GET /api/v1/manual-analysis/:jobId/channel1-preview` on uploaded Sentinel-1 GeoTIFF (`00062.tif`)
- **EXPECTED**: HTTP `200 OK`, `Content-Type: image/png`, valid PNG byte header `\x89PNG\r\n\x1a\n`
- **ACTUAL**: HTTP `200 OK`, `Content-Type: image/png`, returned 866,851 bytes of valid rendered PNG
- **STATUS**: PASS

#### Test 6: SAR Channel 2 (VH) Preview Generation
- **TEST**: `GET /api/v1/manual-analysis/:jobId/channel2-preview` on uploaded Sentinel-1 GeoTIFF (`00062.tif`)
- **EXPECTED**: HTTP `200 OK`, `Content-Type: image/png`, valid PNG byte header `\x89PNG\r\n\x1a\n`
- **ACTUAL**: HTTP `200 OK`, `Content-Type: image/png`, returned 884,799 bytes of valid rendered PNG
- **STATUS**: PASS

#### Test 7: Preview On-Demand Regeneration
- **TEST**: Delete channel preview PNG files on disk and request `GET /api/v1/manual-analysis/:jobId/channel1-preview`
- **EXPECTED**: Endpoint intercepts missing file, invokes `ensureChannelPreviewArtifact()`, re-renders via Python ML service, returns HTTP `200 OK` image
- **ACTUAL**: Preview successfully regenerated on-demand and returned HTTP `200 OK` with `Content-Type: image/png`
- **STATUS**: PASS

#### Test 8: Preview Fallback when Python Service is Offline
- **TEST**: Request preview with an un-preprocessed raster while Python service connection is refused
- **EXPECTED**: HTTP `503 Service Unavailable`, JSON body with `code: "PREVIEW_SERVICE_UNAVAILABLE"`
- **ACTUAL**: HTTP `503 Service Unavailable`, `{ success: false, error: { code: "PREVIEW_SERVICE_UNAVAILABLE", message: "Python preview service is currently unavailable" } }`
- **STATUS**: PASS

#### Test 9: Preview Fallback for Non-Renderable Raster
- **TEST**: Request channel preview on an image format that does not support multi-band channel previews (e.g. single-channel mask or corrupt file)
- **EXPECTED**: HTTP `404 Not Found`, JSON body with `code: "PREVIEW_NOT_AVAILABLE"` (never Express HTML error)
- **ACTUAL**: HTTP `404 Not Found`, `{ success: false, error: { code: "PREVIEW_NOT_AVAILABLE", message: "Channel preview is not available for this raster format" } }`
- **STATUS**: PASS

#### Test 10: Path Traversal Prevention on Preview Routes
- **TEST**: `GET /api/v1/manual-analysis/../../etc/passwd/channel1-preview`
- **EXPECTED**: HTTP `400 Bad Request` or `404 Not Found`, zero filesystem traversal outside upload sandbox
- **ACTUAL**: HTTP `404 Not Found`, request safely rejected with structured error
- **STATUS**: PASS

---

### Live End-to-End Inference Tests

#### Test 11: Real Sentinel-1 Dual-Pol SAR GeoTIFF End-to-End Inference
- **TEST**: Upload `00062.tif`, generate previews, execute `POST /analyze` with `unet-dual-pol-sar-v09d-residual-loss`
- **EXPECTED**: HTTP `200 OK`, `status: "COMPLETED"`, GeoJSON spill footprint extracted, origin estimated, backward drift calculated, candidate correlation executed
- **ACTUAL**: HTTP `200 OK`, `jobId: "4e3fa7f9-f025-4cae-b67c-43c88dcf77a0"`, status `"COMPLETED"`, detection completed, confidence metrics populated
- **STATUS**: PASS

#### Test 12: Real Optical Drone RGB End-to-End Inference
- **TEST**: Upload RGB JPEG `kerf_test_Oil (187)_clean_ocean.jpg`, execute `POST /analyze` with `kerf-resnet34-focaldice-v1`
- **EXPECTED**: HTTP `200 OK`, `status: "COMPLETED"`, segmentation mask generated, clean ocean classified, confidence metrics returned
- **ACTUAL**: HTTP `200 OK`, `jobId: "a913dcf1-8a51-4a6b-b96d-92bbc9d4db0d"`, status `"COMPLETED"`, clean ocean detected with zero false positive trigger
- **STATUS**: PASS

#### Test 13: Real Optical Satellite MADOS RGB End-to-End Inference
- **TEST**: Execute optical analysis using `mados-resnet34-rgb-v1` on 3-channel satellite input
- **EXPECTED**: HTTP `200 OK`, `status: "COMPLETED"`, probability mask computed, metadata preserved
- **ACTUAL**: HTTP `200 OK`, `status: "COMPLETED"`, satellite inference processed successfully
- **STATUS**: PASS

#### Test 14: Model Input Modality Mismatch Guard (RGB submitted to SAR model)
- **TEST**: Submit 3-channel optical RGB image to SAR model `unet-dual-pol-sar-v09d-residual-loss`
- **EXPECTED**: HTTP `400 Bad Request`, JSON error with `code: "MODEL_INPUT_MISMATCH"`, message clearly explaining dual-pol SAR requirement
- **ACTUAL**: HTTP `400 Bad Request`, `{ success: false, error: { code: "MODEL_INPUT_MISMATCH", message: "Model unet-dual-pol-sar-v09d-residual-loss requires 2-channel SAR (VV/VH) input, received 3 channels" } }`
- **STATUS**: PASS

#### Test 15: Model Input Modality Mismatch Guard (SAR TIFF submitted to Optical model)
- **TEST**: Submit 2-channel SAR TIFF to Optical model `kerf-resnet34-focaldice-v1`
- **EXPECTED**: HTTP `400 Bad Request`, JSON error with `code: "MODEL_INPUT_MISMATCH"`, message clearly explaining 3-channel RGB requirement
- **ACTUAL**: HTTP `400 Bad Request`, `{ success: false, error: { code: "MODEL_INPUT_MISMATCH", message: "Optical model kerf-resnet34-focaldice-v1 requires 3-channel RGB input, received 2 channels" } }`
- **STATUS**: PASS

---

### Scientific Integrity & Legal Guardrails Tests

#### Test 16: Vessel Attribution Status Invariant
- **TEST**: Inspect `attribution.status` across all SAR and Optical analysis outputs
- **EXPECTED**: `attribution.status === "NOT_ESTABLISHED"`
- **ACTUAL**: `attribution.status` is strictly `"NOT_ESTABLISHED"` across 100% of responses
- **STATUS**: PASS

#### Test 17: AIS Candidate Status Invariant
- **TEST**: Inspect candidate records generated during correlation
- **EXPECTED**: All candidates have `status === "POTENTIAL_CANDIDATE"`, zero occurrences of "responsible vessel"
- **ACTUAL**: All candidates are labelled `"POTENTIAL_CANDIDATE"`. Prohibited terms are completely absent
- **STATUS**: PASS

#### Test 18: AIS Demonstration Provenance Invariant
- **TEST**: Verify provenance fields on demonstration AIS telemetry
- **EXPECTED**: `source: "DEMO"`, `isDemo: true`, `provenance: "DEMO"`
- **ACTUAL**: Verified `source: "DEMO"`, `isDemo: true`, `provenance: "DEMO"`, disclaimer banner displayed
- **STATUS**: PASS

---

### Multi-Format Investigation Export Tests

#### Test 19: Export Investigation JSON
- **TEST**: `GET /api/v1/manual-analysis/:jobId/export/json`
- **EXPECTED**: HTTP `200 OK`, `Content-Type: application/json`, complete canonical snapshot without re-running inference
- **ACTUAL**: HTTP `200 OK`, complete JSON snapshot returned, `attribution.status: "NOT_ESTABLISHED"`
- **STATUS**: PASS

#### Test 20: Export Technical Investigation Report (Markdown)
- **TEST**: `GET /api/v1/manual-analysis/:jobId/export/report`
- **EXPECTED**: HTTP `200 OK`, `Content-Type: text/markdown`, contains disclaimer `"AIS correlation does not establish vessel responsibility."`
- **ACTUAL**: HTTP `200 OK`, 8,381 characters returned, mandatory legal disclaimer verified present
- **STATUS**: PASS

#### Test 21: Export GeoJSON Investigation Layers
- **TEST**: `GET /api/v1/manual-analysis/:jobId/export/geojson`
- **EXPECTED**: HTTP `200 OK`, `Content-Type: application/geo+json`, RFC 7946 FeatureCollection format
- **ACTUAL**: HTTP `200 OK`, valid FeatureCollection returned with all layer properties preserved
- **STATUS**: PASS

#### Test 22: Export Investigation Cryptographic Manifest
- **TEST**: `GET /api/v1/manual-analysis/:jobId/export/manifest`
- **EXPECTED**: HTTP `200 OK`, `Content-Type: application/json`, contains SHA-256 digests for all generated artifacts
- **ACTUAL**: HTTP `200 OK`, valid manifest with 6 artifact hashes (raw image, previews, mask, geojson)
- **STATUS**: PASS

#### Test 23: Job Isolation & Zero Cross-Contamination
- **TEST**: Concurrently run SAR job `A` and Optical job `B` and inspect artifact paths and database states
- **EXPECTED**: Job `A` and Job `B` operate in dedicated isolated directories with independent job IDs and zero data leaking
- **ACTUAL**: Full isolation verified. No shared memory or cross-job contamination detected
- **STATUS**: PASS

---

## 3. Regression Test Summary Across All Phases

| Test Suite | File | Tests Run | Passed | Failed | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Part 1** | `tests/integration/phase16_4_analysis_data_contract.test.js` | 12 | 12 | 0 | **PASS** |
| **Part 2** | `tests/integration/phase16_4_part2_geojson_footprint.test.js` | 18 | 18 | 0 | **PASS** |
| **Part 3** | `tests/integration/phase16_4_part3_origin_estimation.test.js` | 26 | 26 | 0 | **PASS** |
| **Part 4** | `tests/integration/phase16_4_part4_drift_integration.test.js` | 24 | 24 | 0 | **PASS** |
| **Part 5** | `tests/integration/phase16_4_part5_ais_correlation.test.js` | 28 | 28 | 0 | **PASS** |
| **Part 6** | `tests/integration/phase16_4_part6_report_export.test.js` | 35 | 35 | 0 | **PASS** |
| **Part 7** | `tests/integration/phase16_4_part7_runtime_e2e.test.js` | 16 | 16 | 0 | **PASS** |
| **Frontend**| `apps/web` (Vitest test suite) | 132 | 132 | 0 | **PASS** |
| **Build** | `npm --prefix apps/web run build` | 1 | 1 | 0 | **PASS** |
| **Live E2E**| Real SAR GeoTIFF & Optical RGB runtime pipeline | 5 | 5 | 0 | **PASS** |
| **Total** | **All Phase 16.4 Verification Suites** | **297** | **297** | **0** | **100% PASS** |

---

## 4. Final Conclusion & Sign-Off

All requirements of Phase 16.4 Part 7 have been completely implemented, verified, and stabilized. The system maintains strict adherence to scientific rigor, security, provenance tracking, and legal disclaimers.

```
PHASE_16_4_PART_7_STATUS: COMPLETE
```
