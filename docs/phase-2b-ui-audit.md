# Phase 2B — UI/UX Audit Report
**SIH26143 — AI-Powered Oil Spill Detection & Vessel Attribution System**
**Date**: 2026-09-12
**Scope**: Frontend UI/UX, Component Architecture, Terminology, and SIH Demo Readiness

---

## 1. Current Pages & Structure

The React application (`apps/web`) contains 7 primary routes and pages:
1. **`/login` (`Login.jsx`)**: User authentication screen with email & password fields, error messaging, and demo analyst fast-fill button.
2. **`/dashboard` (`Dashboard.jsx`)**: Overview screen displaying top-level metrics, active incidents list with `SpillCard` items, and Leaflet overview map.
3. **`/analysis/new` (`NewAnalysis.jsx`)**: Job dispatch form for SAR scene ID (`demo-scene-001`) and hindcast time window (24h), with pipeline description sidebar.
4. **`/analysis/:id` (`Analysis.jsx`)**: Live analysis monitor polling `GET /jobs/:id` every 2s with progress bar, transitioning to multi-layer Leaflet workspace on completion.
5. **`/spills/:id` (`SpillDetails.jsx`)**: Incident details inspector rendering slick parameters, drift vector paths, and candidate vessel list.
6. **`/vessels/:mmsi` (`VesselDetails.jsx`)**: AIS telemetry inspector showing vessel metadata, track map, and waypoint log table.
7. **`/reports` (`Reports.jsx`)**: Investigation dossier generator consuming `POST /reports/generate/:spillId` with print formatting.

---

## 2. Navigation & Layout Review

- **Current State**: `Navbar.jsx` provides links to Dashboard, New Analysis, Reports, system status indicator, user info, and logout.
- **Identified Deficiencies**:
  - Lacks an explicit visual tag indicating **"Demo Mode / Configured Scenario (demo-scene-001)"**.
  - Lacks active breadcrumbs or contextual navigation back to active analyses or selected incidents.
  - Sidebar / secondary navigation could be improved on wide screens to preserve map real estate.

---

## 3. Map Experience & Visual Hierarchy

- **Current State**: `MapView.jsx` uses Leaflet with dark CartoDB basemap tiles, custom markers, polygons, and polylines.
- **Identified Deficiencies**:
  - **Missing In-Map Legend**: Judges and analysts cannot immediately distinguish cyan dashed lines (backward hindcast) from green solid lines (forward drift) or red polygons (slick) without clicking popups.
  - **Missing Layer Visibility Toggles**: No floating control to toggle Slicks, Origin, Drift Paths, or Vessels on/off.
  - **Popup Density**: Popups contain basic text; they need structured metric badges and clearer action buttons.

---

## 4. Pipeline Stepper & Analysis Monitor

- **Current State**: Displays a linear progress bar and stage label during polling.
- **Identified Deficiencies**:
  - The 5-stage pipeline (`QUEUED` → `RUNNING` → `DETECTION` → `HINDCAST` → `ATTRIBUTION` → `COMPLETED`) is rendered as plain text rather than an intuitive, high-tech animated stage stepper.
  - Post-completion workspace needs tabbed or split compartmentalization so analysts can toggle between **"Detection Overview"**, **"Reverse Drift Trajectory"**, and **"Vessel Attribution Evidence"**.

---

## 5. Drift Controls & Timeline

- **Current State**: Slider scrubbing from step 0 to step 24 with Play/Pause button.
- **Identified Deficiencies**:
  - Does not prominently explain the physical meaning: **Backward Hindcast** (answering *"Where did the discharge originate?"*) vs. **Forward Forecast** (answering *"Where is the oil drifting?"*).
  - Needs clearer timestamp display indicating hours elapsed before satellite acquisition.

---

## 6. Vessel Attribution & Evidentiary Terminology

- **Current State**: Table showing candidate vessels with scores and passing metrics.
- **Identified Deficiencies**:
  - Needs expandable score accordion explaining how the 4 components (**Proximity 35%**, **Temporal 25%**, **Trajectory 20%**, **Anomaly 20%**) combine into the final score.
  - Must strictly enforce non-defamatory analytical terminology: **"Candidate Vessel"** and **"Attribution Score"**, with an explicit legal disclaimer banner.

---

## 7. Reports & Legal Dossier UI

- **Current State**: Generates text dossier from backend endpoint.
- **Identified Deficiencies**:
  - Needs structured visual sections for **Observed SAR Data**, **Numerical Model Output**, and **Candidate Vessel Ranking**, with print CSS optimization.
  - Remove any unverified claim of being "Court-Admissible" unless explicitly qualified as an "Analytical Evidence Dossier".

---

## 8. Design System, Responsiveness & Polish Plan

| Component | Target Enhancement |
|---|---|
| **Theme & Typography** | JetBrains Mono for coordinates/MMSI/timestamps, Inter for UI, curated slate/cyan/amber/rose palette. |
| **Map Layers** | Add floating Map Legend + Layer Toggles (Slicks, Origin, Hindcast, Forecast, Vessels). |
| **Pipeline Stepper** | Visual interactive stepper with pulsating active state and checkmark completed states. |
| **Vessel Attribution** | Expandable multi-attribute radar/progress breakdown and analytical disclaimer. |
| **Demo Badge** | Prominent "Demonstration Scenario: Offshore Mumbai (demo-scene-001)" indicator. |
| **Print Dossier** | Print-optimized stylesheet for 1-click dossier export. |
| **Accessibility** | ARIA attributes, semantic landmarks, high contrast ratios on dark background. |
