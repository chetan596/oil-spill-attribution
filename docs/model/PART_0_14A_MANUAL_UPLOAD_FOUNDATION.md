# Part 0.14A — Manual Image Upload & Preview Foundation

## 1. Overview & Objective

Part 0.14A implements the first verified stage of the **Ocean Guard AI Manual Oil Spill Image Analysis** subsystem. It delivers a robust, secure manual image ingress and preview foundation supporting four primary formats:
- **JPG**
- **JPEG**
- **PNG**
- **TIFF / TIF**

In strict accordance with Part 0.14A specifications, this phase provides the **upload, multi-layer validation, safe metadata extraction, and preview foundation**. It intentionally does **NOT** execute neural network inference or fake any segmentation or detection metrics. The explicit user action `[ ANALYZE IMAGE ]` transitions the pipeline to the `READY_FOR_ANALYSIS` state, creating a stable foundation for downstream AI analysis stages.

---

## 2. Ingress & Upload Architecture

### 2.1 File Flow
```
User (Browser Drag & Drop / File Selector)
    ↓ [Client-Side Validation: Extension, MIME, Size ≤ 50MB]
React Frontend (Apps/Web)
    ↓ POST /api/v1/manual-analysis/upload (Multipart FormData)
Node.js API (Services/Backend-Node)
    ↓ Multer Storage & Disk Isolation (data/uploads/manual/<uploadId>)
    ↓ Magic-Byte Header Deep Inspection (validateMagicBytes)
    ↓ SHA-256 Checksum Computation
    ↓ Pure Binary IFD/SOF/IHDR Metadata Extraction (extractImageMetadata)
    ↓ Prisma Persistence (Analysis + AnalysisJob)
Response: JSON Metadata with status: "READY_FOR_ANALYSIS"
    ↓
React Frontend: Side-by-Side Image Preview & File Information Panel
    ↓ User Clicks [ ANALYZE IMAGE ]
State Machine: READY_FOR_ANALYSIS (Image ready for analysis)
```

---

## 3. Supported Formats & File Validation

### 3.1 Supported File Types
| Format | Extension Whitelist | MIME Type Whitelist | Magic Bytes File Signature |
|---|---|---|---|
| **PNG** | `.png` | `image/png` | `89 50 4E 47 0D 0A 1A 0A` |
| **JPEG** | `.jpg`, `.jpeg` | `image/jpeg`, `image/pjpeg` | `FF D8 FF` |
| **TIFF (Little-Endian)** | `.tif`, `.tiff` | `image/tiff`, `image/geotiff`, `application/octet-stream` | `49 49 2A 00` (`II*\0`) |
| **TIFF (Big-Endian)** | `.tif`, `.tiff` | `image/tiff`, `image/geotiff`, `application/octet-stream` | `4D 4D 00 2A` (`MM\0*`) |

### 3.2 Dual-Layer Security & Validation
1. **Frontend Validation**:
   - Validates file extensions (`.jpg`, `.jpeg`, `.png`, `.tif`, `.tiff`).
   - Validates file size against configurable limit (default: **50 MB**).
   - Rejects unselected or unsupported files with user-friendly alerts.
2. **Backend Validation**:
   - Multer fileFilter checks extension and MIME type.
   - Enforces 50 MB hard limit.
   - **Magic Byte Inspection (`validateMagicBytes`)**: Reads initial binary header to prevent extension spoofing (e.g. renamed `.exe` files disguised as `.jpg`).
   - Returns sanitized errors (HTTP 400 for bad extension, HTTP 422 for corrupt/spoofed files) without leaking internal paths or stack traces.

---

## 4. Storage & Path Traversal Prevention

- **Server-Side Isolation**: Files are saved into randomly generated UUID subdirectories under `data/uploads/manual/<uploadId>/`.
- **Filename Sanitization**: Untrusted client-supplied paths (e.g. `../../../etc/passwd.png`) are stripped to safe basenames.
- **Untouched Original Retention**: Crucially, original TIFF rasters are stored untouched on disk with their full bit-depth and GeoTIFF tags intact for future scientific SAR pipelines.

---

## 5. Binary Metadata Extraction

Structured metadata is safely extracted using in-memory buffer inspection without external CLI dependencies:

- **Dimensions**: Extracted from PNG `IHDR` chunk, JPEG `SOF0`/`SOF2` markers, and TIFF IFD Tag 256 (`ImageWidth`) & Tag 257 (`ImageLength`).
- **Bands / Channels**: Extracted from PNG color type, JPEG components, and TIFF Tag 277 (`SamplesPerPixel`).
- **TIFF GeoKeys / CRS**:
  - Checks GeoKey Directory Tag (34735), ModelTiepointTag (33922), and ModelPixelScaleTag (33550).
  - Flags `geospatialMetadataAvailable: true`.
  - Reads ASCII projection parameters from GeoAsciiParamsTag (34737) or reports `"GeoTIFF Metadata Present"`.
- **Zero Fabrication**: When a tag or value is unavailable, it strictly reports `"NOT_AVAILABLE"`.

---

## 6. Image Preview Architecture

### 6.1 JPG / JPEG / PNG
- Displayed in the left preview canvas using client-side object URLs.
- Rendered with CSS `object-fit: contain` and strict aspect ratio preservation to prevent visual distortion.

### 6.2 TIFF Handling
- Large multi-gigabyte or multi-band GeoTIFF rasters are **NOT** forced into raw browser memory to prevent browser tab crashes.
- Identified explicitly in the UI with a `TIFF IMAGE` badge and labeled `TIFF PREVIEW`.
- Displays indexed dimension and band summary (`Width × Height px · N Band(s)`).

---

## 7. State Machine

The frontend transitions across a strict 8-state model:

```
[ IDLE ]
   ↓ (File selected / dropped)
[ VALIDATING ]
   ↓ (Client checks pass)
[ UPLOADING ]
   ↓ (Backend validates & extracts metadata)
[ VALID ] ──── (Validation failed) ──→ [ INVALID ] / [ ERROR ]
   ↓
(User clicks [ ANALYZE IMAGE ])
   ↓
[ READY_FOR_ANALYSIS ]
```

---

## 8. API Specification

### 8.1 Upload Endpoint
- **URL**: `POST /api/v1/manual-analysis/upload`
- **Content-Type**: `multipart/form-data`
- **Field**: `image` (binary)
- **Response Format (HTTP 201)**:
```json
{
  "success": true,
  "data": {
    "analysisId": "5de0669c-9acc-406c-9ce5-0b5466476209",
    "jobId": "0e60a49e-3b36-4326-b998-0b97d7085dd2",
    "filename": "sentinel1_sample.tif",
    "format": "TIFF",
    "mimeType": "image/tiff",
    "sizeBytes": 1048576,
    "width": 1024,
    "height": 1024,
    "isTiff": true,
    "bands": 2,
    "crs": "GeoTIFF Metadata Present",
    "geospatialMetadataAvailable": true,
    "status": "READY_FOR_ANALYSIS"
  },
  "error": null
}
```

### 8.2 Job Status & Polling Endpoint
- **URL**: `GET /api/v1/manual-analysis/:jobId`
- **Response Format (HTTP 200)**:
```json
{
  "success": true,
  "data": {
    "jobId": "0e60a49e-3b36-4326-b998-0b97d7085dd2",
    "analysisId": "5de0669c-9acc-406c-9ce5-0b5466476209",
    "status": "READY_FOR_ANALYSIS",
    "progress": 0,
    "stage": "READY_FOR_ANALYSIS",
    "stageMessage": "Image validated and ready for analysis.",
    "isReady": true,
    "hasResult": false,
    "metadata": {
      "filename": "sentinel1_sample.tif",
      "format": "TIFF",
      "sizeBytes": 1048576,
      "width": 1024,
      "height": 1024,
      "isTiff": true,
      "bands": 2,
      "crs": "GeoTIFF Metadata Present",
      "geospatialMetadataAvailable": true
    },
    "createdAt": "2026-09-20T02:22:00.000Z",
    "updatedAt": "2026-09-20T02:22:00.000Z"
  },
  "error": null
}
```

---

## 9. Verification & Test Suite

### 9.1 Backend Integration & Security Tests
**Test File**: `services/backend-node/tests/integration/manual_upload.test.js`
- Valid PNG upload & metadata: **PASS**
- Valid JPG / JPEG upload & metadata: **PASS**
- Valid Little-Endian TIFF with GeoKeys: **PASS**
- Valid Big-Endian TIFF: **PASS**
- Unsupported `.exe` extension rejection: **PASS**
- Renamed executable magic-byte rejection: **PASS**
- Corrupted byte buffer rejection: **PASS**
- Missing file payload handling: **PASS**
- Path traversal defense: **PASS**
- Polling status `READY_FOR_ANALYSIS`: **PASS**

### 9.2 Regression Integrity
- Backend Node Test Suite: **126 / 126 PASS**
- Python ML Test Baseline (Parts 0.13A–0.13H): **244 / 244 PASS**
- Frontend Web Production Build: **0 Errors (Vite Build PASS)**

---

## 10. Future Integration Point: READY_FOR_ANALYSIS
In subsequent parts, clicking `[ ANALYZE IMAGE ]` will trigger SAR radiometric preprocessing, dual-pol U-Net inference, and forensic spill segmentation. Part 0.14A guarantees that incoming raster payloads and metadata are pre-validated, SHA-256 indexed, and isolated before any model execution occurs.
