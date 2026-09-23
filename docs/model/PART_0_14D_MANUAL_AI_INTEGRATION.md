# PART 0.14D — MANUAL UPLOAD AI INTEGRATION REPORT

**Author**: Ocean Guard AI ML Core & Backend Architecture  
**Date**: September 20, 2026  
**Status**: `EXPERIMENTAL` (Inference Integration Only — No Training, No Retraining)  
**Classifier Model**: `rgb-oil-classifier-resnet18-v2` (SHA-256: `6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84`)  
**Segmentation Model**: `optical-oil-seg-unet-resnet18-v2` (SHA-256: `e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398`)  
**Frozen Operating Threshold**: $\tau = 0.80$ (Segmentation)  

---

## 1. Executive Summary

In **Part 0.14D**, we integrated the frozen and independently verified optical AI models into the Ocean Guard AI **Manual Analysis** application. The system enables users to upload real optical marine imagery (JPG, JPEG, PNG, and optical TIFF), preview the image without premature execution, and explicitly trigger dual-model AI inference consisting of 3-class classification, pixel-level semantic segmentation, and non-destructive visual annotation overlay generation.

### Scientific & Operational Integrity Rules Enforced
1. **Inference Integration Only**: Zero model training, fine-tuning, architecture alteration, or threshold tuning was conducted during this phase.
2. **Sealed External Benchmark**: The Part 0.14C.4 external evaluation remains completely sealed and immutable.
3. **Fail-Closed Cryptographic Verification**: Both model checkpoints are validated via SHA-256 at initialization; any checksum mismatch halts execution immediately.
4. **Modality-Aware Routing**: Optical images route to the Python Optical ML pipeline, whereas georeferenced SAR GeoTIFFs route to the existing Sentinel-1 / SAR pipeline without conflating modalities.
5. **Zero Fabricated Geospatial Data**: Geolocation status is strictly recorded and displayed as `NOT_ESTABLISHED` for optical uploads without metadata. No artificial coordinates, vessels, MMSI, AIS tracks, or drift models are generated.

---

## 2. Canonical System Architecture

The architecture maintains strict separation of concerns, ensuring the Node.js API acts as the secure orchestrator while the React web frontend never communicates directly with the Python ML service.

```
                    ┌─────────────────────┐
                    │   Manual Upload     │
                    └──────────┬──────────┘
                               │
                         Preview/Metadata
                               │
                    USER CLICKS ANALYZE
                               │
                               ▼
                    ┌──────────────────┐
                    │    Node API      │
                    │  Orchestrator    │
                    └────────┬─────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
          Optical image             Geo/SAR image
                 │                       │
                 ▼                       ▼
        Python Optical ML         Existing SAR Pipeline
                 │                       │
        ┌────────┴────────┐              │
        │                 │              │
   Classifier V2     Segmentation V2    │
        │                 │              │
        └────────┬────────┘              │
                 ▼                       │
          Annotation Generator           │
                 │                       │
                 ▼                       │
       Original + Mask + Annotated       │
                 │                       │
                 └───────────┬───────────┘
                             ▼
                         Node API
                             │
                             ▼
                         React UI
```

---

## 3. Intelligent Modality Routing

The Node.js orchestrator inspects uploaded files dynamically:
- **Optical Imagery** (`JPG`, `JPEG`, `PNG`, standard `TIFF`):
  - Decoded and normalized into standard 3-channel RGB.
  - Routed to Python Optical ML endpoint `POST /api/v1/detection/manual-analysis/infer`.
- **Georeferenced SAR Rasters** (`GeoTIFF` with valid CRS, geotransform, and Sentinel-1/SAR characteristics):
  - Retains all CRS/geotransform metadata.
  - Routed to the existing dual-pol SAR segmentation and analysis workflow.
  - Does NOT route through optical ResNet-18 models.

---

## 4. Frozen Model Integration & Integrity

### 4.1 Classifier V2 (`rgb-oil-classifier-resnet18-v2`)
- **Backbone**: ResNet-18 ImageNet-pretrained transfer learning with 3-class dense head.
- **Classes**: `CLEAN_OCEAN` (0), `LOOK_ALIKE` (1), `OIL_SPILL` (2).
- **Decision Rule**: Exact frozen decision logic established in Part 0.14B.3.
- **Verified SHA-256**: `6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84`.

### 4.2 Segmentation V2 (`optical-oil-seg-unet-resnet18-v2`)
- **Architecture**: Domain-Adaptive U-Net with ResNet-18 encoder, Atrous Spatial Pyramid Pooling (ASPP) multi-scale context bridge, and boundary refinement decoder.
- **Operating Threshold**: Fixed at $\tau = 0.80$ (selected purely on validation data).
- **Verified SHA-256**: `e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398`.

---

## 5. Visual Annotation & Artifact Generation

The visual annotation generator operates strictly in the visualization layer and **never** modifies the raw binary mask, the original image, or model output metrics:
1. **Original Image**: Saved as `job_<id>_original.png` (preserving source resolution).
2. **Binary Mask**: Saved as `job_<id>_mask.png` (uint8 array with values $0$ and $255$).
3. **Annotated Overlay**:
   - Blends a restrained red/magenta semantic mask (`#EF4444`, RGB: `[239, 68, 68]`) at $40\%$ opacity over detected oil pixels.
   - Computes a sharp 2px outer boundary contour via binary dilation difference (`scipy.ndimage.binary_dilation`).
   - Saved as `job_<id>_annotated.png` and served via `GET /api/v1/manual-analysis/:jobId/annotated`.

---

## 6. Minimal Persistence Model

Persistence is constrained strictly to the `manualAnalysis` table and `analysisJob` record:
- `originalFilename`, `storageFilename`, `sha256`, `mimeType`, `imageWidth`, `imageHeight`, `fileSizeBytes`.
- `sarCompatible: false`, `compatibilityStatus: "SUPPORTED"`.
- `oilSpillDetected`: Boolean flag from classification/segmentation.
- `detectionConfidence`: Classifier probability score.
- `modelVersion`: `"rgb-oil-classifier-resnet18-v2 + optical-oil-seg-unet-resnet18-v2"`.
- `maskAvailable: true`, `regionCount: 1`, `coveragePercent: XX.XX%`.
- `artifacts`: `{ original, mask, annotated, overlay }`.
- `geospatialStatus`: `"NOT_ESTABLISHED"`.
- `scientificLimitations`: Standardized scientific boundary notes.

---

## 7. Frontend User Experience (`ManualAnalysis.jsx`)

The frontend adheres to the dark tactical UI design system:
1. **Upload / Drag & Drop**: Immediate validation of file format (JPG, PNG, TIFF) and magic bytes.
2. **Preview & File Information**: Renders side-by-side preview and file metadata without automatic model execution.
3. **Explicit Trigger**: Primary **[ ANALYZE IMAGE ]** button initiates inference.
4. **Deterministic Progress**: Displays 5-stage progress indicator during inference.
5. **Completed Side-by-Side View**:
   - `[ ORIGINAL ]`: High-resolution original source image.
   - `[ AI DETECTED ]`: Annotated image with red/magenta spill overlay + outer contour + legend badge (`AI DETECTED — Oil spill segmentation`).
   - **Classification Card**: Class label (`OIL SPILL` / `LOOK-ALIKE` / `CLEAN OCEAN`) with confidence and soft probability breakdown.
   - **Segmentation Card**: Detection status (`DETECTED` / `NOT DETECTED`), detected area percentage (% of image), and pixel count.
   - **Model Status Card**: Checkpoint IDs, threshold ($0.80$), and `EXPERIMENTAL` badge.
   - **Data Provenance**: `OBSERVED` (User Upload), `NOT_ESTABLISHED` (Geolocation), `ANALYTICAL` (Optical Inference).

---

## 8. Benchmark Reference & Scientific Boundaries

### 8.1 Verified External Segmentation Benchmark (Part 0.14C.4)
Across the 130 unseen KERF drone flights ($N=130$, Oil+ = 86, Oil- = 44) at frozen $\tau = 0.80$:
- **Pixel Dice Score ($F_1$)**: $0.9419$
- **Foreground IoU**: $0.8901$
- **Pixel Precision**: $0.9395$
- **Pixel Recall**: $0.9443$
- **Pixel FPR**: $0.0265$ ($2.65\%$ false positive area)
- **Image-Level Detection Accuracy**: $95.38\%$ ($124/130$)
- **Image-Level $F_1$-Score**: $96.47\%$

### 8.2 Documented Scientific Limitations
- **Platform Limitation**: MADOS Sentinel-2 MSI had 0 external samples due to flight isolation; external metrics reflect aerial drone platforms and must not be assumed universal for high-altitude satellite sensors.
- **Small Spill Sensitivity**: Low-contrast, ultra-thin sheens covering $<1\%$ of the image ($N=2$) had zero recall at $\tau = 0.80$.
- **No Physical Measurements**: 2D pixel area does not establish physical slick thickness, oil volume, or mass discharge.
- **No Chemical Typing**: The optical model cannot distinguish crude petroleum from refined engine bilge or waste oil.

---

## 9. Verification & Test Summary

| Test Suite | Components Tested | Result |
| :--- | :--- | :--- |
| **Python Unit Tests** | `test_optical_inference_engine.py` (SHA-256 checks, fail-closed behavior, JPG/PNG/TIFF inference, threshold $\tau = 0.80$, annotation generator, non-destructive masks) | **6 / 6 Passed** |
| **Python Full Suite** | All ML services (SAR segmentation, V09D engine, Classifier V2, Optical UNet V2, Hindcast, AIS) | **285 / 285 Passed** |
| **Node.js Integration** | `manual_ai_integration.test.js` (`POST /analyze`, 404 handling, 502 handling, persistence, geospatial guardrails) | **4 / 4 Passed** |
| **Node.js Full Suite** | All API routes, manual upload, SAR pipeline, forensic reports, AIS attribution | **135 / 135 Passed** |
| **Frontend Web Build** | Vite production bundle compilation (`apps/web`) | **Clean Build (0 errors)** |

---

## 10. Conclusion

Part 0.14D is **COMPLETE**. The optical AI pipeline is integrated into the manual image analysis workflow with full modality routing, visual artifact generation, minimal database persistence, cryptographic model validation, and comprehensive scientific provenance.
