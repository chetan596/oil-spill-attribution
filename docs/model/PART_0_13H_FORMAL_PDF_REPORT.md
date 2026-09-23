# PART 0.13H — FORMAL INVESTIGATION REPORT / PDF EXPORT ARCHITECTURE

## 1. Executive Summary & Objective

Part 0.13H establishes the formal PDF export and presentation layer for Ocean Guard AI. It enables regulatory bodies, coast guards, environmental authorities, and maritime safety agencies to download a cryptographically signed, immutable, human-readable forensic dossier.

> [!IMPORTANT]
> **Part 0.13H is a presentation/export layer. It does not perform independent scientific inference.**
>
> All scientific calculations, SAR segmentation masks, metocean drift corridors, AIS correlation metrics, and synthetic narrative summaries originate strictly from the frozen upstream pipeline (Parts 0.13A–0.13G) and are read directly from the validated `OG-DOSSIER-V1` JSON artifact.

---

## 2. Frozen Scientific Boundary (0.13A–0.13G)

The complete analytical and modeling stack remains strictly frozen and unmodified:
- **0.13A**: Frozen V09D SAR segmentation (`unet-dual-pol-sar-v09d-residual-loss`, release `OG-SAR-ML-RESEARCH-RELEASE-V0.12`).
- **0.13B**: Georeferenced spill polygonization, centroid, surface area calculation.
- **0.13C**: Metocean backtracking, Lagrangian advection, uncertainty corridor.
- **0.13D**: AIS candidate spatio-temporal correlation and scoring.
- **0.13E**: Canonical Evidence Contract (`OG-CANONICAL-EVIDENCE-CONTRACT-V1.0`).
- **0.13F**: Python LLM / Deterministic Dossier Synthesis (`OG-DOSSIER-V1`).
- **0.13G**: Node.js Dossier Integration, Validation, and Persistence (`Report` model).

---

## 3. Single Source of Truth & Data Flow

```
+-------------------------------------------------------------+
| Authoritative Upstream Pipeline (Python 0.13A - 0.13F)     |
| - Sentinel-1 SAR Segmentation                               |
| - Geospatial Analysis & Contouring                          |
| - Metocean Drift Hindcast                                   |
| - AIS Spatio-Temporal Consistency                           |
+-------------------------------------------------------------+
                               |
                               v
             OG-CANONICAL-EVIDENCE-CONTRACT-V1.0
                               |
                               v
                     Python 0.13F Synthesis
                               |
                               v
                        OG-DOSSIER-V1
                               |
                               v
             Node.js Backend (0.13G Persistence)
                               |
                               v
              +--------------------------------+
              | Node PDF Service (Part 0.13H)  |
              | - Validates OG-DOSSIER-V1      |
              | - Scans Prohibited Terminology |
              | - Formats Technical Layout     |
              | - Emits application/pdf        |
              +--------------------------------+
                               |
                               v
                 GET /api/v1/dossier/:id/pdf
                               |
                               v
            End-User / Regulatory Authority Download
```

---

## 4. API Endpoints

### 4.1 Export Dossier PDF
- **Endpoint**: `GET /api/v1/dossier/:analysisId/pdf` (also aliased to `GET /api/v1/reports/:analysisId/pdf`)
- **Authentication**: `Bearer <JWT_TOKEN>` (RBAC: `ADMIN`, `ANALYST`, `VIEWER`)
- **Response**: `200 OK`
  - `Content-Type`: `application/pdf`
  - `Content-Disposition`: `attachment; filename="OG-DOSSIER-<ANALYSIS_ID>.pdf"`
  - `Content-Length`: Binary byte count
- **Error Responses**:
  - `401 Unauthorized`: Missing or invalid JWT credentials.
  - `404 Not Found`: No persisted dossier found for the requested `analysisId`.
  - `422 / 502 Bad Gateway`: Persisted dossier fails contract validation or contains prohibited attribution terminology.

---

## 5. Report Structure & 18 Mandatory Sections

When corresponding data is present in `OG-DOSSIER-V1`, the PDF document renders the following 18 technical sections:

| # | Section Name | Description & Guardrail Constraint |
|---|---|---|
| 1 | **Cover & Report Identity** | Ocean Guard AI banner, Dossier ID, Analysis ID, Schema Version, Release, Timestamp, Provenance badge. |
| 2 | **Executive Summary** | Verbatim copy of `dossier.executiveSummary`. Never modified or regenerated. |
| 3 | **Evidence Provenance & Integrity** | Clear notice whether data is `REAL_ANALYTICAL` or `DEMO_AIS_CORRELATION` / `DEMO_SAR_CORRELATION`. |
| 4 | **Spill Detection Evidence (SAR)** | Model identifier, threshold, sensor (`Sentinel-1 C-Band`), observation bullets with `OBSERVED` badge. |
| 5 | **Geospatial Evidence** | Surface area (`km²`), Centroid (`Lat, Lon` in decimal degrees), CRS (`EPSG:4326`), polygon stats. |
| 6 | **Spill Geometry** | MultiPolygon contour metrics directly from `geospatialEvidence`. |
| 7 | **Metocean Forcing & Drift** | Hindcast interval (`24h`), forcing parameters, backtracking advection model. |
| 8 | **Modelled Spill Origin** | Labelled strictly as **"MODELLED SPILL ORIGIN"**. Coordinates, uncertainty radius (`±2.6 km`). |
| 9 | **AIS Telemetry Correlation** | Telemetry source, correlation window, distance metric. |
| 10 | **Candidate Vessel Evidence** | Labelled strictly as **"AIS Correlation Candidates"** (Never "Responsible Vessel" or "Guilty Vessel"). |
| 11 | **Analytical Correlation Score** | Classification `ANALYTICAL_CORRELATION_SCORE`. Components (Spatial, Temporal, Trajectory, Quality) and weights. Notice: *"Analytical spatio-temporal consistency only. This score is not a probability of guilt, discharge, or causation."* |
| 12 | **Evidence Timeline** | Chronological log of SAR acquisition, hindcast origin, and candidate proximity events. |
| 13 | **Scientific Limitations** | Verbatim technical caveats regarding meteorological forcing, sensor resolution, and unverified parameters. |
| 14 | **Oil Type & Volume Status** | `oilTypeStatus = "NOT_ESTABLISHED"` ("Oil type was not established from the available evidence.") and `volumeStatus = "NOT_ESTABLISHED"` ("Spill volume was not established from the available evidence."). |
| 15 | **Legal Responsibility Status** | Status `NOT_ESTABLISHED`. Statement: *"The available evidence does not establish legal responsibility or vessel causation."* |
| 16 | **Evidence Traceability** | Renders canonical references (`evidenceRefs`) tracing narrative claims to contract JSON keys. |
| 17 | **Methodology & Pipeline Summary** | Standardized processing flow: `SAR Detection → Geospatial Analysis → Metocean Backtracking → AIS Correlation → Canonical Evidence → Dossier Synthesis`. |
| 18 | **Report Metadata & Audit Ledger** | System UUIDs, schema version, compilation timestamp, disclaimers. |

---

## 6. Prohibited Terminology & Legal Guardrails

The PDF generation engine scans the entire dossier data structure prior to document creation. If any prohibited attribution term is detected outside authorized definition keys, PDF generation is halted with an `AppError(502, "GUARDRAIL_VIOLATION")`:

- `RESPONSIBLE_VESSEL` (Blocked)
- `CONFIRMED_VESSEL` (Blocked)
- `GUILTY_VESSEL` (Blocked)
- `CAUSED_SPILL` (Blocked)
- `PROBABILITY_OF_GUILT` (Blocked)
- `ATTRIBUTION_CONFIDENCE_SCORE` (Blocked)
- `DISCHARGE_PROBABILITY` (Blocked)

---

## 7. Visual Design & Semantic Accent Palette

The PDF layout adheres to high-contrast maritime investigation standards with subtle semantic accents:
- **Navy Primary / Cover**: `#0B192C` / `#1E3E62`
- **Text**: Primary `#1E293B`, Secondary `#475569`, Muted `#64748B`
- **SAR / OBSERVED**: Teal (`#0D9488`, light `#CCFBF1`)
- **DRIFT / MODELLED**: Amber (`#D97706`, light `#FEF3C7`)
- **AIS / ANALYTICAL**: Violet (`#7C3AED`, light `#EDE9FE`)
- **DOSSIER / SYNTHESIS**: Magenta (`#C026D3`, light `#FAE8FF`)
- **VERIFIED / READY**: Green (`#16A34A`, light `#DCFCE7`)
- **LEGAL / WARNING**: Red (`#DC2626`, light `#FEE2E2`)
- **NOT_ESTABLISHED**: Neutral Slate (`#64748B`)

Every page includes running headers (`Ocean Guard AI | Maritime Oil Spill Investigation Dossier`) and footers (`Dossier ID | Page X of Y | Evidence Release`).

---

## 8. Performance Benchmark

PDF generation was benchmarked across standard and candidate-rich dossiers:
- **Average Generation Latency**: `11 – 15 ms` per document.
- **Document Size**: `~12.8 KB` (vector text and technical layout).
- **Execution Overhead**: Zero external network hops during rendering (all data resolved from in-memory / database persisted JSON).

---

## 9. Verification & Automated Test Suite

A dedicated automated test suite was implemented in `services/backend-node/tests/integration/pdf_report.test.js`:

1. PDF generated from valid dossier (status 200, valid PDF header `%PDF-`).
2. Invalid dossier rejected with controlled 422/502 error.
3. Missing dossier returns 404.
4. Unauthorized access rejected with 401.
5. Provenance preserved in generated PDF text.
6. Generation mode preserved (`DETERMINISTIC` / `LLM`).
7. Dossier ID preserved (`OG-DOSSIER-TEST-001`).
8. Schema version preserved (`OG-DOSSIER-V1`).
9. Analytical correlation score preserved.
10. Score components and weights preserved.
11. Legal responsibility remains `NOT_ESTABLISHED`.
12. Oil type remains `NOT_ESTABLISHED`.
13. Volume remains `NOT_ESTABLISHED`.
14. Modelled origin remains labelled `MODELLED SPILL ORIGIN`.
15. Candidate vessel rendered as `AIS Correlation Candidate`.
16. Proximity metric is not mislabeled as Dynamic CPA (`isDynamicRelativeMotionCPA = false`).
17. Prohibited attribution language absent in generated PDF.
18. Demo provenance notice clearly displayed.
19. Evidence traceability and canonical refs rendered.
20. PDF contains all 18 required structural sections.
21. No credentials, API keys, or secret tokens in PDF.
22. PDF generation performance benchmark executes under 1000ms (~12ms actual).
