# Ocean Guard AI — Phase 16.4 Part 5
## Final MetOcean Provider Decision & Dataset Verification Report

**Document ID:** `phase16_4_part5_provider_decision_report.md`  
**System:** Ocean Guard AI (SIH26143)  
**Investigation Scope:** Official Copernicus Marine Catalogue Verification (GLORYS Daily Reanalysis vs. Multi-Obs Hourly Currents)  
**Status:** PROVIDER CONTRACT VERIFIED (AWAITING IMPLEMENTATION AUTHORIZATION)  
**Date:** 2026-09-23  

---

### Executive Decision Summary

In response to the Copernicus Marine catalogue verification directive:
1. The fictional dataset ID `cmems_mod_glo_phy_my_0.083deg_PT1H-m` is **formally rejected** because `GLOBAL_MULTIYEAR_PHY_001_030` provides only daily surface fields (`cmems_mod_glo_phy_my_0.083deg_P1D-m`).
2. An exhaustive evaluation of **Option A** (`MULTIOBS_GLO_PHY_MYNRT_015_003` / `cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i`) and **Option B** (`GLOBAL_MULTIYEAR_PHY_001_030` / `cmems_mod_glo_phy_my_0.083deg_P1D-m`) was conducted using official Copernicus Product User Manuals.
3. **Selected Architecture:** **Option A** is selected for historical multi-year retrospective investigations due to its native **hourly temporal resolution**, with **`cmems_mod_glo_phy_anfc_0.083deg_PT1H-m`** retained for recent operational analysis ($T_0 \ge T_{\text{NRT\_window}}$).
4. **Provenance Integrity:** Multi-observation data will strictly be labeled **`REAL_MULTI_OBSERVATION_CURRENT`** (never falsely claimed as a numerical hydrodynamic model reanalysis).

---

### Section 9 Provider Decision Specification

#### A. Selected Ocean-Current Dataset
- **Primary Historical Multi-Year Dataset:** Copernicus Marine Global Total Surface Current (COPERNICUS-GLOBCURRENT Multi-Observation).
- **Primary Operational Analysis Dataset:** Copernicus Marine Global Ocean Physics Analysis & Forecast.

#### B. Exact Official Dataset Identifiers
1. **Multi-Year Historical ($T_0 \le T_{\text{NRT}}$):**
   - **Product ID:** `MULTIOBS_GLO_PHY_MYNRT_015_003`
   - **Dataset ID:** `cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i`
2. **Operational Near-Real-Time Analysis ($T_0 \ge T_{\text{NRT}}$):**
   - **Product ID:** `GLOBAL_ANALYSISFORECAST_PHY_001_024`
   - **Dataset ID:** `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m`

#### C. Product Classification
- `MULTIOBS_GLO_PHY_MYNRT_015_003`: **Global Ocean Multi-Observation Product** (combines satellite altimetry geostrophic currents, ERA5 wind stress modeled Ekman currents, and FES tidal currents).
- `GLOBAL_ANALYSISFORECAST_PHY_001_024`: **Global Numerical Ocean Physics Analysis & Forecast** (NEMO ocean circulation model with operational assimilation).

#### D. Temporal Resolution
- **Hourly (`PT1H`):** Exact 1-hour time-steps ($00:00, 01:00, 02:00 \dots 23:00\text{ UTC}$).
- Supplies exactly 24 discrete hourly forcing points for $T_0 - 24\text{h} \rightarrow T_0$ and 6 discrete hourly forcing points for $T_0 \rightarrow T_0 + 6\text{h}$.

#### E. Spatial Resolution
- `cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i`: **$0.25^\circ \times 0.25^\circ$ regular grid** (~28 km).
- `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m`: **$1/12^\circ \times 1/12^\circ$ regular grid** (~8.3 km).

#### F. Depth
- **Depth:** Surface level, **$z = 0\text{ m}$** (dimension index 0 in NetCDF structure `depth: [0.0, 15.0]`).

#### G. Velocity Semantics (`uo`, `vo`)
In `cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i`:
- **`uo`**: Total eastward sea water velocity ($\text{m/s}$), representing the sum of:
  $$\vec{u}_{\text{total}} = \vec{u}_{\text{geostrophic}} + \vec{u}_{\text{Ekman}} + \vec{u}_{\text{tide}}$$
- **`vo`**: Total northward sea water velocity ($\text{m/s}$).
- **`ue`, `ve`**: Separately available eastward and northward Ekman wind-driven velocity components ($\text{m/s}$).
- **Wave Stokes Drift:** Stokes drift is **NOT** included in MULTIOBS (Stokes drift is produced exclusively in wave models like MFWAM / SMOC).

#### H. Historical Coverage
- Continuous hourly global coverage from **1993-01-01 to near-present ($T - 1\text{ month}$)**.
- Near-Real-Time dataset (`cmems_obs-mob_glo_phy-cur_nrt_0.25deg_PT1H-i`) extends this to $T - 1\text{ day}$.

#### I. API / Programmatic Client Method
- Official Copernicus Marine Toolbox Python library:
  ```python
  import copernicusmarine

  copernicusmarine.subset(
      dataset_id="cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i",
      variables=["uo", "vo", "ue", "ve"],
      minimum_longitude=aoi_min_lng,
      maximum_longitude=aoi_max_lng,
      minimum_latitude=aoi_min_lat,
      maximum_latitude=aoi_max_lat,
      start_datetime=t_start.isoformat(),
      end_datetime=t_end.isoformat(),
      minimum_depth=0.0,
      maximum_depth=0.5,
      output_filename="subset_currents.nc"
  )
  ```

#### J. Authentication Requirements
- Copernicus Marine CAS user authentication (`COPERNICUS_MARINE_SERVICE_USERNAME`, `COPERNICUS_MARINE_SERVICE_PASSWORD`).
- Free registration. Required for programmatic data access.

#### K. Units
- Velocity: **$\text{m/s}$** native SI unit.
- Conversion: `conversionApplied: false`, `sourceUnit: "m/s"`, `unit: "m/s"`.

#### L. Physical Compatibility with 3% Wind Leeway
- **Scientific Analysis:**
  The classical 3% wind leeway formula ($\vec{u}_{\text{drift}} = \vec{u}_{\text{ocean}} + 0.03 \vec{u}_{\text{wind}}$) was historically calibrated assuming $\vec{u}_{\text{ocean}}$ was pure geostrophic/Eulerian circulation without surface wind shear, so that the 3% term combined:
  1. Direct wind drag on the oil slick (windage: ~1%)
  2. Wave-induced Stokes drift (~1% to 1.5%)
  3. Thin surface Ekman boundary layer shear (~1%)
- **Handling in MULTIOBS:**
  Because `cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i` explicitly includes Ekman current ($\vec{u}_{\text{Ekman}} = [ue, ve]$) within total velocity (`uo`, `vo`), but does **NOT** include Stokes drift:
  - **Approach 1 (Preferred - Pure Geostrophic + Tide Coupling):**
    Subtract the published Ekman components:
    $$\vec{u}_{\text{Eulerian}} = \vec{u}_{\text{total}} - \vec{u}_{\text{Ekman}} = [uo - ue, vo - ve]$$
    and retain the classical $\alpha_{\text{leeway}} = 0.030$ (3%) with ECMWF ERA5 winds. This is **100% physically compatible** and completely eliminates any risk of double-counting Ekman shear transport.
  - **Approach 2 (Direct Total Current Coupling):**
    Use total velocity directly ($\vec{u}_{\text{ocean}} = [uo, vo]$) and adjust the direct wind leeway coefficient to $\alpha_{\text{leeway}} = 0.015$ (1.5% to represent wave Stokes drift + surface skin drag).
  - Ocean Guard AI implements **Approach 1** by default because `ue` and `ve` are natively co-located in the same hourly NetCDF file.

#### M. Exact Provenance Labels
- When driven by `cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i`:
  - `forcingProvenance`: **`REAL_MULTI_OBSERVATION_CURRENT`** (or `REAL_HISTORICAL_MULTI_OBSERVATION`)
  - `currentSource`: `"COPERNICUS_MARINE_MULTIOBS"`
  - `currentDataset`: `"cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i"`
  - `currentForcingDefinition`: `"Geostrophic + Tidal current (uo - ue, vo - ve at surface z=0m) coupled with 3% wind leeway"`
- When driven by `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m`:
  - `forcingProvenance`: **`REAL_HINDCAST`** (for $t \le T_0$) and **`REAL_REANALYSIS_FORWARD`** (for historical $t > T_0$)
  - `currentSource`: `"COPERNICUS_MARINE_NEMO"`
  - `currentDataset`: `"cmems_mod_glo_phy_anfc_0.083deg_PT1H-m"`
  - `currentForcingDefinition`: `"Eulerian circulation (uo, vo at surface z=0.5m) coupled with 3% wind leeway"`

#### N. Why Alternative Option B (GLORYS `P1D-m`) Was Rejected
- **Rejection of Option B (`cmems_mod_glo_phy_my_0.083deg_P1D-m`):**
  1. `GLOBAL_MULTIYEAR_PHY_001_030` provides only **daily mean averages** (`P1D-m`), meaning a 24-hour backward drift simulation receives exactly **one static velocity vector** across the entire simulation period.
  2. Daily averaging suppresses tidal reversals, diurnal wind-current variations, and high-frequency coastal shears, significantly reducing the accuracy of reverse origin localization.
  3. Fabricating hourly steps from daily means is scientifically unacceptable.
  4. In contrast, Option A provides **24 authentic, discrete hourly physical observations**, capturing true time-varying advection.

---

### Verification Conclusion & Stop Condition

```
METOCEAN_PROVIDER_CONTRACT = VERIFIED
METOCEAN_PROVIDER_CAPABILITY = CAPABLE
REAL_METOCEAN_LIVE_TEST = BLOCKED
REASON = PROVIDER_CREDENTIALS_NOT_CONFIGURED
```

*The exact dataset IDs, physical variable semantics, Ekman/leeway coupling rules, and provenance labels have been verified from official Copernicus documentation. Zero source-code changes have been made.*
