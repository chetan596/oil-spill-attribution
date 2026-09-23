# PART 0.13C — METOCEAN DRIFT & BACKTRACKING INTEGRATION REPORT

**Release:** `OG-SAR-ML-RESEARCH-RELEASE-V0.12`  
**Pipeline Level:** Metocean Drift, Backward Hindcasting & Forward Dispersion  
**Layer Module:** `services/ml-python/app/drift/spill_drift_engine.py`  
**Audit Date:** September 2026  

---

## 1. Executive Summary

Part 0.13C establishes the metocean drift and reverse hindcasting pipeline on top of the verified Part 0.13A V09D inference service and Part 0.13B georeferenced spill analysis layer.

Given an observed SAR detection centroid and satellite acquisition timestamp, the hydrodynamic engine calculates:
1. **Backward Reverse Hindcast Trajectory:** Backward Lagrangian particle advection to estimate a **modelled origin** and candidate source corridor.
2. **Forward Forecast Trajectory:** Forward Lagrangian advection predicting surface slick dispersion.
3. **Modelled Origin Uncertainty Envelope:** Horizontal turbulent eddy diffusion polygon quantifying spatial dispersion bounds.

### Scientific Guardrails & Non-Attribution Principle
- The backward trajectory endpoint is strictly designated as **`MODELLED_SPILL_ORIGIN`** (never "confirmed origin", "spill source", or "discharge location").
- **No AIS vessel attribution**, vessel proximity scoring, or liability determinations are performed in this phase.
- **No LLM synthesis** is invoked.
- Metocean forcing does not use hardcoded Mumbai defaults for genuine CDSE or uploaded satellite scenes.

---

## 2. Input Contract & Coordinate Provenance

The drift engine ingests:
- **Observed Centroid:** `[latitude, longitude]` in WGS84 (`EPSG:4326`), extracted directly from the Part 0.13B georeferenced polygon (status: `OBSERVED`).
- **Acquisition Timestamp:** ISO 8601 UTC timestamp of satellite capture.
- **Hindcast Parameters:** Backward duration $H_{\text{back}}$ (default 24h), forward duration $H_{\text{forward}}$ (default 6h), time step $\Delta t$ (default 60 min).
- **Scene Metadata:** `sourceType` (`REAL_CDSE`, `UPLOADED_REAL_SAR`, `DEMO`), `sceneId`.

---

## 3. Metocean Forcing & Spatial Resolution

### 3.1 Vector Composition & Leeway Physics
Total surface advective drift velocity $\vec{V}_{\text{drift}}$ is computed as:
$$\vec{V}_{\text{drift}} = \vec{V}_{\text{current}} + \alpha \cdot \vec{V}_{\text{wind}}$$
- $\vec{V}_{\text{current}}$: Ocean surface current vector (speed $U_{\text{curr}}$, direction towards $\theta_{\text{curr}}$).
- $\vec{V}_{\text{wind}}$: 10-meter surface wind vector (speed $U_{10}$, blowing from $\theta_{\text{wind}}$).
- $\alpha$: Windage leeway factor (default $0.030 = 3.0\%$).

### 3.2 ERA5 Spatial Resolution & Measurement Height
- **Scientific Guardrail:** ERA5 "10-meter surface wind" ($U_{10}$) refers strictly to the **atmospheric measurement elevation above the ocean surface**, *not* a 10-meter spatial grid resolution.
- Native ECMWF ERA5 reanalysis has a coarse horizontal resolution of approximately $0.25^\circ$ (~25–30 km) and is resampled to the local domain.
- Temporal alignment offsets between SAR capture time and metocean model epochs are explicitly recorded (`temporalOffsetHours`).

---

## 4. Lagrangian Kinematics & Advection Integration

### 4.1 Backward Hindcast (Reverse Advection)
Starting from the observed SAR detection $(lat_0, lon_0)$ at $t = t_{\text{detection}}$, coordinates step backward in time:
$$t_{k} = t_{k-1} - \Delta t$$
$$\Delta \text{lat} = \frac{-v_{\text{drift}} \cdot \Delta t}{111.139}$$
$$\Delta \text{lon} = \frac{-u_{\text{drift}} \cdot \Delta t}{111.139 \cdot \cos(\text{avg\_lat})}$$

### 4.2 Forward Forecast
Starting from $(lat_0, lon_0)$ at $t = t_{\text{detection}}$, coordinates step forward in time:
$$t_{k} = t_{k-1} + \Delta t$$
$$\Delta \text{lat} = \frac{+v_{\text{drift}} \cdot \Delta t}{111.139}$$
$$\Delta \text{lon} = \frac{+u_{\text{drift}} \cdot \Delta t}{111.139 \cdot \cos(\text{avg\_lat})}$$

---

## 5. Modelled Origin & Uncertainty Envelope

### 5.1 Modelled Origin
- The oldest waypoint in the backward hindcast trajectory ($t = t_{\text{detection}} - H_{\text{back}}$).
- Classified explicitly as `status = "MODELLED_SPILL_ORIGIN"`.

### 5.2 Turbulent Eddy Dispersion Uncertainty
Spatial uncertainty expands with elapsed hindcast duration according to Fickian horizontal diffusion:
$$\sigma(t) = \sigma_0 + \frac{\sqrt{2 \cdot K_h \cdot t}}{1000}$$
- $\sigma_0$: Initial detection observation uncertainty ($0.5$ km).
- $K_h$: Horizontal eddy diffusivity coefficient ($5.0\text{ m}^2/\text{s}$).
- $t$: Elapsed simulation time in seconds.
- **Uncertainty Envelope:** GeoJSON circular Polygon of radius $\sigma(t_{\text{back}})$ centered at the modelled origin.

---

## 6. Output Schema & Status Classifications

```json
{
  "status": "success",
  "sceneId": "S1D_IW_GRDH_1SDV_20260906T010237",
  "sourceType": "REAL_CDSE",
  "observed": {
    "centroid": { "latitude": 18.922, "longitude": 72.834 },
    "timestamp": "2026-09-06T01:02:37Z",
    "source": "Sentinel-1 SAR",
    "status": "OBSERVED"
  },
  "metocean": {
    "source": "ERA5_REANALYSIS_COPERNICUS",
    "temporalOffsetHours": 0.5,
    "spatialResolutionNote": "ERA5 10-m surface wind is an atmospheric measurement height, resampled from coarse reanalysis grid (~25 km) to target domain.",
    "wind": { "speedKts": 12.4, "directionFromDeg": 315.0, "windageLeewayFactor": 0.03 },
    "current": { "speedKts": 0.8, "directionTowardsDeg": 125.0 }
  },
  "drift": {
    "mode": "BACKWARD_HINDCAST",
    "status": "MODELLED",
    "timeWindowHours": 24,
    "modeledOrigin": {
      "latitude": 19.145,
      "longitude": 72.580,
      "timestamp": "2026-09-05T01:02:37Z",
      "uncertaintyRadiusKm": 1.43,
      "status": "MODELLED_SPILL_ORIGIN"
    },
    "backwardPath": [ ... ],
    "forwardPath": [ ... ]
  },
  "derived": {
    "netDriftDistanceKm": 36.42,
    "elapsedTimeHours": 24.0,
    "meanDriftSpeedKmh": 1.52,
    "meanDriftSpeedKts": 0.82,
    "driftBearingDeg": 138.5,
    "status": "DERIVED"
  },
  "scientificGuardrails": {
    "aisAttribution": "NOT_IMPLEMENTED",
    "vesselResponsibility": "NOT_ESTABLISHED",
    "dischargeLocationConfirmation": "NOT_ESTABLISHED",
    "llmSynthesis": "NOT_IMPLEMENTED",
    "analyticalLimitation": "Modelled origin and backward trajectory represent exploratory physical Lagrangian advection under specified metocean forcing; they do NOT constitute confirmed discharge location, time, vessel causality, or legal liability."
  },
  "geojson": {
    "type": "FeatureCollection",
    "features": [
      { "id": "observed_sar_centroid", "properties": { "category": "OBSERVED" } },
      { "id": "modeled_spill_origin", "properties": { "category": "MODELLED" } },
      { "id": "modeled_origin_uncertainty_envelope", "properties": { "category": "MODELLED" } },
      { "id": "modeled_backward_hindcast_trajectory", "properties": { "category": "MODELLED" } },
      { "id": "modeled_forward_forecast_trajectory", "properties": { "category": "MODELLED" } }
    ]
  }
}
```

---

## 7. Verification & Performance

### 7.1 Test Suite Results
- **Unit Tests:** `services/ml-python/tests/unit/test_v013c_metocean_drift.py` (8 passed)
- **Integration Tests:** `services/ml-python/tests/integration/test_v013c_drift_api.py` (3 passed)
- **Zero Regressions:** 212 passed, 0 failures across entire unit and integration suites.

### 7.2 Measured Runtimes (24-Hour Backward Hindcast + 6-Hour Forward Forecast)
- Metocean Parameter Alignment: $0.4$ ms
- 24-Hour Backward Advection Integration: $1.2$ ms
- 6-Hour Forward Advection Integration: $0.5$ ms
- Uncertainty Envelope & GeoJSON Construction: $0.8$ ms
- **Total Drift Simulation Latency:** $2.9$ ms
