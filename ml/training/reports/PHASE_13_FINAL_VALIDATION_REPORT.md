# Ocean Guard AI / SIH 26143 — Phase 13 Final Validation Report

> **Date:** 2026-09-21  
> **Phase:** 13 — Final End-to-End Validation, Robustness Audit & Production Freeze  
> **Verdict:** `PRODUCTION_FREEZE: PASS`

---

## Executive Summary

Phase 13 executed a comprehensive system-wide validation of Ocean Guard AI across all 34 mandated audit dimensions. The system integrates domain-specific optical models (Phases 7B, 10, 11), a deterministic model router (Phase 12), SAR segmentation (v09d), and a full downstream attribution pipeline (geometry extraction, drift trajectory, spill origin estimation, AIS correlation, vessel identification, and report generation).

**All critical integration tests pass. The prototype is cleared for production freeze.**

| Metric | Result |
|---|---|
| Python Tests | 378 passed, 1 skipped, 0 failed |
| Node Tests | 135 passed, 0 failed (19 suites) |
| Frontend Build | 0 errors (3.03s) |
| Phase 13 Integration Tests | 6 passed, 0 failed |
| Checkpoint Integrity | 6/6 SHA-256 verified |
| Model Routing | Deterministic across 10 iterations × 3 domains |
| Concurrency | 2 & 5 simultaneous — no cross-contamination |
| Reproducibility | Bit-identical repeat inference |
| Resource Stability | RAM delta +2.29 MB over 30 inferences (stable) |

---

## Final Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Ocean Guard AI                               │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────────────────────────┐   │
│  │   Frontend    │    │         Node Backend Services             │   │
│  │  (Vite/React) │───▶│  Geometry · Drift · Origin · AIS ·       │   │
│  │               │    │  Vessel · Report · Attribution            │   │
│  └──────────────┘    └───────────────┬──────────────────────────┘   │
│                                      │                               │
│                          ┌───────────▼───────────┐                   │
│                          │  Python ML API (FastAPI)│                   │
│                          │                         │                   │
│                          │  ┌───────────────────┐ │                   │
│                          │  │  Optical Router    │ │                   │
│                          │  │  (Deterministic)   │ │                   │
│                          │  └─────┬─────┬─────┬─┘ │                   │
│                          │        │     │     │    │                   │
│                          │   S2-MS│ RGB │Drone│    │                   │
│                          │   6-bd │ Sat │ RGB │    │                   │
│                          │        │     │     │    │                   │
│                          │  ┌─────▼─────▼─────▼─┐ │                   │
│                          │  │  SAR v09d Engine   │ │                   │
│                          │  │  (Independent)     │ │                   │
│                          │  └───────────────────┘ │                   │
│                          └─────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Optical Model Registry

| Model ID | Domain | Architecture | Bands | Checkpoint SHA-256 | Status |
|---|---|---|---|---|---|
| `mados-resnet34-rgbnir-swir-v1` | Sentinel-2 MS | U-Net ResNet-34 (6-ch) | B4,B3,B2,B8,B11,B12 | `856ea016b8f7...` | ✅ VERIFIED |
| `mados-resnet34-rgb-v1` | Satellite RGB | U-Net ResNet-34 (3-ch) | B4,B3,B2 | `a4c32de7177b...` | ✅ VERIFIED |
| `kerf-resnet34-focaldice-v1` | Drone/Aerial RGB | U-Net ResNet-34 (3-ch) | R,G,B | `d1ae45d3eaf9...` | ✅ VERIFIED |

### Historical Checkpoints (Verified Untouched)

| Checkpoint | SHA-256 | Status |
|---|---|---|
| Original V2 ResNet-18 | `e3d44f7e480d...` | ✅ UNTOUCHED |
| Original ResNet-34 (4-Class) | `9aab3f6de981...` | ✅ UNTOUCHED |
| Phase 11 RGB+NIR | `5137660ee14d...` | ✅ UNTOUCHED |

---

## Domain Routing

The `OpticalRouter` implements a deterministic, non-filename routing hierarchy:

1. **Trusted metadata** → band structure → channel count → user selection → **fail closed**
2. Filenames/extensions are **never** consulted for routing decisions
3. Unknown inputs raise `AmbiguousModalityError` — no silent fallback

**Determinism verified:** 10 consecutive routing calls per domain produce identical `RoutingDecision` objects.

| Input | Routed Model | Routing Reason |
|---|---|---|
| Sentinel-2 6-band | `mados-resnet34-rgbnir-swir-v1` | Validated Sentinel-2 multispectral metadata with all 6 diagnostic bands |
| Sentinel-2 RGB-only | `mados-resnet34-rgb-v1` | Validated RGB satellite imagery without multispectral SWIR bands |
| Drone RGB | `kerf-resnet34-focaldice-v1` | Validated drone/aerial high-resolution optical RGB photography |
| Unknown | **REJECTED** | `AmbiguousModalityError` raised |

---

## Sentinel-2 Validation

- **Model:** `mados-resnet34-rgbnir-swir-v1` (Phase 11)
- **Preprocessing:** B11/B12 bilinear resampling 120→240, training-set normalization, [B4,B3,B2,B8,B11,B12] band ordering
- **Benchmark (locked Phase 11 test partition):**

| Metric | Value |
|---|---|
| IoU | 0.4273 |
| F1 | 0.5987 |
| Precision | 0.6062 |
| Recall | 0.5915 |
| Positive Discovery Rate | 80.1% |
| Clean-Ocean False Alarm Rate | 2.31% |

- **End-to-end inference:** ✅ PASS (781.37ms first run, 380.23ms mean over 10 runs)

---

## Satellite RGB Validation

- **Model:** `mados-resnet34-rgb-v1` (Phase 11 RGB Control)
- **Preprocessing:** Training-set normalization, [B4,B3,B2] ordering
- **Benchmark (locked Phase 11 test partition):**

| Metric | Value |
|---|---|
| IoU | 0.3554 |
| F1 | 0.5245 |
| Precision | 0.5651 |
| Recall | 0.4893 |

- **End-to-end inference:** ✅ PASS (715.20ms first run, 234.27ms mean over 10 runs)

---

## Drone RGB Validation

- **Model:** `kerf-resnet34-focaldice-v1` (Phase 7B)
- **Preprocessing:** Aspect-preserving letterbox to 512×512, ImageNet normalization, inverse coordinate mapping
- **Benchmark (locked KERF partition):**

| Metric | Value |
|---|---|
| IoU | 0.8268 |

- **End-to-end inference:** ✅ PASS (1262.15ms first run, 811.02ms mean over 10 runs)

---

## Segmentation Validation

Benchmark metrics are validated against locked Phase 7B/11 evaluation partitions. No retraining, no threshold tuning, no benchmark modification was performed in Phase 13.

All production model checkpoints reproduce expected evaluation behavior via SHA-256 verified weights.

---

## Geometry Validation

Six mask types tested for robustness:

| Mask Type | Components | Pixels | Area (km²) | Status |
|---|---|---|---|---|
| Empty (0 px) | 0 | 0 | 0.0000 | ✅ PASS |
| Tiny (1 px) | 1 | 1 | 0.0001 | ✅ PASS |
| Filament (1px×180) | 1 | 180 | 0.0180 | ✅ PASS |
| Medium (40×40) | 1 | 1600 | 0.1600 | ✅ PASS |
| Large (240×240) | 1 | 57600 | 5.7600 | ✅ PASS |
| Border (top row) | 1 | 240 | 0.0240 | ✅ PASS |

No crashes on empty masks, single-pixel spills, border-touching components, or full-frame masks.

---

## Drift Validation

Downstream drift trajectory integration verified via response contract:
- `geospatial.status` = `VALID` when CRS is present, `NOT_ESTABLISHED` when absent
- `geospatial.spatial_resolution_m` correctly propagated
- Graceful degradation when environmental data unavailable

---

## Origin Estimation Validation

Spill origin estimation service contract validated through Node test suite (135/135 passed). The service correctly:
- Computes modelled origin coordinates from spill geometry and environmental inputs
- Reports uncertainty and time windows
- Does not fabricate environmental values

---

## AIS Correlation Validation

AIS correlation pipeline verified:
- Time window and geographic radius correctly computed
- Candidate vessel list ranked by evidence score
- Missing AIS data handled gracefully (zero-candidate case)
- No causation claims from proximity alone

---

## Vessel Identification Validation

Vessel identification service passes all unit tests:
- Identity fields (MMSI, IMO, name, flag, type) correctly resolved
- Missing metadata handled gracefully
- Correlation distinguished from definitive attribution

---

## Report Generation Validation

Report generation service verified to include:
- Incident information, sensor/source, model used
- Segmentation result, spill geometry, area
- Drift trajectory, estimated origin
- AIS candidates, vessel information
- Evidence, uncertainty/limitations, timestamp

Report generation works correctly when downstream data is partially unavailable.

---

## Frontend Validation

| Test | Result |
|---|---|
| Vite production build | ✅ 0 errors, 3.03s, 1669 modules |
| Bundle size | 1,028.68 kB (243.46 kB gzip) |
| Dev server | ✅ Running (active 19+ hours) |

---

## API Validation

| Endpoint | Test | Status Code | Result |
|---|---|---|---|
| `GET /api/v1/health` | Health check | 200 | ✅ PASS |
| `POST /optical/infer` | Missing file | 400 | ✅ PASS |
| `POST /optical/infer` | Unknown source | 400/422 | ✅ PASS |
| `POST /manual-analysis/infer` | Domain-routed | 200 | ✅ PASS |

---

## Security Validation

| Check | Result |
|---|---|
| Input validation (file type) | ✅ PASS |
| File size limits | ✅ PASS (enforced by Node middleware) |
| Path traversal protection | ✅ PASS (OS path validation) |
| Malformed JSON handling | ✅ PASS (422/400 responses) |
| CORS configuration | ✅ Configured (allow_origins=["*"] for prototype) |
| SHA-256 checkpoint verification | ✅ Fail-closed on mismatch |
| No command injection vectors | ✅ PASS (no shell execution in inference path) |

---

## Performance

| Domain | Mean Latency | FPS (CPU) | RAM (stable) |
|---|---|---|---|
| Sentinel-2 6-Band | 380.23ms | 2.6 | 657.6 MB |
| Satellite RGB | 234.27ms | 4.3 | 657.6 MB |
| Drone RGB | 811.02ms | 1.2 | 657.6 MB |

---

## Resource Stability

- **30 consecutive inferences** (10 per domain): RAM delta = +2.29 MB (stabilized)
- **VRAM:** 0.0 MB (CPU mode — GPU would reduce latency significantly)
- **No memory leaks detected**
- **No temporary file accumulation** (artifacts written to specified output directories)

---

## Concurrency

| Level | Threads | Total Inferences | All Correct Routing | Cross-Contamination |
|---|---|---|---|---|
| 2 | 4 inferences | 4 | ✅ Yes | ❌ None |
| 5 | 10 inferences | 10 | ✅ Yes | ❌ None |

---

## Reproducibility

Two identical Sentinel-2 6-band inferences with the same input data produce:
- **Identical foreground pixel counts** ✅
- **Identical confidence values** ✅
- **Identical classification labels** ✅

GPU nondeterminism not applicable (CPU-only execution in test environment).

---

## Dataset Integrity

| Dataset/Manifest | Status |
|---|---|
| Phase 9 MADOS manifests | ✅ Unchanged |
| Phase 10 MADOS RGB manifests | ✅ Unchanged |
| Phase 11 multispectral manifests | ✅ Unchanged |
| KERF benchmark partition | ✅ Unchanged |
| No training on locked evaluation | ✅ Verified |
| No new leakage | ✅ Verified |

---

## Checkpoint Integrity

All 6 production-relevant checkpoints verified against expected SHA-256:

| Checkpoint | Expected SHA | Actual SHA | Status |
|---|---|---|---|
| Original V2 | `e3d44f7e480d...` | `e3d44f7e480d...` | ✅ MATCH |
| Original ResNet-34 | `9aab3f6de981...` | `9aab3f6de981...` | ✅ MATCH |
| Phase 7B Drone | `d1ae45d3eaf9...` | `d1ae45d3eaf9...` | ✅ MATCH |
| Phase 11 RGB Control | `a4c32de7177b...` | `a4c32de7177b...` | ✅ MATCH |
| Phase 11 RGB+NIR | `5137660ee14d...` | `5137660ee14d...` | ✅ MATCH |
| Phase 11 RGB+NIR+SWIR | `856ea016b8f7...` | `856ea016b8f7...` | ✅ MATCH |

---

## Test Results

| Suite | Passed | Failed | Skipped | Duration |
|---|---|---|---|---|
| Python (pytest -q) | 378 | 0 | 1 | 62.14s |
| Node (npm test) | 135 | 0 | 0 | 21.98s |
| Frontend (npm run build) | — | 0 | — | 3.03s |
| Phase 13 Integration | 6 | 0 | 0 | 5.95s |
| Phase 13 Validation Suite | 11/11 steps | 0 | 0 | 23.26s |

---

## Known Limitations

See [phase13_known_limitations.md](file:///d:/PROJECTS/Collge%20Project/oil-spill-attribution/ml/training/reports/phase13_known_limitations.md) for the complete document. Key items:

1. Validated for 3 optical domains only (Sentinel-2 MS, Satellite RGB, Drone RGB)
2. MADOS benchmark reflects specific geographic regions — not universal accuracy
3. Tiny-sheen detection remains limited (IoU ~0.28)
4. AIS coverage gaps exist (dark shipping, open-ocean gaps)
5. Vessel attribution is correlation-based, not forensic certainty
6. CPU-only deployment functional but slower than GPU
7. No automated Sentinel-2 acquisition monitoring (manual upload only)

---

## Final Production-Freeze Decision

### Criteria Assessment

| Criterion | Status |
|---|---|
| All critical integration tests pass | ✅ |
| Model routing passes | ✅ |
| Checkpoint integrity passes | ✅ |
| Dataset integrity passes | ✅ |
| API contracts pass | ✅ |
| Frontend build passes | ✅ |
| Downstream pipeline passes | ✅ |
| No critical security regression | ✅ |
| No unresolved crash in main analysis flow | ✅ |

### Decision

```
PRODUCTION_FREEZE: PASS
```

The Ocean Guard AI prototype is cleared for production freeze as of 2026-09-21. All critical validation criteria are met. Known limitations are documented and do not constitute blocking issues for the prototype deployment.
