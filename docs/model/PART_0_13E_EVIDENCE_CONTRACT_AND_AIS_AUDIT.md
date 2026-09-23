# PART 0.13E — CANONICAL EVIDENCE CONTRACT & AIS SCIENTIFIC AUDIT REPORT

**Release:** `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Contract Specification:** `OG-CANONICAL-EVIDENCE-CONTRACT-V1.0`  
**Pipeline Level:** Multi-Stage Evidence Assembly & Scientific Guardrails  
**Audit Date:** September 2026  

---

## 1. Executive Summary & Objective

Part 0.13E establishes the canonical, structured evidence contract linking all preceding operational stages of the Ocean Guard AI pipeline:
1. **Part 0.13A:** Frozen V09D SAR segmentation inference (`OBSERVED`)
2. **Part 0.13B:** Georeferenced connected component candidate analysis (`DERIVED`)
3. **Part 0.13C:** Coupled surface wind leeway & current reverse hindcasting (`MODELLED`)
4. **Part 0.13D:** Spatio-temporal AIS vessel trajectory correlation (`AIS`)

This phase performs a rigorous scientific audit of the evidence flow, externalizes analytical correlation parameters, audits CPA metrics against classical relative-motion kinematics, defines the non-attribution legal principle, and establishes strict boundaries for future LLM synthesis.

> [!IMPORTANT]
> **Scientific & Legal Principle:**  
> The canonical evidence object produces objective, physical, and spatio-temporal correlation metrics. It strictly does **NOT** establish legal responsibility, confirmed discharge, intentional dumping, or vessel liability (`NOT_ESTABLISHED`).

---

## 2. End-to-End Evidence Chain Audit

The runtime data flow was audited to verify that downstream pipeline components consume verified upstream outputs rather than recreating, hardcoding, or substituting data:

```
+-------------------------------------------------------------------------------+
| Part 0.13A: Frozen V09D SAR Inference (OBSERVED)                              |
| - Sentinel-1 SAR Dual-Pol (VV + VH + Ratio)                                   |
| - sigma0_db_v1 calibration, 512x512 tiling, Hann blending                     |
| - Probability Map & Binary Mask (Threshold = 0.50)                            |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
| Part 0.13B: Georeferenced Candidate Spill Analysis (DERIVED)                  |
| - 8-connectivity connected components                                         |
| - EPSG:6933 equal-area metric area (km², m²) & perimeter (m)                 |
| - Observed Centroid (WGS84 lat, lon), Bounding Box                            |
| - Probability statistics (meanProbability, peakProbability)                  |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
| Part 0.13C: Metocean Drift & Backward Hindcast (MODELLED)                     |
| - Consumes Part 0.13B Observed Centroid & Acquisition Timestamp              |
| - Coupled forcing: 3.0% wind leeway + ocean current + Kh turbulent diffusion |
| - Modelled Origin (lat, lon, timestamp, uncertaintyRadiusKm)                  |
| - Backward Trajectory LineString & Uncertainty Envelope Polygon               |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
| Part 0.13D: AIS Trajectory Spatio-Temporal Correlation (AIS)                  |
| - Consumes Part 0.13C Modelled Origin, Uncertainty Radius & Backward Path    |
| - Dynamic search window & corridor distance metrics                           |
| - AIS data quality evaluation (ping completeness, gap penalties)              |
| - Transparent Analytical Correlation Score in [0, 1]                          |
+-------------------------------------------------------------------------------+
                                      │
                                      ▼
+-------------------------------------------------------------------------------+
| Part 0.13E: Canonical Evidence Contract (UNIFIED EVIDENCE PACKAGE)            |
| - Schema: OG-CANONICAL-EVIDENCE-CONTRACT-V1.0                                 |
| - Provenance audit & REAL/DEMO isolation matrix                               |
| - CPA semantics qualification (Stationary target vs 2-body relative motion)  |
| - Legal Non-Attribution Guardrail (legalResponsibility: NOT_ESTABLISHED)      |
| - Strict Future LLM Operational Boundary                                      |
+-------------------------------------------------------------------------------+
```

---

## 3. Canonical Structured Evidence Schema

The unified evidence contract (`services/ml-python/app/core/canonical_evidence.py`) serializes the multi-disciplinary evidence into a deterministic schema:

```json
{
  "contractVersion": "OG-CANONICAL-EVIDENCE-CONTRACT-V1.0",
  "provenance": {
    "analysisId": "analysis_1789813800000",
    "evidenceGeneratedTimestamp": "2026-09-19T18:00:00Z",
    "sarSource": "REAL_CDSE",
    "sarSceneId": "S1A_IW_GRDH_1SDV_20260919T060000_TEST",
    "sarAcquisitionTimestamp": "2026-09-19T06:00:00Z",
    "metoceanSource": "ERA5_REANALYSIS_COUPLED",
    "driftModelVersion": "Lagrangian Advection",
    "aisSource": "REAL_AIS",
    "combinationStatus": "REAL_ANALYTICAL",
    "modelRelease": "OG-SAR-ML-RESEARCH-RELEASE-V0.12",
    "checkpointModelId": "unet-dual-pol-sar-v09d-residual-loss"
  },
  "sarDetection": {
    "semanticStatus": "OBSERVED",
    "modelId": "unet-dual-pol-sar-v09d-residual-loss",
    "operatingThreshold": 0.50,
    "totalRegionsDetected": 1,
    "rawInferenceAvailable": true,
    "calibration": "sentinel1_sigma0_db_v1",
    "channels": ["VV", "VH", "VV_VH_RATIO"]
  },
  "geospatialEvidence": {
    "semanticStatus": "DERIVED",
    "candidateRegionId": "cand_reg_mumbai_1",
    "surfaceAreaKm2": 4.85,
    "surfaceAreaM2": 4850000.0,
    "perimeterMeters": 14200.0,
    "observedCentroid": { "latitude": 18.92, "longitude": 72.81 },
    "boundingBox": [72.78, 18.89, 72.84, 18.95],
    "shapeDescriptors": {
      "aspectRatio": 2.85,
      "compactness": 0.32,
      "elongation": 0.65
    },
    "modelOutputStatistics": {
      "meanProbability": 0.88,
      "peakProbability": 0.96,
      "stdDevProbability": 0.07
    },
    "crs": "EPSG:4326",
    "metricCrs": "EPSG:6933"
  },
  "metoceanDriftEvidence": {
    "semanticStatus": "MODELLED",
    "engine": "Lagrangian Advection",
    "hindcastDurationHours": 24.0,
    "observedCentroid": { "latitude": 18.92, "longitude": 72.81 },
    "modelledOrigin": {
      "latitude": 19.15,
      "longitude": 72.62,
      "timestamp": "2026-09-18T06:00:00Z",
      "uncertaintyRadiusKm": 1.85
    },
    "uncertaintyEnvelope": { "type": "Polygon", "coordinates": [...] },
    "backwardTrajectoryPath": [...],
    "forcingParameters": {
      "surfaceWindSpeedMps": 6.5,
      "surfaceWindDirectionDeg": 220.0,
      "surfaceCurrentSpeedMps": 0.35,
      "surfaceCurrentDirectionDeg": 340.0,
      "leewayFactor": 0.03,
      "horizontalDiffusivityKhM2s": 10.0,
      "era5SpatialResolutionNote": "10-m surface wind denotes 10-meter atmospheric measurement height, not 10m horizontal spatial grid."
    }
  },
  "aisCorrelationEvidence": {
    "semanticStatus": "AIS",
    "rankingPolicy": "CORRELATION_CANDIDATE_ORDER",
    "correlationConfig": {
      "configVersion": "v1.0.0",
      "parameters": {
        "spatialDecayScaleKm": 15.0,
        "temporalDecayScaleHours": 6.0,
        "trajectoryDecayScaleKm": 12.0,
        "gapThresholdHours": 2.0,
        "defaultTimeWindowHours": 24.0
      },
      "weights": {
        "spatial": 0.35,
        "temporal": 0.25,
        "trajectory": 0.25,
        "dataQuality": 0.15
      }
    },
    "candidates": [
      {
        "candidateId": "cand_419000888",
        "mmsi": "419000888",
        "vesselName": "ARABIAN SEAS",
        "vesselType": "Oil Tanker",
        "flag": "India",
        "sourceType": "REAL_AIS",
        "evidenceStatus": "AIS_CORRELATED_CANDIDATE",
        "analyticalCorrelation": {
          "score": 0.8845,
          "scoreType": "ANALYTICAL_CORRELATION_SCORE",
          "components": {
            "spatial": 0.942,
            "temporal": 0.920,
            "trajectory": 0.895,
            "dataQuality": 0.950
          },
          "weights": {
            "spatial": 0.35,
            "temporal": 0.25,
            "trajectory": 0.25,
            "dataQuality": 0.15
          }
        },
        "spatialEvidence": {
          "distanceToModelledOriginKm": 0.18,
          "minimumDistanceToBackwardTrajectoryKm": 0.12,
          "distanceToUncertaintyEnvelopeKm": 0.0,
          "distanceToObservedCentroidKm": 38.4,
          "isInsideUncertaintyEnvelope": true
        },
        "temporalEvidence": {
          "modelOriginTimestamp": "2026-09-18T06:00:00Z",
          "vesselCpaTimestamp": "2026-09-18T06:15:00Z",
          "temporalDifferenceHours": 0.25,
          "isTemporallyConsistent": true
        },
        "minimumDistanceToModelledOrigin": {
          "distanceKm": 0.18,
          "closestPointTimestamp": "2026-09-18T06:15:00Z",
          "closestPointLatitude": 19.15,
          "closestPointLongitude": 72.63,
          "closestPointSogKnots": 12.4,
          "closestPointCogDeg": 135.0,
          "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT",
          "isDynamicRelativeMotionCPA": false
        },
        "cpa": {
          "status": "ESTABLISHED",
          "cpaDistanceKm": 0.18,
          "cpaTimestamp": "2026-09-18T06:15:00Z",
          "cpaLatitude": 19.15,
          "cpaLongitude": 72.63,
          "cpaSogKnots": 12.4,
          "cpaCogDeg": 135.0,
          "metricSemantic": "MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT",
          "isDynamicRelativeMotionCPA": false
        },
        "dataQuality": {
          "positionCount": 3,
          "temporalCoverageHours": 1.5,
          "positionGapsCount": 0,
          "maxGapDurationHours": 0.75,
          "dataCompleteness": 0.95,
          "qualityRating": "HIGH"
        },
        "scientificGuardrails": {
          "legalResponsibility": "NOT_ESTABLISHED",
          "confirmedDischarge": "NOT_ESTABLISHED",
          "vesselLiability": "NOT_ESTABLISHED",
          "analyticalLimitation": "Spatio-temporal alignment with modelled drift corridor constitutes analytical correlation evidence only; does not establish causation or legal liability."
        }
      }
    ]
  },
  "legalGuardrails": {
    "legalResponsibility": "NOT_ESTABLISHED",
    "confirmedDischarge": "NOT_ESTABLISHED",
    "intentionalDischarge": "NOT_ESTABLISHED",
    "vesselLiability": "NOT_ESTABLISHED",
    "prohibitedAttributionTerms": [
      "ATTRIBUTION_CONFIDENCE_SCORE",
      "CAUSED_SPILL",
      "CONFIRMED_VESSEL",
      "DISCHARGE_PROBABILITY",
      "GUILTY_VESSEL",
      "PROBABILITY_OF_GUILT",
      "RESPONSIBLE_VESSEL"
    ],
    "disclaimer": "This structured evidence dossier presents objective physical, geospatial, hydrodynamic, and AIS correlation metrics. It strictly does NOT establish legal responsibility, fault, or liability."
  }
}
```

---

## 4. CPA Semantics Audit

### Finding & Distinction
In classical maritime navigation and collision regulations (COLREGs / radar plotting), **Closest Point of Approach (CPA)** refers to the kinematic point of minimum distance between two *moving* vessels with velocity vectors $\vec{v}_1$ and $\vec{v}_2$, where the relative motion vector $\vec{v}_{\text{rel}} = \vec{v}_1 - \vec{v}_2$ predicts the future or reconstructs the past relative crossing distance.

In the pipeline's AIS correlation engine, the target point is the stationary modelled backward origin point $\mathbf{x}_{\text{origin}} = (\text{lat}_{\text{origin}}, \text{lon}_{\text{origin}})$ or observed centroid. The calculation evaluates discrete historical AIS track pings:
$$d_{\min} = \min_{i} \text{Haversine}(\mathbf{x}_{\text{vessel}}(t_i), \mathbf{x}_{\text{origin}})$$

### Semantic Qualification
To maintain strict scientific precision and prevent misleading legal implications:
1. The metric is explicitly labeled and qualified as:
   `minimumDistanceToModelledOrigin`
2. `metricSemantic` is explicitly declared as:
   `"MINIMUM_HISTORICAL_DISTANCE_TO_STATIONARY_POINT"`
3. `isDynamicRelativeMotionCPA` is explicitly set to:
   `false`
4. The legacy `cpa` structure is retained for client backwards compatibility while carrying the same semantic metadata.

---

## 5. Analytical Correlation Score & Externalized Parameters

### Mathematical Formula
The analytical correlation score is strictly a deterministic, transparent composite metric:

$$S_{\text{corr}} = w_{\text{sp}} \cdot S_{\text{spatial}} + w_{\text{temp}} \cdot S_{\text{temporal}} + w_{\text{traj}} \cdot S_{\text{trajectory}} + w_{\text{dq}} \cdot Q_{\text{data}}$$

Where:
- $S_{\text{spatial}} = \exp\left(-\frac{\max(0, d_{\min} - \sigma_{\text{uncertainty}})}{\lambda_{\text{spatial}}}\right)$ with $\lambda_{\text{spatial}} = 15.0\text{ km}$
- $S_{\text{temporal}} = \exp\left(-\frac{\Delta t}{\tau_{\text{temporal}}}\right)$ with $\tau_{\text{temporal}} = 6.0\text{ hours}$
- $S_{\text{trajectory}} = \exp\left(-\frac{d_{\text{traj\_min}}}{\lambda_{\text{trajectory}}}\right)$ with $\lambda_{\text{trajectory}} = 12.0\text{ km}$
- $Q_{\text{data}} = \text{clamp}(Q_{\text{completeness}}, 0.2, 1.0)$
- Fixed analytical weights:
  - $w_{\text{sp}} = 0.35$ (Spatial Proximity)
  - $w_{\text{temp}} = 0.25$ (Temporal Alignment)
  - $w_{\text{traj}} = 0.25$ (Trajectory Corridor Proximity)
  - $w_{\text{dq}} = 0.15$ (AIS Data Completeness)

### Configuration Versioning (`AISCorrelationConfig`)
All parameters are externalized in `AISCorrelationConfig` (Version: `v1.0.0`):
- `spatial_decay_scale_km: 15.0`
- `temporal_decay_scale_hours: 6.0`
- `trajectory_decay_scale_km: 12.0`
- `gap_threshold_hours: 2.0`
- `default_time_window_hours: 24.0`

Every correlation execution embeds the configuration version and parameter snapshot into the canonical evidence record for exact reproducibility.

---

## 6. REAL / DEMO Provenance Isolation Matrix

The pipeline enforces strict isolation to prevent synthetic demo data from being presented as real attribution:

| SAR Source | AIS Source | Combination Status | Permissible Use |
| :--- | :--- | :--- | :--- |
| `REAL_CDSE` | `REAL_AIS` | `REAL_ANALYTICAL` | Valid operational & forensic analysis |
| `DEMO` | `DEMO` | `DEMO` | Valid demo scenario & unit testing |
| `REAL_CDSE` | `DEMO` | `DEMO_AIS_CORRELATION` | **Explicitly labeled demo correlation**; never real attribution |
| `DEMO` | `REAL_AIS` | `DEMO_SAR_CORRELATION` | **Explicitly labeled demo SAR**; never real attribution |

---

## 7. Future LLM Contract & Operational Boundary

The canonical evidence contract defines strict guardrails for future LLM integration (Part 0.13F / Part 0.14):

### Permitted LLM Role (`STRICT_SUMMARIZATION_ONLY`)
- Synthesize pre-computed metrics into human-readable forensic briefs.
- Explain physical parameters (wind speed, current, leeway, diffusion radius).
- Present candidate vessels in `CORRELATION_CANDIDATE_ORDER` with score breakdowns.
- Highlight data quality limitations and unmonitored dark vessel caveats.

### Strictly Prohibited LLM Actions
1. `calculate distances` (must consume pre-computed values).
2. `calculate CPA` or modify closest approach distance.
3. `calculate drift` or alter leeway kinematics.
4. `calculate spill area` or change polygon geometries.
5. `calculate correlation score` or synthesize weights.
6. `modify scores` or override analytical rankings.
7. `infer missing AIS evidence` or fabricate vessel positions.
8. `invent vessel information` (MMSI, names, flags, IMO).
9. `infer legal responsibility` or criminal culpability.
10. `convert correlation into causation`.

---

## 8. Test Verification & Zero Regressions

### Test Suite Execution
- **Unit Suite:** `services/ml-python/tests/unit`
- **Integration Suite:** `services/ml-python/tests/integration`
- **Results:** **228 / 228 Tests Passed** (0 failures, 0 regressions).

```
====================== 228 passed, 31 warnings in 23.42s ======================
```

### Coverage of Part 0.13E Features
1. `test_canonical_evidence_contract_structure_and_completeness`: Verified schema integrity and semantic statuses.
2. `test_cpa_semantics_audit_and_stationary_point_distinction`: Verified stationary point minimum distance vs relative-motion CPA distinction.
3. `test_analytical_correlation_score_classification_and_weights_exposure`: Verified `ANALYTICAL_CORRELATION_SCORE` and 0.35/0.25/0.25/0.15 weight exposure.
4. `test_ais_correlation_config_versioning_and_reproducibility`: Verified `AISCorrelationConfig` versioning and dictionary serialization.
5. `test_provenance_isolation_matrix`: Verified all 4 combinations in isolation matrix.
6. `test_legal_responsibility_strictly_not_established`: Verified non-attribution legal guardrails.
7. `test_rejection_of_prohibited_attribution_terms`: Verified strict rejection of forbidden blame labels.
8. `test_future_llm_boundary_declaration`: Verified the 10 prohibited LLM actions and summarization scope.

---

## 9. Limitations & Next Steps

### Operational Limitations
1. **SAR Optical Verification:** Radar backscatter dark spots represent surface tension dampening, which can be caused by natural slicks or wind shadows; chemical petroleum verification is not performed.
2. **AIS Dark Vessels:** Vessels that turn off transponders, lack Class-A transceivers, or operate in satellite shadow zones are absent from AIS feeds.
3. **Metocean Resolution:** Reanalysis grids (ERA5 ~25 km, HYCOM ~8 km) provide regional forcing; sub-mesoscale coastal eddies and wave-induced Stokes drift introduce uncertainty reflected in the diffusion envelope.

### Next Stage
- **Part 0.13E is COMPLETE and VERIFIED.**
- Stop and wait for user review. Do **NOT** automatically implement LLM synthesis or final reporting.
