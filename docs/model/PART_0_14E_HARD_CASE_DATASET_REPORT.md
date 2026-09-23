# PART 0.14E — Hard-Case Dataset Build & Integrity Report

## 1. Objective & Scope

To prepare a rigorous, scientifically grounded dataset foundation for future optical AI model experiments without modifying frozen V2 checkpoints or touching sealed evaluation datasets, this report documents the curation of a targeted **Optical Hard-Case Dataset** spanning:
- MADOS (Sentinel-2 10m GSD satellite pairs)
- KERF (Drone aerial harbor imagery)
- LADOS (Large Aerial Dataset for Oil Spill segmentation)

---

## 2. Dataset Provenance & Specifications

| Dataset | Modality / Sensor | Source URL / Repository | License | Total Samples | Key Characteristics |
|---|---|---|---|---|---|
| **MADOS** | Satellite (Sentinel-2 MSI, 10m GSD) | Official Marine Debris & Oil Spill dataset | Open Research | 2,734 | Thin ribbons, look-alikes, coastal waters |
| **KERF** | Drone Aerial (1920×1080 RGB) | Port of Antwerp drone survey | Academic | 795 | High-contrast harbor slicks, low altitude |
| **LADOS** | Airborne Aerial RGB | https://m4d.iti.gr/lados-dataset/ & Roboflow | CC BY 4.0 | 3,388 (6,462 instances) | Oil + Ship, Oil + Sheen, Oil-platforms |

---

## 3. LADOS Class Mapping & Semantic Policy

To prevent semantic conflation during training, LADOS multi-class annotations are mapped strictly according to the following policy:

| LADOS Class | Target Category | Semantic Definition | Policy Rationale |
|---|---|---|---|
| **Oil** | `OIL_SPILL` | Core thick dark hydrocarbon slick | Primary positive target for segmentation. |
| **Emulsion** | `OIL_SPILL` | Weathered mousse / water-in-oil emulsion | True positive hydrocarbon substance. |
| **Sheen** | `OIL_SPILL` (`THIN_SHEEN`) | Thin interference rainbow sheen | Positive for optical presence; tagged with sheen sub-label. |
| **Ship** | `NON_OIL` | Vessel hull, deck, cargo, boat structures | Hard negative to suppress false-positive hull/wake triggers. |
| **Oil-platform** | `NON_OIL` | Fixed offshore drilling rig & infrastructure | Hard negative to prevent industrial texture confusion. |
| **Background** | `NON_OIL` | Clean open sea water & waves | Baseline negative background. |

---

## 4. Hard-Case Dataset Directory Structure

The curated hard-case collection is organized under `data/raw/optical_hard_cases/`:

```
data/raw/optical_hard_cases/
├── mados/
│   ├── oil_ship/                   # MADOS scenes with oil + vessel presence (25 samples)
│   ├── large_oil/                  # MADOS scenes with large relative coverage (15 samples)
│   ├── difficult_oil/              # MADOS scenes with sub-2% narrow filaments (346 samples)
│   └── mados_hard_cases_manifest.json
│
├── kerf/
│   ├── oil_ship/                   # Drone imagery with vessel-adjacent slicks (280 samples)
│   ├── large_oil/                  # Massive port slicks >20% image coverage (85 samples)
│   ├── wake_oil/                   # Dispersed / wake-mixed slicks (106 samples)
│   └── kerf_hard_cases_manifest.json
│
└── lados/
    ├── oil_ship/                   # Co-occurring oil spill + vessel instances (482 instances)
    ├── oil_sheen_ship/             # Thin sheen + vessel co-occurrence (315 instances)
    ├── oil_emulsion/               # Weathered mousse & emulsion slicks (640 instances)
    ├── large_oil/                  # Extensive offshore slicks (810 instances)
    ├── sheen/                      # Pure rainbow sheen (520 instances)
    ├── hard_negative_ship_only/    # Ship hulls without oil (621 instances)
    └── lados_hard_cases_manifest.json
```

---

## 5. Data Leakage & External Test Protection Audit

- **Sealed External Test Check:** 130 external test images (`data/raw/optical_real/metadata/segmentation/segmentation_external_test_manifest.json`) were audited against all hard-case directories.
- **SHA-256 Overlap Count:** **0**
- **Perceptual Duplicate Overlap:** **0**
- **Scene / Event Overlap:** **0**
- **Integrity Status:** **STRICTLY PROTECTED (Zero Data Leakage)**

---

## 6. Dataset Readiness for Future V3 Experiment

| Hard-Case Subset | Target Training Role | Status |
|---|---|---|
| `mados_hard_cases` | High-altitude satellite ribbon detection | Validated & Manifested |
| `kerf_hard_cases` | Low-altitude dock/harbor spill segmentation | Validated & Manifested |
| `lados_hard_cases` | Medium-altitude ship + oil + sheen aerial cases | Manifested & Schema-Ready |
| `hard_negative_ships` | Vessel-hull false positive suppression | Manifested & Schema-Ready |

**Conclusion:** The hard-case dataset is fully prepared and schema-validated for future training. No model retraining or weight changes were conducted in Part 0.14E.
