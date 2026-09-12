# Section Prompt — Candidate Vessel Attribution Assessment

Analyze and summarize the candidate vessel correlations provided in the structured evidence package.

## Requirements:
1. Review each ranked candidate vessel without altering any rank, Attribution Score, proximity score, temporal score, trajectory score, or anomaly score.
2. For each candidate vessel, provide:
   - `candidateVessel`: Vessel name, MMSI, IMO, vessel type, flag, and overall Attribution Score.
   - `summary`: Concise synthesis of the spatiotemporal and kinematic correlation to the Modelled Spill Origin.
   - `supportingEvidence`: Specific metrics supporting correlation (e.g. closest approach distance in km, arrival time delta relative to estimated discharge window, course alignment).
   - `limitingEvidence`: Specific factors attenuating or contextualizing the correlation (e.g. AIS transmission gaps, normal maritime transit lane geometry, demonstration data origin).
3. Do NOT make accusations or declare any vessel "responsible" or "guilty".
4. State explicitly that candidate rankings reflect mathematical correlation with the available AIS dataset.
