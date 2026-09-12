# SIH26143: Marine Oil Spill Detection & Candidate Vessel Attribution Platform

An end-to-end investigative command center leveraging Synthetic Aperture Radar (SAR) satellite imagery, hydrodynamic Lagrangian drift modeling, and spatiotemporal Automatic Identification System (AIS) trajectory correlation to identify and rank candidate vessels associated with marine oil slicks.

---

## ⚠️ Scientific & Legal Disclaimer

> **IMPORTANT NOTICE:**  
> This platform provides **probabilistic and evidentiary correlation only**.  
> - Spatiotemporal AIS alignment and anomalous kinematic indicators **DO NOT constitute legal proof of illegal discharge** or mechanical valve operation.  
> - Drift trajectory hindcasts are mathematical approximations influenced by environmental vector assumptions.  
> - Automatic Identification System (AIS) data and MetOcean inputs utilized in the demonstration system are benchmark/synthetic demonstration datasets (`source: "demo"`).  
> - SAR segmentation utilizes an **EXPERIMENTAL DEMONSTRATION MODEL (`unet-dual-pol-sar-v2`)**.  
> - No output from this software should be construed as legal accusation or judicial finding.

---

## 🏛️ System Architecture

```
                                  ┌──────────────────────────────────────────────┐
                                  │           SENTINEL-1 SAR IMAGERY             │
                                  │      (Dual-Pol VV + VH GRD GeotIFFs)         │
                                  └──────────────────────┬───────────────────────┘
                                                         │
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │          PYTHON FASTAPI ML SERVICE           │
                                  │  • Calibrated Dual-Pol Normalization (dB)    │
                                  │  • Experimental U-Net Segmentation (V2)      │
                                  │  • Morphological Sieve & Polygonization      │
                                  │  • Built-in Lagrangian Hydrodynamic Engine   │
                                  │    - 24h Backward Hindcast (Origin Est.)     │
                                  │    - 6h Forward Forecast (Spread Risk)       │
                                  │    - Modelled Origin Uncertainty Radius (±R) │
                                  └──────────────────────┬───────────────────────┘
                                                         │ GeoJSON Polygons & Trajectories
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │           NODE.JS BACKEND & WORKERS          │
                                  │  • BullMQ / Redis Async Job Orchestration    │
                                  │  • PostgreSQL / PostGIS Spatial Database     │
                                  │  • Multi-Dimensional AIS Correlation Engine: │
                                  │    - Proximity Scoring (Spatial Distance)    │
                                  │    - Temporal Scoring (Passing Delta Δt)     │
                                  │    - Trajectory Scoring (CPA & Heading)      │
                                  │    - Anomaly Scoring (Gaps, Speed Dips)      │
                                  │  • Structured Evidence Package Generation    │
                                  │  • LLM Analytical Dossier Synthesizer        │
                                  │    (Strict Schema, Backend-Only, Offline)    │
                                  └──────────────────────┬───────────────────────┘
                                                         │ Authenticated REST API
                                                         ▼
                                  ┌──────────────────────────────────────────────┐
                                  │          REACT INVESTIGATION CENTER          │
                                  │  • Leaflet Interactive Geospatial Viewer     │
                                  │  • Dual-Timeline Simulation Playback         │
                                  │  • Candidate Vessel Inspection Drawers       │
                                  │  • Data Provenance Badges (OBS/MOD/DEMO/EXP) │
                                  │  • One-Click Analytical Dossier Generation   │
                                  └──────────────────────────────────────────────┘
```

---

## 📊 Requirement Traceability Matrix (SIH26143)

| Requirement | Implementation Component | Evidence / Test Suite | Status |
| :--- | :--- | :--- | :--- |
| **1. Satellite Imagery Ingestion** | `sar_preprocessor.py`, `geospatial.py` | `test_sar_preprocessing.py`, `test_geospatial.py` | ✅ Verified |
| **2. Oil Spill Detection** | `unet_sar.py`, `detector.py` (`unet-dual-pol-sar-v2`) | `test_unet_architecture.py`, `test_detection_api.py` | ✅ Experimental Model |
| **3. Slick Localization** | `polygonizer.py`, PostGIS `ST_GeomFromText` | `test_postprocessing.py`, Node `spill.service.test.js` | ✅ Verified |
| **4. Hydrodynamic Hindcast** | `lagrangian_engine.py`, `gnome_runner.py` | `test_drift_engine.py`, `verify_phase5_e2e.js` | ✅ Built-in Lagrangian |
| **5. AIS Spatiotemporal Correlation** | `spatialScorer.js`, `temporalScorer.js`, `trajectoryScorer.js`, `anomalyScorer.js` | Node Jest scoring tests (42 unit/integration tests) | ✅ Deterministic Heuristic |
| **6. Candidate Vessel Ranking** | `attribution.service.js`, `compositeScorer.js` | `verify_phase4_e2e.js`, `verify_phase7_e2e.js` | ✅ Verified |
| **7. Evidence & Dossier Generation** | `evidence.service.js`, `dossier.service.js`, `llm.service.js` | `llm.service.test.js`, `verify_phase6_e2e.js` | ✅ Strict JSON & Offline Mock |

---

## 🏷️ Data Provenance Framework

To guarantee scientific honesty during demonstrations, all system entities carry explicit provenance classifications:

- **`OBSERVED`**: Real physical measurements acquired directly from Sentinel-1 SAR satellite acquisitions (e.g. detected slick centroid at $18.921^\circ\text{N}, 72.832^\circ\text{E}$).
- **`MODELLED`**: Quantities estimated via physical numerical simulation (e.g. 24h Lagrangian backward drift trajectory, Modelled Spill Origin at $19.1130^\circ\text{N}, 72.5440^\circ\text{E}$, Modelled Origin Uncertainty Radius $\pm 2.6\text{ km}$, 6h forward forecast).
- **`DEMONSTRATION`**: Benchmark or synthetic reference data utilized when real-time live feeds are absent (e.g. AIS vessel traffic records with `source: "demo"`, static MetOcean wind/current vectors).
- **`EXPERIMENTAL`**: Statistical ML outputs produced by exploratory models undergoing continuous development (e.g. U-Net Dual-Pol SAR V2 segmentation probabilities).

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js 18+ & npm
- Python 3.11+ with virtual environment
- PostgreSQL 15+ with PostGIS extension enabled
- Redis 7+

### 1. Repository Setup & Environment
```bash
# Clone the repository
git clone https://github.com/chetan596/oil-spill-attribution.git
cd oil-spill-attribution

# Configure Backend environment
cp services/backend-node/.env.example services/backend-node/.env

# Configure Frontend environment
cp apps/web/.env.example apps/web/.env
```

### 2. Database Migration & Seeding
```bash
cd services/backend-node
npm install
npx prisma migrate dev --name init
npx prisma db seed
```

### 3. Launch Services
```bash
# Terminal 1: Python ML Service
cd services/ml-python
source .venv/bin/activate # or .venv\Scripts\activate on Windows
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Node.js Backend API
cd services/backend-node
npm run dev

# Terminal 3: React Web Frontend
cd apps/web
npm run dev
```

The web dashboard will be accessible at `http://localhost:3000`.

---

## 🧪 Comprehensive Verification Suite

Run all test suites across the stack:

```bash
# Python Unit & Integration Tests (38/38 passing)
cd services/ml-python
pytest -v

# Node.js Backend & Scoring Tests (42/42 passing)
cd services/backend-node
npm test

# React Frontend Component Tests (4/4 passing)
cd apps/web
npm test

# End-to-End Investigation Command Center Verification
node scripts/verify_phase7_e2e.js
```

---

## 📁 Repository Structure

```
oil-spill-attribution/
├── apps/
│   └── web/                   # React 18 + Vite Investigation Command Center
│       ├── src/components/    # Leaflet map, Candidate drawers, Timeline, Badges
│       ├── src/pages/         # Analysis and Reports dashboards
│       └── src/api/           # Client API layer
├── services/
│   ├── backend-node/          # Express + Prisma + PostGIS API & BullMQ
│   │   ├── src/scoring/       # Deterministic AIS multi-dimensional scoring
│   │   ├── src/services/      # Attribution, Drift, Evidence, Dossier services
│   │   ├── src/llm/           # Schema validator & offline mock provider
│   │   └── prisma/            # Schema, migrations, and demo seed data
│   └── ml-python/             # FastAPI SAR & Drift Microservice
│       ├── app/drift/         # Built-in Lagrangian hydrodynamic engine
│       ├── app/inference/     # U-Net inference, rasterization, polygonizer
│       ├── app/preprocessing/ # Dual-pol SAR calibration & normalization
│       └── app/training/      # PyTorch training pipelines (V1, V2 checkpoints)
├── scripts/                   # Automated E2E verification suites (Phase 4–7)
└── docs/                      # Comprehensive engineering & audit reports
```
