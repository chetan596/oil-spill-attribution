# Phase 15.2 — Final TIFF Visual Preview Enhancement Report

**Date:** 2026-09-21  
**Status:** COMPLETE  
**Component:** Derived TIFF Visual Preview & Frontend Scientific Representation  
**Scope:** `services/ml-python`, `services/backend-node`, `apps/web`  

---

## 1. Executive Summary & Root Cause Analysis

### The Problem
In earlier phases, users uploading scientific single-channel rasters such as:
```text
00051_segmentation.tif (2048 x 2048, uint8, single-channel)
```
observed an almost pitch-black image in the Manual Analysis preview pane, despite the image containing over 1,140,000 valid foreground pixels.

### Forensic Investigation & Root Cause
Inspection of `00051_segmentation.tif` revealed:
- **Array shape:** $(2048, 2048)$
- **Data type:** `uint8`
- **Unique pixel values:** `{0, 1}`
- **Frequency distribution:**
  - Background (`0`): 3,050,454 pixels (72.73%)
  - Foreground (`1`): 1,143,850 pixels (27.27%)

Under prior naive rendering logic (`normalize_channel_to_uint8`), any raster already of type `uint8` was passed directly without contrast enhancement or dynamic range stretching. Consequently:
$$\text{display\_value} = 1 \implies \frac{1}{255} \approx 0.39\% \text{ brightness}$$
In standard 8-bit sRGB monitors, `#010101` is visually indistinguishable from `#000000` (pure black).

### Phase 15.2 Solution
Phase 15.2 introduces **Forensic Pixel Statistics** and **Deterministic Display Normalization** for visual previews:
- Calculated strictly for derived PNG preview generation.
- **NEVER** alters source TIFF bytes, raw pixel values, CRS, affine transforms, nodata values, model weights, checkpoints, or inference routing.
- Automatically maps binary mask `{0, 1}` foreground to `255` (pure white, `#FFFFFF`), rendering foreground slicks sharply visible.

---

## 2. Forensic Pixel Statistics (`compute_pixel_display_stats`)

Implemented in `services/ml-python/app/preprocessing/tiff_preview.py`:
- Filters out nodata, `NaN`, `+Inf`, and `-Inf` prior to statistical calculation.
- Computes comprehensive metrics:
  - `min`, `max`, `mean`, `median`
  - Percentiles: `p01`, `p02`, `p05`, `p50`, `p95`, `p98`, `p99`
  - `uniqueValueCount` & sampled `uniqueValues`
  - Classification flags: `isConstant`, `isBinary`, `isNearBinary`, `isLowDynamicRange`

### Deterministic Binary Detection Rule
To prevent misclassifying arbitrary 2-value continuous rasters as masks, a raster is classified as `isBinary = True` only when:
1. `unique_value_count == 2`
2. Values are discrete and standard mask pairings (`{0, 1}`, `{0, 255}`, `{1, 2}`), or separated with clear background/foreground disparity where the lower value acts as background.

### Deterministic Near-Binary Detection Rule
A raster is classified as `isNearBinary = True` when:
- $>99\%$ of valid pixels belong to $\le 2$ dominant values, allowing slight compression or interpolation noise to be detected and properly normalized as mask visualization.

### Constant Raster Handling
When $min == max$ or $unique\_value\_count == 1$:
- Display value is mapped to neutral gray (`128`) across all valid pixels.
- Tagged with `normalization: "CONSTANT"`, `representation: "GRAYSCALE"`.
- Prevents misleading completely black screens for empty or zero-filled rasters.

---

## 3. Normalization Strategies & Preview Representation

| Raster Profile | Normalization Rule | Output Value Range | Representation |
| :--- | :--- | :--- | :--- |
| **Binary Mask (`{0, 1}`)** | `BINARY` (0 $\rightarrow$ 0, 1 $\rightarrow$ 255) | `[0, 255]` | `BINARY_MASK` |
| **Binary Mask (`{0, 255}`)** | `BINARY` (0 $\rightarrow$ 0, 255 $\rightarrow$ 255) | `[0, 255]` | `BINARY_MASK` |
| **Constant ($min == max$)** | `CONSTANT` (all valid $\rightarrow$ 128) | `128` | `GRAYSCALE` |
| **Low Dynamic Range uint8** | `PERCENTILE_STRETCH` ($P_{02} \rightarrow 0, P_{98} \rightarrow 255$) | `[0, 255]` | `GRAYSCALE` |
| **uint16 Grayscale** | `PERCENTILE_STRETCH` ($P_{02} \rightarrow 0, P_{98} \rightarrow 255$) | `[0, 255]` | `GRAYSCALE` |
| **float32 Grayscale (incl. NaN/Inf)** | `PERCENTILE_STRETCH` on valid finite values | `[0, 255]` | `GRAYSCALE` |
| **Standard 3-channel RGB** | `DIRECT` (genuine optical RGB) | `[0, 255]` | `RGB` |
| **Sentinel-2 6-Band L2A** | True-Color extraction ($B4 \rightarrow R, B3 \rightarrow G, B2 \rightarrow B$) | `[0, 255]` | `SENTINEL2_TRUE_COLOR` |
| **2-Channel TIFF** | Fail-closed independent channel previews | `[0, 255]` | `CHANNEL_1`, `CHANNEL_2` |

---

## 4. Node.js Backend & Orchestrator Integration

In `services/backend-node/src/manual-analysis/manual-analysis.service.js`:
- Ingests Python TIFF inspection payload containing `displayStats`, `preview`, `representation`, `normalization`, `isSegmentationLike`, `rasterTypeHint`.
- Persists all metadata in `analysisJob.payload` and returns it in `POST /api/v1/manual-analysis/upload` response.
- Preserves existing inference guard: Single-channel and dual-channel TIFFs are rejected at `POST /analyze` with HTTP 400 `UNSUPPORTED_INPUT`.

---

## 5. Frontend Visual Presentation (`apps/web`)

In `apps/web/src/pages/ManualAnalysis.jsx`:
- **Visualization Only Banner:** Explicitly warns: `VISUALIZATION ONLY: Derived PNG preview • Original TIFF preserved`.
- **Badges:**
  - Representation: `BINARY MASK`, `GRAYSCALE`, `RGB`, or `SENTINEL-2 TRUE COLOR`.
  - Normalization: `Binary stretch`, `2–98% contrast stretch`, or `Direct RGB`.
  - Source: `Original TIFF`.
  - Inference: `Not executed — 1-channel raster` (for single-channel rasters).
  - Mask Hint: `Detected raster type: MASK-LIKE / VISUALIZATION (Not Ground Truth)` (strictly avoids unauthorized "GROUND TRUTH" claims).
- **Expandable Image Display Information Section:**
  - Displays formatted grid:
    - Pixel Range: `0 – 1`
    - Unique Values: `2`
    - Mean: `0.2727`
    - Median: `0`
    - P02: `0`
    - P98: `1`
    - Representation: `BINARY MASK`
    - Normalization: `BINARY`

---

## 6. Test Suite & Verification Results

### Python Test Suite (`tests/phase15/`)
All 65 tests passed with zero failures:
```text
tests/phase15/test_phase15_1_runtime.py .......... PASSED [11/11]
tests/phase15/test_phase15_2_preview_enhancement.py .......... PASSED [18/18]
tests/phase15/test_phase15_tiff_geospatial.py .......... PASSED [36/36]

======================= 65 passed, 67 warnings in 7.55s =======================
```

### Live API Verification with `00051_segmentation.tif`
Executed against live services (`uvicorn` port 8000, Node backend port 4000):
```text
Upload Status: 201
Job ID: 8a108127-d668-483f-858b-f3a4d18cd0cd
Preview Metadata: {'format': 'PNG', 'purpose': 'VISUALIZATION_ONLY', 'representation': 'BINARY_MASK', 'normalization': 'BINARY', 'source': 'ORIGINAL_TIFF', 'isSegmentationLike': True, 'rasterTypeHint': 'SEGMENTATION / MASK-LIKE RASTER'}
Display Stats: {'min': 0, 'max': 1, 'mean': 0.2727, 'median': 0, 'p01': 0, 'p02': 0, 'p05': 0, 'p50': 0, 'p95': 1, 'p98': 1, 'p99': 1, 'uniqueValueCount': 2, 'uniqueValues': [0, 1], 'isConstant': False, 'isBinary': True, 'isNearBinary': False, 'isLowDynamicRange': False}
Preview Status: 200, Content-Type: image/png
Preview PNG Shape: (1024, 1024), Min: 0, Max: 255, Foreground px: 259887
Analyze Status: 400
Analyze Response: {"success":false,"data":null,"error":{"code":"UNSUPPORTED_INPUT","message":"UNSUPPORTED INPUT: This TIFF contains 1 grayscale channel. The current optical RGB production models require a genuine 3-channel RGB image. AI inference is not executed.","details":{}}}

ALL LIVE API VERIFICATION CHECKS PASSED SUCCESSFULLY!
```

### Frontend Build Verification
`npm run build` in `apps/web`:
```text
vite v5.4.21 building for production...
✓ 1669 modules transformed.
dist/index.html                     1.27 kB
dist/assets/index-CLa1ZYws.css     16.05 kB
dist/assets/index-DX0AdROt.js   1,081.67 kB
✓ built in 5.57s (0 errors)
```

### Model Invariance & Regression Safety
- **KERF Drone Benchmark:** 16,516 px (10.4208%), 2 components preserved.
- **MADOS Satellite RGB Benchmark:** 0 px (0.0000%), 0 components preserved.
- **Checkpoints Modified:** None (NO).
- **New Models Downloaded:** None (NO).
- **Training Started:** None (NO).

---

## 7. Operational Limitations
1. Single-channel TIFF files remain strictly visualization-only; they cannot be submitted to the 3-channel optical RGB model (`HTTP 400 UNSUPPORTED_INPUT`).
2. Two-channel TIFFs generate dual independent previews and remain rejected for optical RGB inference.
3. Mask classifications are visualization hints (`MASK-LIKE / VISUALIZATION`) and must never be cited as verified ground truth without human analyst certification.
