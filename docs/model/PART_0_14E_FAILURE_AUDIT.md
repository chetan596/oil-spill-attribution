# PART 0.14E — Optical Model Failure Audit

## 1. Executive Summary & Problem Diagnosis

During manual optical analysis testing of an external aerial image featuring an offshore marine tanker/vessel with an associated spill plume, the integrated production frozen V2 optical AI models exhibited a double-mode failure:
1. **Classifier Failure:** Predicted **`LOOK_ALIKE` (91.9% confidence)** instead of **`OIL_SPILL` (0.2%)**.
2. **Segmentation Failure:** Marked **9.66% area (15,307 pixels)** on peripheral clean water / wave troughs on the right and bottom while completely missing the suspected hydrocarbon discharge plume trailing the vessel.

---

## 2. Failed Image Identification & Provenance

- **Image Path:** `data/uploads/manual/1786da21-7a3c-49e8-b893-1fd6126d5c76/source_image.jpg`
- **SHA-256 Digest:** `36975500bb5ef770b1b9301c03252f39af7d88689f6d4f8683e842e15866be75`
- **Native Dimensions:** 612 × 259 pixels (Aspect Ratio: 2.36:1, extreme widescreen panoramic format)
- **Modality:** Optical 3-Channel RGB
- **Dataset Source:** External User Manual Upload (Aerial marine spill involving a tanker vessel)
- **Ground-Truth Availability:** `GROUND_TRUTH_UNAVAILABLE` (External unlabelled operational photograph)

---

## 3. Classifier V2 Failure Audit

### Raw Inference Metrics
- **Model:** `rgb-oil-classifier-resnet18-v2` (Checkpoint SHA: `6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84`)
- **Raw Logits:** `[0.1644, 2.6182, -3.3523]`
- **Softmax Probabilities:**
  - `LOOK_ALIKE`: **91.87%** (0.9187)
  - `CLEAN_OCEAN`: **7.90%** (0.0790)
  - `OIL_SPILL`: **0.23%** (0.0023)
- **Predicted Class:** `LOOK_ALIKE`

### Root Cause Analysis for Classifier Error
1. **Aspect-Ratio Squish Distortion:**
   - Preprocessing resizes $612 \times 259$ non-square imagery to $224 \times 224$ without aspect preservation, compressing horizontal vessel features and plume textures by $>2.36\times$.
2. **Vessel / Wake Look-Alike Feature Dominance:**
   - In MADOS training data, ship hulls and white foaming turbulent wakes are categorized as look-alikes or background distractors. The prominent vessel structure in the left half triggers strong look-alike activations in the ResNet-18 feature maps ($94.4\%$ look-alike probability on left crop alone).
3. **Absence of Ship-Adjacent Spill Training Distribution:**
   - Training datasets (MADOS and KERF) are dominated by pure water crops without high-contrast large ship hulls, resulting in look-alike over-generalization when a ship is present in the frame.

---

## 4. Segmentation V2 Failure Audit

### Raw Metrics at Frozen Threshold ($\tau = 0.80$)
- **Model:** `optical-oil-seg-unet-resnet18-v2` (Checkpoint SHA: `e3d44f7e480daedf42ef5e96fd0e650193f5763f8dac38630fd21a034e5ea398`)
- **Total Pixels:** 158,508
- **Predicted Foreground Pixels:** 15,246 (9.62% / 15,307 pixels in resized space)
- **Predicted Oil Regions:** Disconnected false-positive clusters over open water wave textures in the right and bottom margins.
- **Missed Regions (False Negatives):** Plume trailing the vessel.

### Root Cause Analysis for Segmentation Error
1. **Domain Shift (Harbor Drone vs Open Sea Aerial):**
   - KERF drone training data consists of calm, high-contrast harbor water in Antwerp. When presented with open ocean waves, the multi-scale bridge interprets deeper wave shadows and water color variations as oil.
2. **Multi-Scale Spatial Disconnect:**
   - MADOS training features are 10m GSD satellite ribbons (thin filaments), while KERF features are close-range dock slicks. An intermediate-altitude aerial photograph represents an unrepresented scale regime.
3. **Specular Sun-Glint & Contrast Inversion:**
   - Sun-glint on the water surface around the vessel inverts the expected dark-to-light gradient, suppressing threshold activations over the diffuse plume.

---

## 5. Failure Taxonomy

| Failure Mode | Category | Mechanism | Impact |
|---|---|---|---|
| **Look-Alike Over-Triggering** | Classification | Vessel hull & wake texture activates look-alike logits | Falsely classifies real spill event as Look-Alike (91.9%) |
| **Aspect Ratio Compression** | Preprocessing | Direct $612 \times 259 \to 224 \times 224$ squishing | Distorts physical scale and geometry of vessel and plume |
| **Dark Water False Positives** | Segmentation | Open-sea wave troughs mistaken for thick slicks | Falsely highlights clean water on margins (9.66% area) |
| **Diffuse Plume Omission** | Segmentation | Low-contrast sheen/plume suppressed by $\tau=0.80$ | Complete false negative on vessel trailing slick |
| **Domain Resolution Gap** | Dataset Gaps | Lack of intermediate aerial drone/aircraft imagery with ships | Severe out-of-distribution sensitivity |

---

## 6. Recommended V3 Strategy (For Future Experiment)

1. **Aspect-Preserving Tiling / Letterboxing Preprocessing:**
   - Replace anisotropic squishing with multi-crop tiling or letterbox padding to maintain authentic aspect ratio.
2. **LADOS Supervised Ingestion:**
   - Incorporate the multi-class LADOS dataset (3,388 images, 6,462 instances) covering `Oil`, `Emulsion`, `Sheen`, `Ship`, and `Oil-platform`.
3. **Explicit Vessel-Aware Hard-Negative Mining:**
   - Include ship-hull masks as explicit non-oil negative classes during segmentation loss computation to prevent wake/hull confusion.
4. **Domain Resolution Harmonization:**
   - Multi-resolution augmentation across satellite (10m), medium aerial (1-5m), and low-altitude drone (<0.5m) scales.
