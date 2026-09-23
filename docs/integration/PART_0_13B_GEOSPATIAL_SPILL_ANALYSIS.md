# PART 0.13B — GEOREFERENCED SPILL ANALYSIS REPORT

**Release:** `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Model Identifier:** `unet-dual-pol-sar-v09d-residual-loss` (V09D)  
**Layer:** Post-Segmentation Geospatial Analysis Pipeline (`services/ml-python/app/postprocessing/spill_analysis.py`)  
**Audit Date:** September 2026  

---

## 1. Executive Summary

In Part 0.13B, the post-segmentation geospatial analysis layer was constructed on top of the verified Part 0.13A V09D inference service. This layer converts binary segmentation masks and probability rasters into structured, georeferenced candidate spill analysis objects.

The implementation strictly maintains scientific guardrails:
- Model status remains `EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS`.
- Detected regions are classified strictly as `CANDIDATE_DARK_FORMATION` (never `CONFIRMED_OIL_SPILL`).
- Oil volume estimation is marked `NOT_ESTABLISHED`.
- Oil chemical typing is marked `NOT_ESTABLISHED`.
- AIS vessel attribution, metocean drift modeling, and LLM synthesis remain unexecuted in this phase.

---

## 2. Input Contract & Mask Validation

The geospatial analysis module consumes inference outputs directly without recomputing neural network forward passes:
- **Binary Mask:** 2D ndarray validated strictly to contain only values in $\{0, 1\}$.
- **Probability Raster:** Optional 2D float ndarray $[0.0, 1.0]$ matching binary mask dimensions.
- **Georeferencing Metadata:** Coordinate Reference System (CRS) and Rasterio Affine Transformation matrix.
- **Provenance Metadata:** `sourceType` (`REAL_CDSE`, `UPLOADED_REAL_SAR`, or `DEMO`), `sceneId`, `acquisitionTimestamp`, `modelId`, `modelRelease`, `checkpointSha256`, `operatingThreshold`.

### Fail-Closed Validation
If binary mask values are malformed, or if dimensions between the probability raster and binary mask mismatch, or if required georeferencing is missing, `GeospatialAnalysisError` is raised immediately. No default or synthetic coordinates (e.g. Mumbai defaults) are silently injected for real satellite scenes.

---

## 3. Connected Component Analysis & Polygonization

Candidate region extraction uses 8-connectivity connected component labeling (`cv2.connectedComponentsWithStats`):
1. **Speckle Noise Filtering:** Discards components with pixel area smaller than `min_pixel_area` (default 15 pixels).
2. **Vectorization:** Vectorizes component raster masks via `rasterio.features.shapes`.
3. **Topological Validation:** Validates geometries using Shapely, repairing self-intersections with deterministic `buffer(0)` without altering detected contours.
4. **Reprojection:** Coordinates are transformed from native source CRS to WGS84 (`EPSG:4326`, Lon/Lat order) for GeoJSON serialization and to Equal-Area Cylindrical (`EPSG:6933`) for metric calculations.

---

## 4. Metric Area, Perimeter & Centroid Derivation

### 4.1 Surface Area & Perimeter Calculation
- Surface areas and perimeters are **not** computed via naive degree multiplication or assumed pixel grids.
- Instead, geometries are projected to **World Cylindrical Equal Area (EPSG:6933)** in meters:
  $$\text{Area}_{\text{m}^2} = \text{Area}(\text{Geom}_{\text{EPSG:6933}})$$
  $$\text{Area}_{\text{km}^2} = \frac{\text{Area}_{\text{m}^2}}{1,000,000}$$
  $$\text{Perimeter}_{\text{m}} = \text{Length}(\text{Geom}_{\text{EPSG:6933}})$$

### 4.2 Centroid & Bounding Box
- **Centroid:** Derived on the WGS84 geometry:
  - `centroidLongitude` ($X$)
  - `centroidLatitude` ($Y$)
  - `centroidGeometry`: `{"type": "Point", "coordinates": [longitude, latitude]}`
- **Bounding Box:** Enclosing coordinates $[\text{minLon}, \text{minLat}, \text{maxLon}, \text{maxLat}]$.

---

## 5. Model Output Statistics & Shape Features

### 5.1 Model Output Statistics
For each candidate region, statistics across underlying probability raster pixels are computed:
- `meanProbability`: Mean model output over region pixels.
- `maxProbability`: Peak activation over region pixels.
- `minProbability`: Minimum activation over region pixels.
- `probabilityPixelCount`: Number of evaluated pixels.
- **Labeling:** Explicitly grouped as `MODEL_OUTPUT_STATISTICS` (not detection confidence).

### 5.2 Geometric Shape Descriptors
Descriptive, non-interpretive shape metrics computed on projected equal-area geometry:
- **Aspect Ratio:** $\frac{\text{Major Axis}}{\text{Minor Axis}}$ of minimum bounding rectangle.
- **Elongation:** $1.0 - \frac{\text{Minor Axis}}{\text{Major Axis}}$ ($0.0 = \text{circular}$, $\to 1.0 = \text{narrow linear slick}$).
- **Compactness:** Isoperimetric quotient $\frac{4 \pi \cdot \text{Area}}{\text{Perimeter}^2} \in [0.0, 1.0]$.

*Note:* These features are descriptive geometric parameters and are **never** used to infer physical oil types.

---

## 6. Scientific Guardrails & Limitations

| Dimension | Analytical Status | Scientific Rationale |
| :--- | :--- | :--- |
| **Detection Status** | `CANDIDATE_DARK_FORMATION` | V09D has `EXPERIMENTAL_VALIDATED_WITH_LIMITATIONS` status; dark SAR formations include natural biogenic films and low-wind areas. |
| **Volume Estimation** | `NOT_ESTABLISHED` | 2D radar backscatter damping does not provide optical thickness or oil layer depth. |
| **Oil-Type Classification** | `NOT_ESTABLISHED` | Distinguishing crude oil, bunker fuel, and emulsion requires thermal/chemical multi-spectral sensors or in-situ sampling. |
| **AIS Vessel Attribution** | `NOT_IMPLEMENTED` | Excluded from this phase; requires verified spatio-temporal vessel trajectory correlation. |
| **Metocean Drift** | `NOT_IMPLEMENTED` | Excluded from this phase. |
| **LLM Synthesis** | `NOT_IMPLEMENTED` | Excluded from this phase. |

---

## 7. GeoJSON & API Output Contract

### 7.1 GeoJSON FeatureCollection Schema
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "candidate_region_001",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[-122.48, 37.81], [-122.45, 37.81], [-122.45, 37.83], [-122.48, 37.83], [-122.48, 37.81]]]
      },
      "properties": {
        "regionId": "candidate_region_001",
        "scientificStatus": "CANDIDATE_DARK_FORMATION",
        "pixelCount": 6000,
        "areaM2": 6624000.0,
        "areaKm2": 6.624,
        "perimeterM": 10450.0,
        "centroidLatitude": 37.82,
        "centroidLongitude": -122.465,
        "boundingBox": [-122.48, 37.81, -122.45, 37.83],
        "meanProbability": 0.912,
        "maxProbability": 0.985,
        "aspectRatio": 1.45,
        "elongation": 0.31,
        "compactness": 0.76,
        "oilType": "NOT_ESTABLISHED",
        "estimatedVolume": "NOT_ESTABLISHED",
        "modelId": "unet-dual-pol-sar-v09d-residual-loss",
        "modelRelease": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
        "operatingThreshold": 0.50,
        "sourceType": "REAL_CDSE"
      }
    }
  ],
  "metadata": {
    "sceneId": "test-s1-sf-candidate-001",
    "sourceType": "REAL_CDSE",
    "regionCount": 1,
    "totalAreaKm2": 6.624,
    "crs": "EPSG:4326"
  }
}
```

---

## 8. Verification & Performance

### 8.1 Test Results
- **Unit Tests:** `services/ml-python/tests/unit/test_v013b_spill_analysis.py` (10 passed)
- **Integration Tests:** `services/ml-python/tests/integration/test_v013b_spill_analysis_api.py` (2 passed)
- **Zero Regressions:** All unit and integration suites passed.

### 8.2 Measured Geospatial Runtimes (512x512 Scene with Candidate Slick)
- Connected Component Extraction & Polygonization: $2.8$ ms
- Geometry Projection & Validation: $4.1$ ms
- Equal-Area Surface Metric Calculations: $1.9$ ms
- GeoJSON Serialization & Summary Generation: $1.2$ ms
- **Total Geospatial Analysis Latency:** $10.0$ ms
