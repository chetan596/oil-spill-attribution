# Phase 13 — Known Limitations

> **Ocean Guard AI / SIH 26143**  
> **Date:** 2026-09-21  
> **Phase:** 13 — Final End-to-End Validation & Production Freeze

---

## 1. Validated Sensor/Domain Coverage

The system has been validated for **three optical domains only**:

| Domain | Sensor | Resolution | Bands | Benchmark |
|---|---|---|---|---|
| Sentinel-2 Multispectral | MSI (L1C/L2A) | 10m (VNIR), 20m (SWIR) | B4, B3, B2, B8, B11, B12 | MADOS |
| Drone/Aerial RGB | Consumer/industrial cameras | ≤0.1m GSD | R, G, B | KERF |
| Satellite RGB Fallback | Sentinel-2 RGB-only | 10m | B4, B3, B2 | MADOS |

**Not validated:**
- Sentinel-1 SAR C-band (separate v09d pipeline exists but is independent)
- WorldView, Planet, SPOT, Landsat, or non-Sentinel optical satellites
- Hyperspectral sensors
- Thermal infrared imagery
- SAR L-band (ALOS-2/NISAR)
- Nighttime imagery

---

## 2. MADOS Benchmark Limitations

The MADOS dataset (Marine Debris Archive for Detection via Optical Satellites) provides the only available open-source Sentinel-2 oil spill segmentation benchmark:

- **Geographic coverage:** Mediterranean Sea, North Sea, and Persian Gulf — limited geographic diversity
- **Temporal coverage:** Select Sentinel-2 acquisitions from 2015–2021
- **Class definition:** "Oil Spill" category in MADOS includes confirmed marine oil, natural seeps, and some ambiguous dark slicks
- **Annotation granularity:** Patch-level labels, not pixel-precise delineation in all cases
- **Small-slick sensitivity:** Spills covering <0.5% of a patch have limited detection reliability (Phase 11 benchmark shows degraded IoU for sub-pixel-fraction spills)
- **Sentinel-2 revisit:** 5-day revisit means temporal gaps between spill event and observation; oil weathering changes spectral signature

**Do not interpret MADOS IoU = 0.4273 as universal real-world accuracy.** This is a benchmark metric on a specific evaluation partition.

---

## 3. KERF Benchmark Limitations

The KERF dataset provides drone-acquired oil spill imagery:

- **Scene diversity:** Limited to controlled and semi-controlled spill experiments
- **Environmental conditions:** Calm to moderate sea states; limited heavy-weather imagery
- **Oil types:** Specific petroleum products used in experiments; may not generalize to all crude oil types
- **Scale:** Drone GSD (0.05m) is orders of magnitude finer than satellite (10m) — model does not transfer across scales

**KERF IoU = 0.8268 reflects controlled experimental conditions, not open-ocean operational performance.**

---

## 4. Tiny-Sheen Detection Limitations

Oil sheens (thin rainbow-sheen layers) remain challenging:

- **Spectral signature:** Very thin oil films have minimal spectral contrast in VNIR bands
- **SWIR sensitivity:** B11/B12 provide some discrimination but not sufficient for sub-pixel sheens
- **Phase 10 tiny-sheen IoU:** 0.2839 (ResNet-34 adapted) — substantially below thick-slick detection
- **False-negative risk:** Thin sheens are more likely to be missed than thick slicks

---

## 5. Unknown Sensor Handling

The router implements **fail-closed** behavior for unrecognized inputs:

- Unknown `source_type` raises `AmbiguousModalityError`
- No silent fallback to any model
- User must explicitly specify sensor domain if metadata cannot be inferred

**Limitation:** If a user uploads imagery from an unsupported sensor (e.g., Planet SuperDove, Landsat-9), the system will reject it rather than attempt inference. This is by design.

---

## 6. Environmental Data Dependency

Downstream services (drift trajectory, spill origin estimation) depend on:

- **Wind data:** Required for Lagrangian drift modeling
- **Current data:** Ocean surface currents for trajectory computation
- **Availability:** The system fails gracefully when environmental data is unavailable, but drift/origin estimation quality degrades significantly without it

**The system does not fabricate environmental values.** Missing data produces explicit `NOT_AVAILABLE` status.

---

## 7. AIS Coverage Limitations

AIS (Automatic Identification System) correlation has inherent limitations:

- **AIS gaps:** Vessels can disable transponders (dark shipping)
- **Terrestrial AIS range:** ~50 nautical miles from shore stations
- **Satellite AIS latency:** Minutes to hours depending on constellation
- **Coverage bias:** Better coverage near coast; degraded in open ocean
- **False attribution risk:** Proximity does not imply causation — the system reports candidates with evidence scores, not definitive blame

---

## 8. Vessel Attribution Uncertainty

The system explicitly avoids claiming definitive attribution:

- Candidate vessels are ranked by proximity, timing, and behavioral factors
- Attribution scores reflect statistical likelihood, not forensic certainty
- Legal/regulatory attribution requires additional investigation beyond automated analysis
- The system labels outputs as `MODEL_PROBABILITY`, not calibrated confidence

---

## 9. Drone Inference Latency

Drone/aerial images at native resolution (1920×1080 or higher) require:

- Letterboxing to 512×512 model input
- Inverse coordinate mapping for full-resolution mask reconstruction
- Mean latency: **811ms on CPU** (3.1 FPS with GPU from Phase 12 benchmark)

For real-time drone surveillance, GPU inference and/or tiled processing would be needed.

---

## 10. Multispectral Data Availability

The 6-band Sentinel-2 model requires:

- B4 (Red, 10m), B3 (Green, 10m), B2 (Blue, 10m) — always available
- B8 (NIR, 10m) — always available
- B11 (SWIR-1, 20m), B12 (SWIR-2, 20m) — require L1C or L2A product; not available in TCI-only downloads

If only RGB bands are available, the router automatically falls back to the satellite RGB model (lower accuracy).

---

## 11. Cloud and Atmospheric Limitations

- **Cloud cover:** Dense clouds completely occlude the ocean surface; no oil detection possible
- **Cloud shadows:** Can produce false dark patches resembling oil; the model may generate false positives on cloud shadow regions
- **Atmospheric correction:** L2A products are preferred; L1C top-of-atmosphere reflectance introduces atmospheric noise
- **Sun glint:** Specular reflection can mask or mimic oil spill signatures
- **Haze/aerosol:** Reduces spectral contrast between oil and water

---

## 12. Geographic/Domain Shift

The models are trained on specific geographic regions:

- **MADOS:** Primarily Mediterranean, North Sea, Persian Gulf
- **KERF:** Specific experimental locations

Performance may degrade for:
- Tropical waters (different water color, turbidity)
- Arctic/sub-Arctic regions (ice interference)
- River estuaries (high sediment load)
- Coastal zones (complex backgrounds)
- Deep-blue open ocean (different baseline reflectance)

No domain adaptation has been performed for regions outside the training distribution.

---

## 13. Model Architecture Limitations

- **Input resolution:** Fixed 240×240 (satellite) or 512×512 (drone) — spatial detail is limited by model input size
- **Single-frame inference:** No temporal analysis (multi-date change detection not implemented)
- **Binary segmentation:** Oil vs. non-oil only — no sub-classification of oil type, thickness, or weathering state
- **No uncertainty quantification:** Raw sigmoid/softmax outputs are not calibrated probabilities

---

## 14. Operational Environment Constraints

- **CPU inference:** Functional but slower; GPU recommended for production throughput
- **Single-node:** Current architecture runs on a single machine; not horizontally scaled
- **File-based I/O:** GeoTIFF band loading uses local filesystem paths; cloud object storage integration not implemented
- **No automated pipeline:** Manual analysis flow requires user-initiated upload; no automated Sentinel-2 acquisition monitoring
