# Phase 9: MADOS Satellite Domain Recovery & Training Audit

## Executive Summary

Phase 8 established that while balanced fine-tuning on drone aerial imagery cured background collapse and achieved high performance on aerial RGB datasets ($\text{IoU} = 0.8268 - 0.8507$ on KERF), it achieved $\text{IoU} = 0.0000$ on the Sentinel-2 satellite MADOS dataset.

This Phase 9 audit performed a complete, forensic inspection of the local MADOS archive (174 Sentinel-2 scenes, 2,803 total $10\text{m}$ crop tiles) and identified the **definitive root cause of the satellite domain transfer gap**:
1. **100% Benchmark Quarantine of Satellite Positives**: In the initial benchmark construction (Phase 2/4), **all 361 oil-positive tiles** present in the entire MADOS dataset were quarantined into the Phase 4 Locked Benchmark (`mados_hard_cases_manifest.json`).
2. **Zero Eligible Satellite Positives in Training**: Outside the locked benchmark, exactly **zero (0) MADOS positive samples** exist in the workspace, while 2,442 negative/look-alike MADOS tiles remain in the candidate pool.
3. **Severe Sensor & Spatial Disparity**:
   - MADOS is $10\text{m}$ spatial resolution Sentinel-2 imagery where oil coverage is diffuse and tiny (mean foreground area = **1.13%**, median = **0.49%**, with 50.1% of samples having $<0.5\%$ coverage).
   - KERF is centimeter-scale aerial drone RGB photography where oil coverage is dense and prominent (mean foreground area = **45.10%**).
   - The drone fine-tuned models correctly learned to reject small $<1\%$ anomalies as non-oil drone artifacts, causing them to predict zero foreground on Sentinel-2 satellite tiles.
4. **Modality & Spectral Information Loss**: MADOS provides multi-spectral bands ($10\text{m}$ B2, B3, B4, B8 NIR; $20\text{m}$ B5-B7, B8A, B11-B12 SWIR). Standard 3-channel RGB inference completely discards Near-Infrared (B8, 833nm) and Short-Wave Infrared (B11/B12), which are the primary physical indicators of surface hydrocarbon reflectance on seawater.

---

## 1. MADOS Dataset Inventory

| Dataset Scope | Total Scenes | Total $10\text{m}$ Crops | Positive Crops (Class 6 $>0$) | Pure Negative Crops (Class 6 $=0$) | Unknown Crops |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Complete MADOS Archive** | 174 | 2,803 | 361 | 2,442 | 0 |
| **Phase 4/6/8 Locked Benchmark** | 61 | 361 | 361 (100.0%) | 0 | 0 |
| **Sealed External Test Set** | 0 | 0 | 0 | 0 | 0 |
| **Eligible Pool Outside Benchmark** | 113 | 2,442 | **0 (0.0%)** | **2,442 (100.0%)** | **0** |

---

## 2. Positive Sample Recovery & Benchmark Exclusion Accounting

### Step-by-Step Accounting of the Phase 5A Filtering Failure:
1. **Raw MADOS Dataset**: 2,803 total $10\text{m}$ tiles across 174 scenes $\rightarrow$ **361 oil-positive tiles** (across 61 scenes).
2. **Benchmark Exclusion**: All 361 positive tiles were selected for `data/raw/optical_hard_cases/mados/mados_hard_cases_manifest.json` as benchmark evaluation hard cases $\rightarrow$ **0 positive tiles remaining**.
3. **Sealed External Test Exclusion**: 0 MADOS tiles were in the 130-image sealed test.
4. **Resulting Pool for Phase 5A/5B**:
   - Positives: 5 (isolated non-MADOS cases).
   - Negatives: 2,562 (MADOS clean ocean + MADOS look-alikes).
   - Outcome: Background collapse to zero predictions.
5. **Phase 7A Recovery**: Recovered 441 positives from KERF archives, but 100% of these recovered positives were aerial drone RGB imagery.

---

## 3. Oil Mask Area Distribution (361 MADOS Positives)

| Coverage Metric | Statistical Value | Equivalent Pixels (out of $240\times 240 = 57,600$) |
| :--- | :---: | :---: |
| **Mean Oil Area %** | **1.1281%** | 649.8 pixels |
| **Median Oil Area %** | **0.4983%** | 287.0 pixels |
| **P10 Oil Area %** | **0.0642%** | 37.0 pixels |
| **P90 Oil Area %** | **2.6545%** | 1,529.0 pixels |
| **Min Oil Area %** | **0.0035%** | 2.0 pixels |
| **Max Oil Area %** | **11.2292%** | 6,468.0 pixels |

### Size Categorization (Explicit Area Thresholds):
- **Tiny ($<0.5\%$ Tile Area)**: 181 crops (**50.1%**) — Extreme small-target challenge.
- **Small ($0.5\% - 2.0\%$ Tile Area)**: 118 crops (**32.7%**).
- **Medium ($2.0\% - 5.0\%$ Tile Area)**: 47 crops (**13.0%**).
- **Large ($\ge 5.0\%$ Tile Area)**: 15 crops (**4.2%**) — Maximum observed slick is only $11.23\%$.

---

## 4. Hard-Case Distribution & Metadata Categories

In `data/raw/optical_hard_cases/mados/mados_hard_cases_manifest.json`:
- **Oil-Ship Cases**: 25 samples (oil slicks originating from or adjacent to vessels).
- **Large Oil Cases**: 15 samples (slicks $\ge 5\%$ tile area).
- **Difficult / Diffuse Oil Cases**: 346 samples (thin sheens, low contrast, wave interference, cloud shadows).
- **Look-Alike Negatives**: 1,719 samples in `look_alike` (marine debris, Sargassum, foam, wave crests, ships).
- **Clean Ocean Negatives**: 654 samples in `clean_ocean`.

---

## 5. Multispectral & Preprocessing Analysis

### 5.1 Multispectral Input Audit
- **Sensor**: Sentinel-2 MultiSpectral Instrument (MSI) Level-2R (Rayleigh-corrected surface reflectance $\rho_{rc}$).
- **Data Format**: Single-band Float32 GeoTIFFs ($240 \times 240$ tiles, pixel values in range $[0.01, 0.20]$).
- **Available Bands**:
  - $10\text{m}$ Resolution: B2 (492nm Blue), B3 (559nm Green), B4 (665nm Red), B8 (833nm NIR).
  - $20\text{m}$ Resolution: B5 (704nm), B6 (739nm), B7 (780nm), B8A (864nm), B11 (1610nm SWIR-1), B12 (2186nm SWIR-2).
  - $60\text{m}$ Resolution: B1 (442nm Coastal Aerosol).
- **Information Loss in Current RGB Models**:
  - Current V2 models only ingest 3-channel 8-bit RGB (B4, B3, B2).
  - Near-Infrared (B8, 833nm) and Short-Wave Infrared (B11/B12), which exhibit the highest contrast between water and surface hydrocarbon films, are completely discarded by the current RGB pipeline.

### 5.2 Preprocessing Audit
- Native tile resolution: $240 \times 240$ pixels.
- V2 Preprocessor: Aspect-preserving letterbox to $256 \times 256$ with ImageNet normalization ($\mu = [0.485, 0.456, 0.406]$, $\sigma = [0.229, 0.224, 0.225]$).
- Interpolation: Nearest-neighbor mask resizing avoids artificial label blurring on small 1-2 pixel filaments.

---

## 6. Scene-Level Splitting & Leakage Audit

MADOS contains 174 distinct geographic/temporal acquisitions (Scenes). All tiles with the prefix `Scene_X_cropY` share the exact same Sentinel-2 acquisition footprint.
- **Rule**: Tiles originating from the same Scene ID must NEVER be split across Training and Validation.
- **Current Status**: All 61 oil scenes are currently inside the Phase 4 Locked Benchmark.
- **Leakage Check**: `Train ∩ Benchmark = 0`, `Val ∩ Benchmark = 0`, `Train ∩ Sealed = 0`.

---

## 7. Strategic Domain-Adaptation Options

### Strategy A: Scene-Disjoint Re-partitioning of MADOS for RGB Fine-Tuning
- **Concept**: Split the 61 oil scenes into:
  - **45 Training Scenes** (270 positive crops) + **80 Negative Scenes** (1,700 negative crops).
  - **16 Locked Benchmark Scenes** (91 positive crops) + **33 Negative Scenes** (742 negative crops).
- **Pros**: Provides 270 genuine satellite RGB positive samples for domain adaptation without requiring architecture changes.
- **Cons**: Requires formal versioning of the MADOS benchmark subset (Phase 9 Benchmark v2).

### Strategy B: Multi-Spectral 4-Channel (RGB + NIR) or 10-Channel Architecture
- **Concept**: Extend the input layer of the U-Net encoder to ingest 4 channels (Red, Green, Blue, NIR-833nm) or full 10-band Sentinel-2 reflectance.
- **Pros**: Leverages physical hydrocarbon absorption/reflectance curves, dramatically increasing contrast on diffuse sheen.
- **Cons**: Incompatible with standard 3-channel optical drone photography without a multi-modal adapter or channel-switching head.

---

## 8. Frozen Baseline Reference & Success Criteria

### Frozen MADOS Reference Baseline (Original V2):
```text
Original V2 Baseline (Legacy V2 Preprocessing):
  IoU       = 0.1786
  Recall    = 0.6709
  Precision = 0.2396
  Dice / F1 = 0.2777
```

### Criteria for Future Satellite Experiment:
- **Positive Recall**: Must remain $>50\%$ on satellite scenes (avoiding zero-foreground collapse).
- **IoU**: Must exceed $0.1786$ on the evaluation partition.
- **Precision**: Must improve over $23.96\%$ by filtering look-alike sea textures.
- **Cross-Domain Integrity**: Must not cause catastrophic regression on KERF drone imagery ($>0.80$ IoU).
