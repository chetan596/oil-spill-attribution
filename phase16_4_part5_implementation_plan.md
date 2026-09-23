# Ocean Guard AI — Phase 16.4 Part 5
## Real Oceanographic & Meteorological Adapter Implementation Plan (Final Verified)

**Document ID:** `phase16_4_part5_implementation_plan.md`  
**System:** Ocean Guard AI (SIH26143)  
**Target:** Implementation of Real MetOcean Adapter & Time-Varying Lagrangian Hydrodynamic Forcing  
**Status:** IMPLEMENTATION PLAN (AWAITING USER APPROVAL)  
**Date:** 2026-09-23  

---

### 1. Selected Verified Providers & Exact Dataset Semantics

1. **Ocean Surface Current Forcing (Primary Historical Multi-Year):**
   - **Provider:** Copernicus Marine Service (CMEMS)
   - **Product ID:** `MULTIOBS_GLO_PHY_MYNRT_015_003` (Global Total Surface Current)
   - **Dataset ID:** `cmems_obs-mob_glo_phy-cur_my_0.25deg_PT1H-i`
   - **Temporal Resolution:** Hourly (`PT1H`), 1993 to near-present ($T - 1\text{ month}$)
   - **Spatial Resolution:** $0.25^\circ \times 0.25^\circ$ regular grid
   - **Depth:** Surface ($z = 0\text{ m}$)
   - **Variables:** `uo`, `vo` (total eastward/northward current), `ue`, `ve` (Ekman current component)
   - **Current Semantics (`currentForcingDefinition`):**
     $$\vec{u}_{\text{geostrophic+tide}} = [uo - ue, vo - ve] \quad [\text{m/s}]$$
     coupled with the classical empirical 3% wind leeway formula ($\alpha_{\text{leeway}} = 0.030$), eliminating any double-counting of Ekman wind shear transport.
   - **Provenance Label:** Strictly **`REAL_MULTI_OBSERVATION_CURRENT`** (or `REAL_HISTORICAL_MULTI_OBSERVATION`).

2. **Ocean Surface Current Forcing (Operational Near-Real-Time Analysis):**
   - **Product ID:** `GLOBAL_ANALYSISFORECAST_PHY_001_024`
   - **Dataset ID:** `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m`
   - **Temporal Resolution:** Hourly (`PT1H`), $T - 2\text{ years}$ to $T + 10\text{ days}$
   - **Spatial Resolution:** $1/12^\circ \times 1/12^\circ$ (~8.3 km)
   - **Depth:** Surface ($z \approx 0.5\text{ m}$)
   - **Variables:** `uo`, `vo` (Eulerian ocean circulation)
   - **Provenance Label:** Strictly **`REAL_HINDCAST`** (for $t \le T_0$) and **`REAL_REANALYSIS_FORWARD`** (for historical $t > T_0$).

3. **Surface Marine Wind Forcing (Primary):**
   - **Provider:** ECMWF Climate Data Store (CDS)
   - **Historical Reanalysis Dataset:** `reanalysis-era5-single-levels`
   - **Variables:** `10m_u_component_of_wind` ($u_{10}$), `10m_v_component_of_wind` ($v_{10}$) in $\text{m/s}$
   - **Operational Forecast Dataset (for $T_0 \approx \text{now}$ only):** ECMWF IFS 0.25° via ECMWF Open Data
   - **Provenance Label:** Strictly **`REAL_HINDCAST`** (for $t \le T_0$) and **`REAL_REANALYSIS_FORWARD`** (for historical $t > T_0$).

4. **Secondary Provider (Explicit Configuration Only):**
   - **Provider:** Open-Meteo
   - **Rule:** Never used as an automatic fallback. Active only when explicitly configured via `METOCEAN_SECONDARY_PROVIDER=openmeteo`.
   - **Provenance:** Marked distinctly as `OPEN_METEO`.

---

### 2. Time-Resolved Hourly Forcing Schema

The static single-vector representation is replaced by an array of hourly time-resolved records:

```python
class HourlyForcingPoint(BaseModel):
    timestamp: datetime                    # UTC timestamp (ISO 8601)
    latitude: float                        # Query point latitude (WGS84)
    longitude: float                       # Query point longitude (WGS84)
    current_u: float                       # Eastward ocean current (m/s)
    current_v: float                       # Northward ocean current (m/s)
    wind_u: float                          # Eastward 10m surface wind (m/s)
    wind_v: float                          # Northward 10m surface wind (m/s)
    current_unit: str = "m/s"              # Canonical SI unit
    wind_unit: str = "m/s"                 # Canonical SI unit
    source_unit: str = "m/s"               # Raw provider unit
    conversion_applied: bool = False       # True if conversion was performed
    current_source: str                    # "COPERNICUS_MARINE_MULTIOBS" | "COPERNICUS_MARINE_NEMO"
    wind_source: str                       # "ECMWF_ERA5" | "ECMWF_IFS"
    current_dataset: str                   # Exact CMEMS dataset ID
    wind_dataset: str                      # Exact ECMWF dataset ID
```

---

### 3. Spatial & Temporal Mechanics

#### Spatial Mechanics (Dynamic AOI)
- Derived strictly from slick centroid $(\text{Lat}_0, \text{Lng}_0)$ and spatial footprint bounding box.
- Bounding box query encompasses potential 24-hour advection:
  $$\text{Bounding Box} = [\text{Lat}_0 - 1.0^\circ, \text{Lat}_0 + 1.0^\circ] \times [\text{Lng}_0 - 1.0^\circ, \text{Lng}_0 + 1.0^\circ]$$
- No geographic region (Arabian Sea, Mumbai, Persian Gulf) is ever hardcoded.

#### Temporal Mechanics & $T_0$ Gating
- Investigation timestamp $T_0$ is mandatory.
- **Gating Rule:** If $T_0$ is missing, null, or invalid, the system immediately halts metocean processing with status:
  $$\text{METOCEAN\_TIMESTAMP\_REQUIRED}$$
- **Prohibited Proxies:** Server time (`Date.now()`, `datetime.utcnow()`), upload time, and filesystem time are strictly prohibited for metocean queries.

---

### 4. Mathematical Integration Formulations

Let $\vec{x}(t) = (\lambda(t), \phi(t))$ be the slick centroid coordinates (WGS84 degrees) and $R_E = 6,371,000\text{ m}$.
Total Lagrangian drift velocity:
$$\vec{u}_{\text{drift}}(t) = \vec{u}_{\text{current}}(t) + \alpha_{\text{leeway}} \cdot \vec{u}_{\text{wind}}(t) = [u_{\text{drift}}(t), v_{\text{drift}}(t)]^T \quad [\text{m/s}]$$

#### A. Forward Integration ($T_0 \rightarrow T_0 + 6\text{h}$)
- Steps: $k = 0, 1, \dots, 6$ with $t_{k+1} = t_k + \Delta t$ ($\Delta t = +3600\text{ s}$).
- Spatial stepping:
  $$\Delta \phi = \frac{v_{\text{drift}}(t_k) \cdot \Delta t}{R_E} \cdot \left(\frac{180}{\pi}\right)$$
  $$\Delta \lambda = \frac{u_{\text{drift}}(t_k) \cdot \Delta t}{R_E \cdot \cos(\phi_{\text{avg}})} \cdot \left(\frac{180}{\pi}\right)$$
  $$\vec{x}(t_{k+1}) = \vec{x}(t_k) + (\Delta \lambda, \Delta \phi)$$
- **Provenance Classification:**
  - For historical scenes driven by ERA5: **`REAL_REANALYSIS_FORWARD`**.
  - For archived numerical weather forecast runs: **`REAL_ARCHIVED_FORECAST`**.
  - For live current events ($T_0 \approx \text{now}$) driven by operational forecast: **`REAL_FORECAST`**.

#### B. Backward Reverse Hindcast ($T_0 \rightarrow T_0 - 24\text{h}$)
- Steps: $k = 0, 1, \dots, 24$ stepping backwards into the past: $t_{k+1} = t_k - \Delta t$ ($\Delta t = +3600\text{ s}$).
- Discrete formulation:
  $$\vec{x}(t_k - \Delta t) = \vec{x}(t_k) - \vec{u}_{\text{drift}}(t_k) \Delta t$$
- Spatial stepping:
  $$\Delta \phi = - \frac{v_{\text{drift}}(t_k) \cdot \Delta t}{R_E} \cdot \left(\frac{180}{\pi}\right)$$
  $$\Delta \lambda = - \frac{u_{\text{drift}}(t_k) \cdot \Delta t}{R_E \cdot \cos(\phi_{\text{avg}})} \cdot \left(\frac{180}{\pi}\right)$$
- **Physical Verification via Unit Vector Test:**
  - Given steady Eastward forcing ($u = +1.0\text{ m/s}, v = 0$): $\Delta \lambda < 0 \implies$ slick displaced **Westward** into the past. Verified physically correct.
- **Provenance Classification:**
  - Multi-observation source: **`REAL_MULTI_OBSERVATION_CURRENT`**.
  - Numerical analysis source: **`REAL_HINDCAST`**.

---

### 5. Fallback Policy & Provenance Guardrails

1. **No Silent Fallback:**
   - If Copernicus Marine or ECMWF CDS fails or is unconfigured, and `DEMO_MODE=false`:
     - System returns `status: "METOCEAN_DATA_UNAVAILABLE"` or `status: "METOCEAN_PROVIDER_CONFIGURATION_REQUIRED"`.
     - Trajectories $\implies$ `null`.
     - Modeled origin $\implies$ `null`.
2. **DEMO Mode Quarantine:**
   - When `DEMO_MODE=true`, static forcing is explicitly marked `provenance: "DEMO"`.
   - Under no circumstances will demo values be marked as `ERA5` or `Copernicus`.
3. **Historical AIS Isolation:**
   - The completed Phase 16.4 Part 3/4 historical AIS pipeline (`global-historical-ais.client.js`, `aisCorrelationService.js`) remains completely unmodified.

---

### 6. Enumerated Test Suite (19 Required Verification Tests)

Prior to marking Phase 16.4 Part 5 complete, the following 19 automated tests must be implemented and passing:

1. **Test `test_metocean_no_t0_rejected`:** Verifies simulation throws `METOCEAN_TIMESTAMP_REQUIRED` when $T_0$ is absent.
2. **Test `test_metocean_real_t0_accepted`:** Verifies valid ISO-8601 UTC timestamp triggers dynamic query.
3. **Test `test_metocean_hourly_forcing_sequence`:** Validates 24-point backward and 6-point forward hourly sequences.
4. **Test `test_metocean_missing_hourly_forcing_point`:** Validates linear temporal interpolation when an intermediate hourly record is missing.
5. **Test `test_metocean_utc_normalization`:** Verifies non-UTC or local timestamps are normalized to UTC.
6. **Test `test_metocean_ms_unit_preservation`:** Validates canonical SI velocity ($\text{m/s}$) preserved throughout drift engine.
7. **Test `test_metocean_explicit_unit_conversion`:** Verifies knots-to-m/s boundary conversion sets `conversionApplied: true`.
8. **Test `test_metocean_current_wind_vector_mapping`:** Validates $u, v$ ocean current and wind leeway coupling.
9. **Test `test_metocean_backward_integration_direction`:** Validates Eastward current yields Westward reverse displacement.
10. **Test `test_metocean_forward_integration`:** Validates Eastward current yields Eastward forward displacement.
11. **Test `test_metocean_time_varying_velocity`:** Validates trajectory with fluctuating directional vectors.
12. **Test `test_metocean_interpolation`:** Tests spatial bilinear interpolation from gridded data.
13. **Test `test_metocean_provider_failure`:** Verifies graceful error when provider returns 500 / network failure.
14. **Test `test_metocean_provider_unavailable`:** Verifies `METOCEAN_DATA_UNAVAILABLE` when `DEMO_MODE=false`.
15. **Test `test_metocean_demo_provenance`:** Verifies static fallback is strictly labeled `DEMO`.
16. **Test `test_metocean_real_hindcast_provenance`:** Verifies backward trajectory labeled `REAL_HINDCAST` or `REAL_MULTI_OBSERVATION_CURRENT`.
17. **Test `test_metocean_real_reanalysis_forward_provenance`:** Verifies forward historical trajectory labeled `REAL_REANALYSIS_FORWARD`.
18. **Test `test_metocean_no_false_real_forecast_label`:** Ensures ERA5-driven forward runs are never labeled `REAL_FORECAST`.
19. **Test `test_metocean_provenance_completeness`:** Verifies all 12 metadata fields in trajectory GeoJSON properties.

---

### 7. Stop Condition & Final Verification Status

```
METOCEAN_PROVIDER_CONTRACT = VERIFIED
METOCEAN_PROVIDER_CAPABILITY = CAPABLE
REAL_METOCEAN_LIVE_TEST = BLOCKED
REASON = PROVIDER_CREDENTIALS_NOT_CONFIGURED
```

*Implementation of source code modifications will begin only after user approval of this verified plan.*
