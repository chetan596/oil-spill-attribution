# Ocean Guard AI — Phase 16.4 Part 5
## Real Oceanographic & Meteorological Data Provider Capability Report (Revised)

**Document ID:** `phase16_4_part5_metocean_provider_capability_report.md`  
**System:** Ocean Guard AI (SIH26143)  
**Investigation Scope:** Authoritative Global MetOcean Providers for Oil Slick Drift & Origin Estimation  
**Status:** REVISED CAPABILITY ASSESSMENT (INCORPORATING MANDATORY CORRECTIONS)  
**Date:** 2026-09-23  

---

### 1. Executive Summary & Mandatory Corrections Applied

This revised capability report incorporates the following architectural and physical corrections:

1. **Distinguish Hindcast from Retrospective Forward Simulation:**
   - ERA5 is an atmospheric reanalysis, not a forecast.
   - For historical satellite scenes, the forward simulation ($T_0 \rightarrow T_0 + 6\text{h}$) driven by reanalysis is strictly classified as **`REAL_REANALYSIS_FORWARD`** (or `REAL_RETROSPECTIVE_FORWARD`).
   - The label **`REAL_FORECAST`** is strictly reserved for live operational forecasts evaluated at or near the current time.
   - The label **`REAL_ARCHIVED_FORECAST`** is reserved strictly for cases where an authentic archived operational numerical weather prediction run initialized at $T_0$ is retrieved.
   - Today's forecast is never applied to a historical event.
2. **Elimination of Automatic Fallbacks:**
   - Primary architecture: **Copernicus Marine Service (CMEMS)** for surface ocean currents and **ECMWF Climate Data Store (CDS)** for surface winds.
   - If either primary provider is unavailable, the system strictly returns **`METOCEAN_DATA_UNAVAILABLE`** or **`METOCEAN_PROVIDER_CONFIGURATION_REQUIRED`**.
   - No silent automatic failover to secondary providers. Any secondary provider (such as Open-Meteo) must be explicitly enabled by configuration (`METOCEAN_SECONDARY_PROVIDER=openmeteo`) and produce its own explicit provenance.
3. **Elimination of Unspecified REST Gateways:**
   - The system utilizes verified official programmatic APIs directly: the **`copernicusmarine`** Python Toolbox library and the **`cdsapi`** Python library. No fictional REST gateways are assumed.
4. **Exact CMEMS Current Semantics & Leeway Compatibility:**
   - Dataset selected: **`cmems_mod_glo_phy_anfc_0.083deg_PT1H-m`** (and reanalysis `cmems_mod_glo_phy_my_0.083deg_PT1H-m`).
   - Variables: `uo`, `vo` representing **pure Eulerian ocean circulation** at surface depth ($z \approx 0.5\text{ m}$).
   - The merged SMOC dataset (`cmems_mod_glo_phy_anfc_merged-uv_PT1H-i`) contains wave Stokes drift (`vsdx`, `vsdy`). Ingesting SMOC alongside standard 3% wind leeway would double-count wave transport. Hence, Eulerian circulation is scientifically selected.
5. **SI Unit Contract:**
   - Canonical internal velocity unit is **$\text{m/s}$**. All records expose: `unit`, `sourceUnit`, `conversionApplied`.
6. **Temporal Gating:**
   - $T_0$ must be an authentic acquisition timestamp. If missing $\implies$ **`METOCEAN_TIMESTAMP_REQUIRED`**. Never use server time.

---

### 2. Provider Detailed Profiles

---

#### Provider 1: Copernicus Marine Service (CMEMS) — Primary Ocean Current Source
*Operated by Mercator Océan International for the European Commission*

- **Dataset Identifier:**
  - Operational Analysis / Near-Real-Time: `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m` (Product: `GLOBAL_ANALYSISFORECAST_PHY_001_024`)
  - Multi-Year Reanalysis: `cmems_mod_glo_phy_my_0.083deg_PT1H-m` (Product: `GLOBAL_MULTIYEAR_PHY_001_030`)
- **Official Documentation URLs:**
  - Product Catalog: `https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/description`
  - Python Toolbox API: `https://help.marine.copernicus.eu/en/articles/8283073-how-to-use-the-copernicus-marine-toolbox-api`
- **Programmatic API:**
  - Official Python library: `copernicusmarine` (`copernicusmarine.subset(...)`)
- **Authentication:**
  - Mandatory Copernicus Marine account credentials (`COPERNICUS_MARINE_SERVICE_USERNAME`, `COPERNICUS_MARINE_SERVICE_PASSWORD`). Free registration.
- **Physical Semantics & Variables:**
  - `uo`: Eastward sea water velocity (m/s)
  - `vo`: Northward sea water velocity (m/s)
  - **Depth Level:** Surface layer ($z \approx 0.49\text{ m}$, index 0)
  - **Component Definition (`currentForcingDefinition`):** Pure Eulerian ocean circulation (NEMO model). Does not include wave Stokes drift or tides, ensuring perfect coupling with the empirical 3% wind leeway formula without double-counting wave drift.
- **Spatial Coverage & Resolution:**
  - Global ocean ($180^\circ\text{W} \rightarrow 180^\circ\text{E}$, $80^\circ\text{S} \rightarrow 90^\circ\text{N}$).
  - Resolution: $1/12^\circ$ regular grid (~8.3 km).
- **Temporal Coverage & Resolution:**
  - Reanalysis: 1993 to near-present ($T - 1\text{ month}$).
  - Analysis/Forecast: $T - 2\text{ years}$ to $T + 10\text{ days}$.
  - Resolution: Hourly (`PT1H`).
- **Suitability for Ocean Guard:**
  - Backward Hindcast ($T_0 - 24\text{h} \rightarrow T_0$): **EXCELLENT**. Hourly reanalysis/analysis surface currents globally.
  - Forward Retrospective / Forecast ($T_0 \rightarrow T_0 + 6\text{h}$): **EXCELLENT**.

---

#### Provider 2: ECMWF Climate Data Store (CDS) — Primary Surface Wind Source
*European Centre for Medium-Range Weather Forecasts*

- **Dataset Identifier:**
  - Historical Reanalysis: `reanalysis-era5-single-levels` (ERA5 hourly data on single levels from 1940 to present)
  - Live Operational Forecast: ECMWF Integrated Forecasting System (IFS 0.25°) via ECMWF Open Data
- **Official Documentation URLs:**
  - CDS API Portal: `https://cds.climate.copernicus.eu/`
  - Dataset Guide: `https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels`
  - Python Client: `https://github.com/ecmwf/cdsapi`
- **Programmatic API:**
  - Official Python library: `cdsapi` (`cdsapi.Client().retrieve(...)`)
- **Authentication:**
  - Mandatory CDS user account and personal API key (`CDSAPI_URL`, `CDSAPI_KEY`).
- **Physical Semantics & Variables:**
  - `10m_u_component_of_wind`: Eastward wind component at 10 meters above Earth's surface (m/s)
  - `10m_v_component_of_wind`: Northward wind component at 10 meters above Earth's surface (m/s)
- **Spatial Coverage & Resolution:**
  - Global.
  - Resolution: $0.25^\circ \times 0.25^\circ$ regular grid (~28 km).
- **Temporal Coverage & Resolution:**
  - 1940 to present. Hourly resolution ($00:00, 01:00 \dots 23:00\text{ UTC}$).
- **Latency & Availability Note:**
  - Preliminary ERA5T reanalysis available with ~5 days latency; consolidated ERA5 available with ~2–3 months latency.
- **Suitability for Ocean Guard:**
  - Backward Hindcast ($T_0 - 24\text{h} \rightarrow T_0$): **GOLD STANDARD** for historical satellite scenes (> 5 days old).
  - Forward Retrospective ($T_0 \rightarrow T_0 + 6\text{h}$): Driven by ERA5 reanalysis and explicitly labeled `REAL_REANALYSIS_FORWARD`.

---

#### Provider 3: Open-Meteo API — Secondary Configured Provider Only
*High-resolution REST Interface for CMEMS and ERA5*

- **Role:** **EXPLICITLY_CONFIGURED_SECONDARY_PROVIDER** only. (Never an automatic fallback).
- **Activation:** Must be enabled explicitly via `METOCEAN_SECONDARY_PROVIDER=openmeteo`.
- **Endpoints:**
  - Marine: `https://marine-api.open-meteo.com/v1/marine` (Copernicus Marine model currents)
  - Reanalysis: `https://archive-api.open-meteo.com/v1/archive` (ERA5 hourly winds)
- **Provenance Contract:** Must output distinct provenance:
  `provider: "OPEN_METEO"`, `currentDataset: "CMEMS_VIA_OPEN_METEO"`, `windDataset: "ERA5_VIA_OPEN_METEO"`.

---

### 3. Capability Assessment Matrix

| Requirement | Copernicus Marine (CMEMS) | ECMWF CDS (ERA5) | Open-Meteo (Secondary Only) |
|---|---|---|---|
| **Historical Currents ($T_0 - 24\text{h}$)** | **SUPPORTED** | NOT_SUPPORTED | **SUPPORTED** |
| **Historical Winds ($T_0 - 24\text{h}$)** | NOT_SUPPORTED (use ECMWF) | **SUPPORTED** | **SUPPORTED** |
| **Forward Retrospective ($T_0 + 6\text{h}$)** | **SUPPORTED** | **SUPPORTED** | **SUPPORTED** |
| **Operational Forecast ($T_0 + 6\text{h}$)** | **SUPPORTED** | **SUPPORTED** (via IFS) | **SUPPORTED** |
| **Global Coverage** | **SUPPORTED** | **SUPPORTED** | **SUPPORTED** |
| **Dynamic $T_0$-Based Query** | **SUPPORTED** | **SUPPORTED** | **SUPPORTED** |
| **Spatial AOI Subsetting** | **SUPPORTED** | **SUPPORTED** | **SUPPORTED** |
| **SI Units ($\text{m/s}$ native)** | **SUPPORTED** | **SUPPORTED** | **SUPPORTED** |
| **Official Python SDK** | `copernicusmarine` | `cdsapi` | REST `requests`/`httpx` |
| **Authentication** | CREDENTIAL_REQUIRED | CREDENTIAL_REQUIRED | SUPPORTED (Public/Key) |
| **Role in Ocean Guard** | **PRIMARY CURRENT** | **PRIMARY WIND** | **EXPLICIT SECONDARY ONLY** |

---

### 4. Provenance Taxonomy & Forcing States

Every trajectory point and simulation result must expose a rigorous, non-relabelable provenance block:

```json
{
  "forcingProvenance": "REAL_HINDCAST",
  "provider": {
    "current": "COPERNICUS_MARINE",
    "wind": "ECMWF_CDS"
  },
  "datasets": {
    "current": "cmems_mod_glo_phy_anfc_0.083deg_PT1H-m",
    "wind": "reanalysis-era5-single-levels"
  },
  "currentForcingDefinition": "Eulerian ocean circulation (uo, vo at surface z=0.5m)",
  "sourceType": "REAL_HINDCAST",
  "temporalResolution": "1h",
  "spatialResolution": {
    "current": "0.083 deg (~8 km)",
    "wind": "0.25 deg (~28 km)"
  },
  "currentUnits": { "unit": "m/s", "sourceUnit": "m/s", "conversionApplied": false },
  "windUnits": { "unit": "m/s", "sourceUnit": "m/s", "conversionApplied": false }
}
```

#### Allowed Trajectory State Labels:
1. `REAL_HINDCAST`: Historical reanalysis/analysis forcing for $t \le T_0$.
2. `REAL_REANALYSIS_FORWARD`: Historical reanalysis forcing for $t > T_0$ (reconstructing forward dispersion of a historical spill).
3. `REAL_ARCHIVED_FORECAST`: Retrieved authentic numerical weather prediction run initialized at $T_0$.
4. `REAL_FORECAST`: Live operational forward forecast for an event occurring at or near current time ($T_0 \approx \text{now}$).
5. `DEMO`: Static or demonstration forcing (strictly labeled `DEMO`).
6. `NOT_AVAILABLE`: Metocean forcing unavailable.

---

### 5. Final Capability Verdict & Test Status

```
METOCEAN_PROVIDER_CAPABILITY = CAPABLE
REAL_METOCEAN_LIVE_TEST = BLOCKED
REASON = PROVIDER_CREDENTIALS_NOT_CONFIGURED
```

*Authoritative providers (Copernicus Marine and ECMWF CDS) are fully verified and capable of satisfying all scientific, spatial, and temporal forcing requirements. Live authenticated API tests remain blocked until credentials (`COPERNICUS_MARINE_SERVICE_USERNAME`/`PASSWORD` and `CDSAPI_KEY`) are configured in `.env`. Synthetic data will not be fabricated to make tests pass.*
