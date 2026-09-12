/**
 * Incident Summary Generator (Phase 4 Demonstration / Analytical Synthesizer)
 *
 * Adheres strictly to scientific and evidentiary guidelines:
 * - Refers to vessels as "Candidate Vessels"
 * - Uses "Attribution Score" and "Modelled Correlation"
 * - Classifies evidence into Spatial, Temporal, Trajectory, and Anomaly dimensions
 * - Contains mandatory legal & scientific disclaimers
 */

const SCIENTIFIC_DISCLAIMER =
  "Attribution scores represent modelled spatial, temporal, and trajectory correlations from available AIS and SAR-derived information. They do not establish legal responsibility, causation, or proof of pollution by any vessel. AIS records used in this demonstration are synthetic/demo records and do not represent actual historical vessel movements.";

class LLMService {
  async generateIncidentSummary(data) {
    const { spillId, centroid, areaKm2, confidence, suspects = [] } = data;

    const candidateLines = suspects.map((s, idx) => {
      const v = s.vessel || {};
      const scorePct = Math.round((s.totalScore || 0) * 100);
      const proxPct = s.proximityScore != null ? Math.round(s.proximityScore * 100) : "N/A";
      const tempPct = s.temporalScore != null ? Math.round(s.temporalScore * 100) : "N/A";
      const trajPct = s.trajectoryScore != null ? Math.round(s.trajectoryScore * 100) : "N/A";
      const anomPct = s.anomalyScore != null ? Math.round(s.anomalyScore * 100) : "N/A";

      return `### Candidate Vessel #${s.rank || idx + 1}: ${v.name || 'Unknown'} (MMSI: ${v.mmsi || 'N/A'})
- **Vessel Type / Flag:** ${v.vesselType || 'Unknown'} | Flag: ${v.flag || 'Unknown'} | Length: ${v.lengthM || 'N/A'}m
- **Overall Attribution Score:** ${scorePct}%
- **Evidence Breakdown:**
  - Spatial Evidence (Proximity): ${proxPct}%
  - Temporal Evidence: ${tempPct}%
  - Trajectory Evidence (Kinematics & CPA): ${trajPct}%
  - Anomaly Features (AIS gaps & speed variations): ${anomPct}%`;
    }).join("\n\n");

    return `# Analytical Incident Dossier — Spill Detection & AIS Attribution

## Executive Summary
Anomalous surface slicks consistent with mineral oil signature were detected using Sentinel-1 SAR dual-polarization processing. Spatiotemporal reverse trajectory hindcasting and AIS vessel traffic correlation were executed to identify candidate vessels in the vicinity of the modelled discharge origin.

## Incident Parameters
- **Spill Reference ID:** \`${spillId}\`
- **Estimated Slick Extent:** ${areaKm2 != null ? areaKm2 : "N/A"} km²
- **Centroid Coordinates:** Latitude ${centroid?.lat?.toFixed(4) || "N/A"}°N, Longitude ${centroid?.lng?.toFixed(4) || "N/A"}°E
- **Detection Confidence:** ${confidence != null ? Math.round(confidence * 100) : "N/A"}%
- **AIS Data Source:** Demonstration AIS Dataset (\`source: demo\`)

## Candidate Vessel Attribution Correlation Rankings
${candidateLines || "No candidate vessels identified within the spatiotemporal search radius."}

---

## Evidentiary & Scientific Disclaimer
> **IMPORTANT NOTICE:**
> ${SCIENTIFIC_DISCLAIMER}
`;
  }
}

module.exports = new LLMService();
