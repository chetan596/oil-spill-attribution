# Phase 2A — Frontend Audit Report
**SIH26143 — Oil Spill Detection & Vessel Attribution System**
**Date**: 2026-09-12

---

## 1. Executive Summary

This audit assesses the state of `apps/web` prior to Phase 2A frontend-to-backend integration. The goal of Phase 2A is to connect the React application to the verified, operational Node.js backend (`http://localhost:4000/api/v1`) without modifying the backend architecture or calling the Python ML service directly.

---

## 2. Current React & Vite Structure

- **Framework**: React 18.2.0 (`react`, `react-dom`)
- **Bundler**: Vite 5.1.6 (`@vitejs/plugin-react`)
- **Routing**: `react-router-dom` 6.22.3
- **State Management**: `zustand` 4.5.2
- **Mapping**: `leaflet` 1.9.4, `react-leaflet` 4.2.1
- **Icons & Styling**: `lucide-react` 0.363.0, `clsx` 2.1.0, Vanilla CSS
- **HTTP Client**: `axios` 1.6.8
- **Missing File**: `apps/web/index.html` was missing from the root of `apps/web/`. It must be provided for Vite to serve and build the SPA.

---

## 3. Existing API Client & API Modules

| Module | Location | Current State | Missing Integration / Issues |
|---|---|---|---|
| **Base Client** | `src/api/client.js` | Axios instance initialized with `baseURL: import.meta.env.VITE_API_BASE_URL \|\| 'http://localhost:4000/api/v1'` | Lacks auth request interceptor for JWT Bearer token; lacks response interceptor for 401 handling & structured error unwrapping. |
| **Auth API** | *Missing* | Not created | Needs `authApi.login(credentials)` and `authApi.getMe()`. |
| **Jobs API** | `src/api/jobs.api.js` | `list`, `getById`, `create` | Needs response unpacking (`response.data.data`) and parameter typing for `sarSceneId` & `timeWindowHours`. |
| **Spills API** | `src/api/spills.api.js` | `list`, `getById` | Missing `getDrift(spillId)` and `getVessels(spillId)` endpoint methods. |
| **Vessels API** | `src/api/vessels.api.js` | `list`, `getAttribution(spillId)` | The backend route is `GET /vessels/:mmsi/track` and `GET /spills/:id/vessels`. Needs update to match verified backend endpoints. |
| **Reports API** | *Missing* | Not created | Needs `reportsApi.generate(spillId)`. |

---

## 4. Existing Pages & State

| Page | Location | Current State | Target Phase 2A Behavior |
|---|---|---|---|
| **Login** | *Missing* | Not created | Provide login form (email + password), authenticate against `POST /api/v1/auth/login`, save JWT token to Zustand auth store, fetch profile via `GET /api/v1/auth/me`. |
| **Dashboard** | `src/pages/Dashboard.jsx` | Static layout with hardcoded `MapView` | Fetch detected spills via `GET /api/v1/spills`, show summary metrics (total spills, active alerts, high confidence counts), list spills, and display selected spill on `MapView`. |
| **NewAnalysis** | `src/pages/NewAnalysis.jsx` | Static mock form | Connect to `POST /api/v1/jobs` with `sarSceneId: "demo-scene-001"` and `timeWindowHours: 24`. On creation, redirect to `/analysis/:id` or poll status. |
| **Analysis** | `src/pages/Analysis.jsx` | Static grid with dummy vessel table | Accept `:id` route parameter. Poll `GET /api/v1/jobs/:id` every 2s until completed/failed. Load `GET /api/v1/spills/:id`, drift, and ranked candidate vessels. |
| **SpillDetails** | `src/pages/SpillDetails.jsx` | Hardcoded props stub | Connect to `GET /api/v1/spills/:id` and route `/spills/:id`. |
| **VesselDetails** | `src/pages/VesselDetails.jsx` | Hardcoded props stub | Connect to `GET /api/v1/vessels/:mmsi/track` and route `/vessels/:mmsi`. |
| **Reports** | `src/pages/Reports.jsx` | Static placeholder text | Connect to `POST /api/v1/reports/generate/:spillId` with preview/download capabilities. |

---

## 5. Existing Map & Visualization Components

| Component | Location | Current State | Target Phase 2A Behavior |
|---|---|---|---|
| **MapView** | `src/components/map/MapView.jsx` | Placeholder `<div>` container | Initialize real Leaflet / React-Leaflet map with OpenStreetMap / dark tile layer centered on marine region (e.g. Mumbai offshore [18.9, 72.8]). |
| **SlickLayer** | `src/components/map/SlickLayer.jsx` | Text overlay counter | Render GeoJSON / Polygon from `spill.geomWkt` or bounding box with slick styling. |
| **OriginLayer** | `src/components/map/OriginLayer.jsx` | Text coordinate label | Render Leaflet Marker / CircleMarker at `[originLat, originLng]` with animated pulse. |
| **TrajectoryLayer** | `src/components/map/TrajectoryLayer.jsx` | Text counter | Render Polyline for backward drift path (cyan/dashed) and forward drift path (amber/solid) from `GET /spills/:id/drift`. |
| **VesselLayer** | `src/components/map/VesselLayer.jsx` | Text counter | Render vessel markers with candidate attribution scores and AIS track trails. |

---

## 6. Existing Drift & Vessel Components

| Component | Location | Current State | Integration Need |
|---|---|---|---|
| **DriftAnimation** | `src/components/drift/DriftAnimation.jsx` | Progress string | Connect playback timer to interpolate time along the 24 backward and 6 forward trajectory points. |
| **DriftControls** | `src/components/drift/DriftControls.jsx` | Play/Pause buttons | Bind to playback state and speed selector. |
| **Timeline** | `src/components/drift/Timeline.jsx` | Basic slider input | Sync slider to drift point timestamps from backend. |
| **VesselRankTable** | `src/components/vessels/VesselRankTable.jsx` | Basic HTML table | Display real candidates from `GET /spills/:id/vessels` with scores, ranks, and evidence inspection modal. |
| **VesselScore** | `src/components/vessels/VesselScore.jsx` | Progress bar | Display composite attribution score and breakdown (proximity, temporal, trajectory, anomaly). |
| **VesselDetails** | `src/components/vessels/VesselDetails.jsx` | Static panel | Display candidate vessel specs, AIS passing distance, time gap, and historical track. |

---

## 7. State Management & Routing Architecture

1. **State Store (`src/app/store/`)**:
   - `authStore.js`: Zustand store for `token`, `user`, `login()`, `logout()`, `checkAuth()`. Persist token in `localStorage`.
   - `spillStore.js`: Zustand store for active analysis, selected spill, drift simulation state, candidate vessels.
2. **Routing (`src/app/router/`)**:
   - Create `AppRouter.jsx` with routes:
     - `/login` (Public)
     - `/` / `/dashboard` (Protected)
     - `/analysis/new` (Protected)
     - `/analysis/:id` (Protected)
     - `/spills/:id` (Protected)
     - `/vessels/:mmsi` (Protected)
     - `/reports` (Protected)
   - Implement `ProtectedRoute` component redirecting unauthenticated users to `/login`.
3. **Layout & Providers (`src/app/providers/`)**:
   - App-level layout with Navigation Bar, User Avatar, Status Badge, Error Boundaries.

---

## 8. Missing Wiring & Immediate Actions

1. Create `apps/web/index.html` with Leaflet CSS and application root.
2. Setup `apps/web/.env.example` and `apps/web/.env` with `VITE_API_BASE_URL=http://localhost:4000/api/v1`.
3. Configure `src/api/client.js` with Axios interceptors for Authorization token injection and error unwrapping.
4. Implement `src/api/auth.api.js`, `src/api/jobs.api.js`, `src/api/spills.api.js`, `src/api/vessels.api.js`, `src/api/reports.api.js`.
5. Create Zustand `useAuthStore` and `useSpillStore`.
6. Implement `Login.jsx` and wire full authentication flow with demo user (`analyst@oil-spill.dev` / `Password@123`).
7. Implement real Leaflet `MapView` rendering actual WKT/GeoJSON polygons, drift lines, origin markers, and vessel tracks.
8. Wire `Dashboard`, `NewAnalysis`, `Analysis`, `SpillDetails`, `VesselDetails`, and `Reports` pages to real backend endpoints.
9. Verify entire flow: Login → Dashboard → New Analysis (`demo-scene-001`) → Poll Job → View Analysis with Map + Drift + Vessels → View Vessel AIS Track → Generate Report.
10. Ensure clean production build with `pnpm --filter @oil-spill/web build`.
