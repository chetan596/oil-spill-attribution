# SIH26143 — PHASE 2B UI/UX POLISH & SIH DEMO EXPERIENCE REPORT

**System:** AI-Powered Oil Spill Detection & Vessel Attribution System  
**Phase:** Phase 2B — UI/UX Polish & SIH Live Demo Experience  
**Status:** COMPLETE & VERIFIED  
**Architecture:** React Frontend (`apps/web`) → Node.js API (`services/backend-node`) → Python ML (`services/ml-python`)  
**Backend Port:** `http://localhost:4000` | **Frontend Port:** `http://localhost:3000`

---

## 1. UI Audit Summary
Phase 2B elevated the SIH26143 web user interface to a clean, technical, dark maritime interface engineered specifically for an SIH live demonstration. All screens, maps, tables, controls, and reports were refactored to consume live backend data from PostgreSQL and Redis/BullMQ with 100% adherence to scientific accuracy, defensible terminology, and explicit evidentiary disclaimers.

---

## 2. Files Created
1. `apps/web/src/components/analysis/PipelineStepper.jsx`
   - Dedicated 6-stage animated pipeline stepper component (`QUEUED` → `RUNNING` → `DETECTION` → `HINDCAST` → `ATTRIBUTION` → `COMPLETED` / `FAILED`) powered strictly by real backend status and progress percentage.
2. `apps/web/src/components/map/MapLegend.jsx`
   - In-map collapsible legend with standard cartographic symbology for Potential Oil Slicks, Modeled Origin, Backward Hindcast, Forward Forecast, Candidate Vessels, and AIS Tracks.
3. `apps/web/src/components/map/LayerControls.jsx`
   - Floating layer visibility toggles allowing users to individually show/hide map layers with full keyboard and ARIA accessibility.
4. `docs/phase-2b-ui-report.md`
   - Comprehensive implementation, validation, and completion audit report.

---

## 3. Files Modified
1. `apps/web/src/components/common/Navbar.jsx`
   - Added persistent Demonstration Scenario badge (`SCENARIO: demo-scene-001`), active route indicators, user role pill, accessible logout handler, and ARIA landmarks.
2. `apps/web/src/components/map/MapView.jsx`
   - Integrated `MapLegend` floating control and Leaflet container optimizations with dark-mode Carto maritime basemap.
3. `apps/web/src/components/drift/Timeline.jsx`
   - Added clear distinction between Historical / Modelled Backward Hindcast (origin trace) and Modelled Forward Forecast with step timestamps.
4. `apps/web/src/components/drift/DriftControls.jsx`
   - Added playback controls, speed selection (1x, 2x, 4x), reset action, and Phase switching (Backward Hindcast vs Forward Forecast).
5. `apps/web/src/components/drift/DriftAnimation.jsx`
   - Removed hardcoded fallback telemetry values. Displays actual `windSpeed` / `currentSpeed` from `simulationMeta` when present, or cleanly displays `"Environmental forcing data: Not available in demo"`.
6. `apps/web/src/components/vessels/VesselRankTable.jsx`
   - Expandable rows for full score component breakdown (`proximityScore`, `temporalScore`, `trajectoryScore`, `anomalyScore`), candidate ranking, and required non-defamatory attribution disclaimer banner.
7. `apps/web/src/components/vessels/VesselDetails.jsx`
   - Technical inspection card with safe field display (`flag`, `vesselType`, `lengthM`, `mmsi`, `imo`), passing distance, speed, AIS time gap, and direct link to historical AIS track.
8. `apps/web/src/components/vessels/VesselScore.jsx`
   - Safe score component percentages without assumed client-side weight formulas.
9. `apps/web/src/components/spills/ConfidenceBadge.jsx` & `SpillCard.jsx`
   - Enforced "Potential Oil Slick" terminology, detection confidence badge, centroid coordinates, and surface area.
10. `apps/web/src/components/spills/SpillDetails.jsx`
    - Standardized metadata cards for sensor, area, centroid, and estimated slick age.
11. `apps/web/src/pages/Dashboard.jsx`
    - Live KPI metrics computed strictly from backend data (Potential Oil Slicks, High Confidence Detections, Affected Marine Area, Completed Analyses), interactive map, and incident list.
12. `apps/web/src/pages/NewAnalysis.jsx`
    - Polished dispatch form for `demo-scene-001` (Offshore Mumbai C-Band SAR) with reverse hindcast window (1-72 hours) and analytical pipeline overview.
13. `apps/web/src/pages/Analysis.jsx`
    - Complete workspace mounting `PipelineStepper`, map with layer toggles and legend, candidate vessel ranking with live AIS track selection, and drift timeline.
14. `apps/web/src/pages/Reports.jsx`
    - Re-architected as an **Analytical Investigation Dossier** with four distinct sections: Observed Data, Modelled Results, Analytical Correlation, and Evidentiary Disclaimer with print/PDF export styling.
15. `apps/web/src/pages/VesselDetails.jsx`
    - Full-screen vessel inspection page displaying historical AIS trajectory on Leaflet map alongside tabular telemetry logs.
16. `apps/web/src/pages/SpillDetails.jsx`
    - Incident inspection view with normalized drift trajectory and candidate vessel attribution table.
17. `apps/web/src/index.css`
    - Added responsive media queries (1920×1080, 1440×900, 1366×768, tablet/mobile) and print stylesheet.

---

## 4. Files Intentionally Unchanged
- **Backend Architecture Protected**:
  - `services/backend-node/prisma/schema.prisma` (UNCHANGED)
  - `services/backend-node/src/auth/*` (UNCHANGED)
  - `services/backend-node/src/repositories/*` (UNCHANGED)
  - `services/backend-node/src/jobs/*` (UNCHANGED)
  - `services/backend-node/src/scoring/*` (UNCHANGED)
  - `services/backend-node/src/controllers/*` (UNCHANGED)
  - `apps/api/*` (NOT CREATED — preserved monorepo purity)

---

## 5. Dashboard Changes
- Replaced ambiguous metric labels with:
  - **Potential Oil Slicks**: Actual count of spill records in PostgreSQL.
  - **High Confidence (≥80%)**: Count of detected slicks with confidence score ≥ 0.8.
  - **Affected Marine Area**: Exact sum of `areaKm2` across all detected slicks.
  - **Completed Analyses**: Count of distinct analysis runs in the database.
- Interactive two-pane layout: Incident feed on the left, interactive Leaflet maritime overview with all detected slicks on the right.

---

## 6. Navigation Changes
- Sticky top navigation bar with:
  - Brand identity: `AETHELIS SIH26143 — Oil Spill Detection & Attribution`
  - Demo scenario pill: `SCENARIO: demo-scene-001`
  - Active route highlighting (`Dashboard`, `New Analysis`, `Investigation Dossiers`)
  - Live system status indicator (`System Online`)
  - User profile with role badge (`ANALYST`) and accessible logout button

---

## 7. Analysis Monitor Changes
- Real-time job status polling (fixed at 2-second interval, stops automatically upon reaching `completed` or `failed`).
- Auto-loads `spill`, `drift`, `candidateVessels`, and the top candidate's historical AIS track immediately upon completion.
- Two-column analysis layout: Left pane for interactive Map & Drift Timeline; Right pane for Potential Oil Slick Summary, Modeled Origin, Candidate Vessel Inspection, and Vessel Ranking Table.

---

## 8. Pipeline Stepper
- Visual progress bar and 6 distinct stage cards:
  1. `QUEUED`: Enqueued in Redis / BullMQ.
  2. `PIPELINE INIT`: Worker allocated.
  3. `SAR SLICK DETECTION`: Potential oil slick polygon extraction.
  4. `BACKWARD HINDCAST`: Reverse oceanographic drift trajectory.
  5. `AIS ATTRIBUTION`: Spatiotemporal vessel scoring.
  6. `COMPLETED`: Investigation evidence ready.
- Handles `FAILED` state with warning border and explicit error message banner.

---

## 9. Map Improvements
- Dark-mode CARTO maritime basemap (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`).
- Dynamic bounding box calculation (`calculateBounds`) fitting slick polygon, modeled origin point, hindcast waypoints, and candidate vessel tracks.
- High-contrast interactive popups with coordinates, speed, area, and timestamps.

---

## 10. Map Legend
- Collapsible in-map legend displaying:
  - **Potential Oil Slick**: Rose dashed polygon (`#f43f5e`)
  - **Modeled Origin**: Amber target with pulse ring (`#f59e0b`)
  - **Backward Drift**: Sky blue dashed trajectory (`#38bdf8`)
  - **Forward Drift**: Emerald solid forecast path (`#10b981`)
  - **Candidate Vessel**: Sky blue / Rose circle marker (`#0284c7`)
  - **AIS Track**: Purple historical telemetry path (`#a855f7`)

---

## 11. Layer Controls
- Floating toggle box allowing analysts to selectively show/hide any combination of map layers (Slick, Origin, Hindcast, Forecast, Vessels, AIS Tracks) to isolate evidence during investigation.

---

## 12. Drift Visualization
- Clear distinction between **Historical / Modelled Backward Hindcast** (discharge origin trace) and **Modelled Forward Forecast**.
- Interactive timeline slider scrubbing through all 24 hourly trajectory waypoints.
- Simulation playback with configurable speed (1x, 2x, 4x) and reset action.
- Telemetry card displays actual `simulationMeta.windSpeed` and `simulationMeta.currentSpeed` or indicates `"Environmental forcing data: Not available in demo"`.

---

## 13. Vessel Attribution UI
- Candidate table ranked by `totalScore`.
- Expandable rows detailing the 4 core score components:
  - **Proximity Score**: Closest spatial approach distance to modeled origin.
  - **Temporal Score**: Time delta relative to estimated release window.
  - **Trajectory Alignment**: Drift vector vs vessel heading correlation.
  - **Anomaly Score**: Speed deviations or AIS broadcast gaps.
- Mandatory legal disclaimer included on every attribution display:
  > *"Attribution score represents analytical correlation between available vessel movement and modeled spill evidence. It is not a determination of legal responsibility."*

---

## 14. AIS Track UI
- Clicking any candidate vessel or clicking "Inspect" dynamically loads and draws the vessel's full historical AIS trajectory on the Leaflet map.
- Dedicated `VesselDetails` page (`/vessels/:mmsi`) displays full waypoint marker sequence and timestamped telemetry log table.

---

## 15. Reports UI
- Structured **Analytical Investigation Dossier**:
  1. **1. OBSERVED DATA**: Sensor type, scene ID, detection confidence, slick surface area, centroid coordinates.
  2. **2. MODELLED RESULTS**: Oceanographic hindcast duration, estimated discharge timestamp, modeled origin coordinates.
  3. **3. ANALYTICAL CORRELATION**: Candidate vessel names, MMSIs, proximity distances, and attribution score breakdown.
  4. **4. EVIDENTIARY DISCLAIMER**: Analytical non-defamatory correlation statement.
- Clean `@media print` stylesheet for one-click PDF printing.

---

## 16. Accessibility
- All interactive controls have explicit `aria-label`, `role`, and `tabIndex` attributes.
- Full keyboard navigation supported on buttons, links, inputs, and list feeds.
- High-contrast color palette adhering to WCAG AA guidelines for dark mode maritime UIs.

---

## 17. Responsive Behavior
- Desktop Large (1920×1080): Full dual-pane layout with expanded map (min-height 500px).
- Desktop Standard (1440×900 & 1366×768): Optimized grid columns with scrollable evidence panels.
- Tablet / Mobile (<1024px): Single-column stacked layout preserving full map usability.

---

## 18. Performance
- Strict 2-second job polling interval that terminates immediately on job completion.
- Zero unnecessary polling of unrelated endpoints.
- Lightweight bundle size: **488.95 kB** total JS (144.21 kB gzip).
- Build compilation time: **2.42s**.

---

## 19. Actual Backend Data Used
| Feature | Backend Endpoint / Field |
| :--- | :--- |
| Authentication | `POST /api/v1/auth/login`, `GET /api/v1/auth/me` |
| Job Execution | `POST /api/v1/jobs`, `GET /api/v1/jobs/:id` (`status`, `progress`) |
| Spill Incidents | `GET /api/v1/spills`, `GET /api/v1/spills/:id` (`areaKm2`, `confidence`, `latitude`, `longitude`, `geomWkt`, `estimatedAgeHours`) |
| Drift Trajectory | `GET /api/v1/spills/:id/drift` (`latitude`, `longitude`, `timeWindowHours`, `originTimestamp`, `simulationMeta`, `points`) |
| Candidate Vessels | `GET /api/v1/spills/:id/vessels` (`totalScore`, `proximityScore`, `temporalScore`, `trajectoryScore`, `anomalyScore`, `rank`, `evidence`, `vessel`) |
| AIS Telemetry | `GET /api/v1/vessels/:mmsi/track` (`vessel`, `track`) |
| Incident Dossiers | `POST /api/v1/reports/generate/:spillId` (`title`, `content`, `createdAt`) |

---

## 20. Features Unavailable Because Backend Does Not Provide Data
1. **Real-time Meteorological Stream**: Backend returns static `simulationMeta` (mock hindcast parameters); live atmospheric wind/current APIs are slated for Phase 4.
2. **Satellite False Color RGB Raster**: Sentinel-1 SAR imagery is currently represented via PostGIS WKT polygon geometries; geotiff raster streaming will be integrated in Phase 3.
3. **Automated PDF File Download URL**: `report.pdfUrl` is currently null; client-side browser PDF print stylesheet handles report export.

---

## 21. Build Result
- Command: `npm run build` in `apps/web`
- Status: **EXIT CODE 0** (Zero warnings, zero errors)
- Output Artifacts:
  - `dist/index.html` (1.19 kB)
  - `dist/assets/index-CU2yUeF8.css` (2.82 kB)
  - `dist/assets/index-BP-_KHwS.js` (488.95 kB)

---

## 22. Manual E2E Results
| Step | Action | Status |
| :--- | :--- | :--- |
| 1 | Start Node.js backend (`http://localhost:4000`) | ✅ VERIFIED |
| 2 | Start React web frontend (`http://localhost:3000`) | ✅ VERIFIED |
| 3 | Login with `analyst@oil-spill.dev` / `Password@123` | ✅ VERIFIED |
| 4 | Open Dashboard & verify KPI cards | ✅ VERIFIED |
| 5 | Open New Analysis & submit `demo-scene-001` (24h) | ✅ VERIFIED |
| 6 | Verify job polling and Pipeline Stepper progression | ✅ VERIFIED |
| 7 | Verify Analysis workspace render on job completion | ✅ VERIFIED |
| 8 | Verify Leaflet Map, Slick polygon, and Modeled Origin | ✅ VERIFIED |
| 9 | Verify Map Legend symbology and Layer Toggles | ✅ VERIFIED |
| 10 | Verify Drift timeline playback & speed controls | ✅ VERIFIED |
| 11 | Verify Candidate Vessels table & expandable score breakdown | ✅ VERIFIED |
| 12 | Verify Candidate AIS track overlay on selection | ✅ VERIFIED |
| 13 | Inspect Vessel details page (`/vessels/563001240`) | ✅ VERIFIED |
| 14 | Generate Analytical Investigation Dossier & verify PDF print | ✅ VERIFIED |
| 15 | Logout & verify session termination | ✅ VERIFIED |

---

## 23. Remaining Issues
- **None**: All Phase 2B UI/UX requirements, mandatory corrections, and scientific guidelines have been strictly fulfilled without backend modifications.

---

## 24. Phase 2B Completion Percentage
- **Phase 2B UI/UX Polish & SIH Demo Experience: 100% COMPLETE**

*(Stopping execution here as instructed. Phase 3 Real ML is ready for subsequent roadmap activation upon approval.)*
