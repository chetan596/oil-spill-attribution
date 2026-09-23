# PART 0.13D — AIS CORRELATION & VESSEL EVIDENCE REPORT

**Release:** `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Pipeline Level:** AIS Vessel Trajectory Spatio-Temporal Correlation  
**Layer Module:** `services/ml-python/app/ais/spill_ais_engine.py`  
**Audit Date:** September 2026  

---

## 1. Executive Summary

Part 0.13D establishes the maritime Automatic Identification System (AIS) trajectory correlation layer on top of:
1. **Part 0.13A:** Frozen V09D SAR segmentation
2. **Part 0.13B:** Georeferenced candidate spill analysis
3. **Part 0.13C:** Metocean drift and reverse hindcast modeling

The objective is to evaluate candidate maritime vessels and determine which vessel tracks are **spatio-temporally consistent** with the modelled backward drift corridor.

### Strict Scientific & Legal Non-Attribution Principle
- AIS correlation represents **circumstantial spatio-temporal consistency only**.
- It does **not** establish confirmed oil discharge, deliberate pollution, vessel causality, or legal liability.
- Prohibited designations: `RESPONSIBLE_VESSEL`, `CONFIRMED_VESSEL`, `GUILTY_VESSEL`.
- Candidate ranking is explicitly classified as **`CORRELATION_CANDIDATE_ORDER`** (never "responsibility ranking").
- LLM synthesis is unexecuted in this phase.

---

## 2. Input Contract & Temporal Search Window

### 2.1 Primary Inputs
- **SAR Candidate Formation:** Centroid $[lat, lon]$, acquisition timestamp $t_{\text{sar}}$, and spatial extent.
- **Modelled Backward Drift Corridor:** Modelled origin $[lat_0, lon_0]$ at $t_{\text{origin}}$, backward trajectory LineString, and turbulent eddy diffusion uncertainty envelope radius $\sigma(t)$.
- **AIS Vessel Tracks:** Ordered position histories containing MMSI, timestamp, latitude, longitude, SOG (Speed Over Ground), COG (Course Over Ground), and vessel metadata.

### 2.2 Temporal Search Window
The search window is dynamically derived from the backward drift duration:
$$t_{\text{search\_start}} = t_{\text{origin}} - \Delta t_{\text{window}}$$
$$t_{\text{search\_end}} = t_{\text{sar}} + 6.0\text{ hours}$$
- Default $\Delta t_{\text{window}} = 24.0\text{ hours}$.

---

## 3. Spatial & Kinematic Metrics

### 3.1 Geodesic Spatial Distances
For each candidate vessel trajectory:
- **`distanceToModelledOriginKm`:** Distance from vessel CPA to the modelled origin point.
- **`minimumDistanceToBackwardTrajectoryKm`:** Minimum perpendicular geodesic distance from vessel track to any segment of the backward drift LineString.
- **`distanceToUncertaintyEnvelopeKm`:** $\max(0.0, d_{\text{origin}} - \sigma_{\text{origin}})$ ($0.0\text{ km}$ if trajectory intersects the uncertainty envelope).
- **`distanceToObservedCentroidKm`:** Distance from vessel to observed SAR detection.

### 3.2 Closest Point of Approach (CPA)
Determines the timestamp and spatial coordinates of closest encounter relative to the modelled origin:
- `cpaDistanceKm`: Minimum distance in km.
- `cpaTimestamp`: ISO 8601 UTC timestamp of CPA.
- `cpaLatitude`, `cpaLongitude`: Vessel position at CPA.
- `cpaSogKnots`, `cpaCogDeg`: Vessel speed and heading at CPA.

### 3.3 Temporal Consistency
- Temporal difference: $\Delta t_{\text{hours}} = \frac{|t_{\text{vessel\_cpa}} - t_{\text{origin}}|}{3600\text{ s}}$

---

## 4. AIS Data Quality & Completeness

To prevent sparse or interrupted AIS tracks from producing misleading high correlation:
- **`positionCount`:** Total valid AIS pings within the search window.
- **`temporalCoverageHours`:** Span between first and last AIS report.
- **`positionGapsCount`:** Number of telemetry gaps exceeding $2.0\text{ hours}$.
- **`maxGapDurationHours`:** Longest gap duration.
- **`dataCompleteness`:** Score in $[0.0, 1.0]$ based on ping density and gap penalty.
- **`qualityRating`:** `HIGH`, `MODERATE`, `LOW`, or `INSUFFICIENT`.

---

## 5. Analytical Correlation Scoring & Evidence Status

### 5.1 Transparent Scoring Formula
$$\text{Score} = 0.35 \cdot S_{\text{spatial}} + 0.25 \cdot S_{\text{temporal}} + 0.25 \cdot S_{\text{trajectory}} + 0.15 \cdot Q_{\text{data}}$$
- $S_{\text{spatial}} = \exp\left(-\frac{\max(0, d_{\text{eff}})}{15.0\text{ km}}\right)$
- $S_{\text{temporal}} = \exp\left(-\frac{\Delta t_{\text{hours}}}{6.0\text{ h}}\right)$
- $S_{\text{trajectory}} = \exp\left(-\frac{d_{\text{traj}}}{12.0\text{ km}}\right)$
- $Q_{\text{data}} \in [0.2, 1.0]$: Data quality factor.

### 5.2 Evidence Status Taxonomy
| Status | Definition |
| :--- | :--- |
| `AIS_CORRELATED_CANDIDATE` | Vessel trajectory intersects or passes near the modelled origin corridor within temporal tolerance. |
| `AIS_PARTIAL_DATA` | Vessel trajectory is proximate, but AIS coverage contains gaps or partial temporal overlap. |
| `AIS_INSUFFICIENT_DATA` | Track contains $< 2$ points or severe data gaps preventing reliable correlation. |
| `NOT_ESTABLISHED` | Spatial/temporal metrics exceed threshold or metocean inputs unavailable. |

---

## 6. Real & Demo Provenance Isolation

| SAR Source | AIS Source | Combination Status | Presentation Constraint |
| :--- | :--- | :--- | :--- |
| `REAL_CDSE` | `REAL_AIS` | `REAL_ANALYTICAL` | Valid live analytical evidence chain. |
| `DEMO` | `DEMO` | `DEMO` | Valid demo workflow for UI development. |
| `REAL_CDSE` | `DEMO` | `DEMO_AIS_CORRELATION` | Explicitly marked as demo AIS; never presented as real attribution. |
| `DEMO` | `REAL_AIS` | `DEMO_SAR_CORRELATION` | Explicitly marked as demo SAR scenario. |

---

## 7. GeoJSON & API Contract

### 7.1 GeoJSON FeatureCollection
- Feature 1: Observed Detection Centroid (Point, OBSERVED)
- Feature 2: Modelled Spill Origin (Point, MODELLED)
- Feature 3: Modelled Origin Uncertainty Envelope (Polygon, MODELLED)
- Feature 4: Modelled Backward Drift Trajectory (LineString, MODELLED)
- Feature 5: Candidate Vessel Tracks (LineString, AIS_TRACK)
- Feature 6: Vessel CPA Points (Point, CPA_POINT)

### 7.2 API Route
`POST /api/v1/ais/correlate`

---

## 8. Verification & Performance

### 8.1 Test Results
- **Unit Tests:** `services/ml-python/tests/unit/test_v013d_ais_correlation.py` (6 passed)
- **Integration Tests:** `services/ml-python/tests/integration/test_v013d_ais_api.py` (2 passed)
- **Zero Regressions:** 220 passed, 0 failures across full test suite.

### 8.2 Measured Latency (Multi-Vessel Trajectory Evaluation)
- Trajectory Ingestion & Temporal Filtering: $0.6$ ms
- Geodesic Distance & CPA Derivation: $1.1$ ms
- Data Quality & Analytical Scoring: $0.4$ ms
- GeoJSON Serialization: $0.7$ ms
- **Total AIS Correlation Processing Time:** $2.8$ ms
