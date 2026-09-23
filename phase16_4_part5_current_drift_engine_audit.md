# Ocean Guard AI — Phase 16.4 Part 5
## Current Drift Engine & MetOcean Forcing Audit Report (Revised)

**Document ID:** `phase16_4_part5_current_drift_engine_audit.md`  
**System:** Ocean Guard AI (SIH26143)  
**Component:** Lagrangian Hydrodynamic Drift & Reverse Hindcast Engine  
**Status:** COMPLETE AUDIT WITH PHYSICAL & RETROSPECTIVE CORRECTIONS  
**Date:** 2026-09-23  

---

### Executive Summary

In response to the Phase 16.4 Part 5 provider corrections, this audit document establishes the exact physical and mathematical contract of the current Ocean Guard AI drift engine. It resolves critical questions regarding:
1. **Eulerian Circulation vs. Merged Surface Transport (`currentForcingDefinition`)**
2. **Backward vs. Forward Numerical Integration Formulations**
3. **Canonical SI Unit Handling ($\text{m/s}$ internal standard)**
4. **Historical $T_0$ Gating vs. Prohibited Server-Time Proxies**
5. **Elimination of Synthetic-to-Reanalysis Mislabeling**

---

### 1. Where DEMO Forcing Enters the Pipeline

| Location | File & Lines | Code / Mechanism | Vulnerability / Defect | Remediation Mandate |
|---|---|---|---|---|
| **Python ML Engine** | `services/ml-python/app/drift/environmental.py` (lines 24–35) | `@dataclass EnvironmentalParameters` defaults to 12.4 kts NW wind, 0.8 kts SE current, `source="demo"`. | Default fallback silently injects static values when parameters are omitted. | Require explicit `HourlyForcingPoint[]`; reject empty forcing in production when `DEMO_MODE=false`. |
| **Python Drift Engine** | `services/ml-python/app/drift/spill_drift_engine.py` (lines 146–147) | `env.source = env.source if env.source != "demo" else "ERA5_REANALYSIS_COPERNICUS"` | **CRITICAL DEFECT:** If `source_type != "DEMO"`, fallback synthetic defaults were relabeled as real ERA5 reanalysis! | **COMPLETELY REMOVE.** Synthetic values must NEVER be labeled as real reanalysis. |
| **Node.js Drift Service** | `services/backend-node/src/services/drift.service.js` (lines 20–116) | `computeDemoLagrangianDrift()` with fixed displacement: $\pm 0.008^\circ/\text{h}$ Lat, $\mp 0.012^\circ/\text{h}$ Lng. | Invoked when ML service fails and `DEMO_MODE=true`. | Retain strictly as an explicit development fallback labeled `DEMO`; fail with `METOCEAN_DATA_UNAVAILABLE` when `DEMO_MODE=false`. |
| **Node.js Manual Service** | `services/backend-node/src/manual-analysis/spillOriginEstimationService.js` (line 235) | `timestampSource = acquisitionTimestamp ? "RASTER_ACQUISITION_TIMESTAMP" : "ESTIMATION_TIME_PROXY"` | Allowed `ESTIMATION_TIME_PROXY` (proxy timestamp) when real raster timestamp is absent. | For real metocean queries, strictly mandate $T_0$. If $T_0$ is missing $\implies$ `METOCEAN_TIMESTAMP_REQUIRED`. |

---

### 2. Ocean Current Semantics: Eulerian Current vs. Merged Surface Transport

#### Investigation of CMEMS Current Products
The Copernicus Marine Service distributes two primary surface current datasets:
1. **`cmems_mod_glo_phy_anfc_0.083deg_PT1H-m`** (and reanalysis `cmems_mod_glo_phy_my_0.083deg_PT1H-m`):
   - Variables: `uo` (eastward sea water velocity), `vo` (northward sea water velocity) at surface level ($z \approx 0.5\text{ m}$).
   - **Physics:** Pure **Eulerian ocean circulation velocity** produced by the NEMO hydrodynamic model.
   - **Exclusions:** Does NOT include wave-induced Stokes drift or tidal currents.
2. **`cmems_mod_glo_phy_anfc_merged-uv_PT1H-i` (SMOC — Surface Merged Ocean Current):**
   - Variables: `uo`, `vo` (circulation), `utide`, `vtide` (FES tidal model), `vsdx`, `vsdy` (MFWAM wave Stokes drift).
   - **Physics:** Total merged surface velocity:
     $$\vec{u}_{\text{SMOC}} = \vec{u}_{\text{circulation}} + \vec{u}_{\text{tides}} + \vec{u}_{\text{Stokes}}$$

#### The Physical Conflict with Leeway Modeling
In standard physical oceanography and oil spill modeling (NOAA GNOME, ASCE, Reed et al.):
$$\vec{u}_{\text{drift}} = \vec{u}_{\text{current}} + \alpha_{\text{leeway}} \cdot \vec{u}_{\text{wind}}$$
The standard empirical leeway coefficient $\alpha_{\text{leeway}} \approx 0.030$ (3%) **already accounts for wave-induced Stokes drift (~2%) and direct aerodynamic windage (~1%) combined!**

> [!IMPORTANT]
> **Double-Counting Hazard:**
> If Ocean Guard AI were to ingest the total merged velocity from SMOC (`cmems_mod_glo_phy_anfc_merged-uv_PT1H-i`) which already includes Stokes drift (`vsdx`, `vsdy`), and then add $3\% \vec{u}_{\text{wind}}$, the wave transport would be **double-counted**, resulting in unphysically exaggerated slick drift speeds.

#### Canonical Definition: `currentForcingDefinition`
Ocean Guard AI explicitly adopts **Eulerian Surface Ocean Circulation**:
- **Dataset:** `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m` (forecast/analysis) / `cmems_mod_glo_phy_my_0.083deg_PT1H-m` (reanalysis)
- **Variables:** `uo` (Eastward), `vo` (Northward) in $\text{m/s}$ at surface depth ($z \approx 0.49\text{ m}$)
- **Scientific Compatibility:** Pair with $10\text{m}$ surface wind $(u_{10}, v_{10})$ from ECMWF ERA5 using the classical coupled leeway advection formula:
  $$\vec{u}_{\text{drift}}(t) = \vec{u}_{\text{Eulerian\_curr}}(t) + \alpha_{\text{leeway}} \cdot \vec{u}_{\text{wind\_10m}}(t)$$
  where $\alpha_{\text{leeway}} = 0.030$ (3.0%).

---

### 3. Canonical SI Unit Contract

To eliminate silent conversions and unit ambiguity:
- **Internal Canonical Velocity Unit:** Meters per second ($\text{m/s}$).
- **Coordinate Conventions:**
  - $u > 0$: Eastward velocity ($\text{m/s}$)
  - $v > 0$: Northward velocity ($\text{m/s}$)
- **Integration Conversions (at boundary only):**
  - Physical distance displacement over timestep $\Delta t$ (seconds):
    $$\Delta d_{\text{north\_meters}} = v_{\text{drift\_ms}} \cdot \Delta t$$
    $$\Delta d_{\text{east\_meters}} = u_{\text{drift\_ms}} \cdot \Delta t$$
  - Spherical Earth coordinate update ($R_E = 6,371,000\text{ m}$):
    $$\Delta \text{Lat}^\circ = \frac{\Delta d_{\text{north\_meters}}}{R_E} \cdot \left(\frac{180^\circ}{\pi}\right)$$
    $$\Delta \text{Lng}^\circ = \frac{\Delta d_{\text{east\_meters}}}{R_E \cdot \cos(\text{Lat}_{\text{rad}})} \cdot \left(\frac{180^\circ}{\pi}\right)$$
- **Metadata Contract:** Every forcing record must expose:
  ```json
  {
    "unit": "m/s",
    "sourceUnit": "m/s",
    "conversionApplied": false
  }
  ```

---

### 4. Mathematical Formulation: Time-Varying Backward vs. Forward Integration

Let $\vec{x}(t) = (\lambda(t), \phi(t))$ be the geographic longitude and latitude of the slick centroid.
The advection ODE is:
$$\frac{d\vec{x}}{dt} = \vec{u}(\vec{x}(t), t)$$
where $\vec{u}(t) = [u_{\text{drift}}(t), v_{\text{drift}}(t)]^T$ in $\text{m/s}$.

#### A. Forward Integration ($T_0 \rightarrow T_0 + 6\text{h}$)
- Temporal progression: $t_{k+1} = t_k + \Delta t$ with $\Delta t = +3600\text{ s}$ ($+1\text{ h}$).
- Discrete update:
  $$\vec{x}(t_{k+1}) = \vec{x}(t_k) + \vec{u}(t_k) \Delta t$$
- Classification:
  - If $T_0$ is historical and driven by ERA5 reanalysis: `REAL_REANALYSIS_FORWARD`.
  - If $T_0$ is driven by an actual archived forecast run: `REAL_ARCHIVED_FORECAST`.
  - If $T_0 \approx \text{now}$ and driven by live operational forecast: `REAL_FORECAST`.

#### B. Backward Reverse Hindcast ($T_0 \rightarrow T_0 - 24\text{h}$)
- The solver integrates backwards from observation $T_0$:
  $$t_{k+1} = t_k - \Delta t \quad (\Delta t = +3600\text{ s})$$
- From the fundamental theorem of calculus:
  $$\vec{x}(t - \Delta t) = \vec{x}(t) - \int_{t-\Delta t}^{t} \vec{u}(\tau) d\tau \approx \vec{x}(t) - \vec{u}(t) \Delta t$$
- **Rigorous Temporal Ordering:**
  - At step $k=0$ ($t = T_0$): observed slick centroid $\vec{x}(T_0)$.
  - Step 1: slick position at $T_0 - 1\text{h}$ was $\vec{x}(T_0) - \vec{u}(T_0) \Delta t$.
  - Step $k$: slick position at $T_0 - k\text{h}$ was $\vec{x}(T_0 - (k-1)\text{h}) - \vec{u}(T_0 - (k-1)\text{h}) \Delta t$.
- **Physical Verification:**
  - If a constant eastward wind/current ($u = +1.0\text{ m/s}, v = 0$) pushed the oil slick toward the East, integrating backward in time yields:
    $$\Delta \lambda = - \frac{1.0 \cdot \Delta t}{R_E \cos\phi} < 0 \implies \text{Westward displacement}.$$
  - The slick originated to the **WEST**, which matches physical reality.
- Classification: `REAL_HINDCAST`.

---

### 5. Uncertainty Model (Horizontal Turbulent Diffusion)

- The empirical horizontal turbulent eddy diffusion radius follows:
  $$R(t) = R_0 + 2.5 \cdot \frac{\sqrt{2 K t_{\text{seconds}}}}{1000} \quad [\text{km}]$$
- Parameterized with:
  - $R_0 = 0.5\text{ km}$ (initial SAR observation centroid uncertainty)
  - $K = 5.0\text{ m}^2/\text{s}$ (canonical oceanographic surface eddy diffusivity)
- At $t = 24\text{ hours}$ ($86,400\text{ s}$), $R(24) \approx 2.824\text{ km}$.
- Produces a 64-vertex circular GeoJSON `Polygon` centered at the terminal backward waypoint (`modeledOrigin`).
