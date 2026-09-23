/**
 * InvestigationLimitationsPanel.jsx
 * Phase 16.4 Part 6 — Evidence Limitations Panel
 *
 * Dynamically derives limitation items based on the active investigation's provenance flags:
 *   - DEMONSTRATION METOCEAN FORCING
 *   - DEMONSTRATION AIS DATA
 *   - ESTIMATION TIME PROXY
 *   - AIS COVERAGE LIMITATION
 *   - GEOSPATIAL DATA UNAVAILABLE
 *   - FORWARD DRIFT UNAVAILABLE
 *   - MODEL-DERIVED SPILL GEOMETRY
 *   - MODEL-DERIVED ORIGIN
 *   - VESSEL ATTRIBUTION NOT ESTABLISHED
 *
 * Only renders limitations that actually apply.
 */

import React from 'react';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceLegend';

export default function InvestigationLimitationsPanel({ canonical, className = '' }) {
  if (!canonical) return null;

  const geo = canonical.geospatial || {};
  const origin = canonical.origin || {};
  const drift = canonical.drift || {};
  const ais = canonical.aisCorrelation || {};
  const isDemoMetOcean = Boolean(drift.environmentalData?.isDemo || drift.environmentalData?.source === 'DEMO');
  const isDemoAis = Boolean(ais.isDemo || ais.source === 'DEMO');

  const limitations = [];

  if (isDemoMetOcean) {
    limitations.push({
      id: 'demo-metocean',
      title: 'DEMONSTRATION METOCEAN FORCING',
      prov: 'DEMO',
      desc: 'Drift simulation is driven by demonstration wind/current models rather than verified historical reanalysis.',
    });
  }

  if (isDemoAis) {
    limitations.push({
      id: 'demo-ais',
      title: 'DEMONSTRATION AIS DATA',
      prov: 'DEMO',
      desc: 'Candidate vessels are matched against demonstration test telemetry; not real-world maritime evidence.',
    });
  }

  if (origin.timestampSource === 'ESTIMATION_TIME_PROXY' || drift.timestampSource === 'ESTIMATION_TIME_PROXY') {
    limitations.push({
      id: 'time-proxy',
      title: 'ESTIMATION TIME PROXY',
      prov: 'ESTIMATION_TIME_PROXY',
      desc: 'Raster header lacked acquisition timestamp; reference time was estimated via job creation timestamp proxy.',
    });
  }

  if (!geo.available) {
    limitations.push({
      id: 'no-geo',
      title: 'GEOSPATIAL DATA UNAVAILABLE',
      prov: 'NOT_AVAILABLE',
      desc: 'Input image lacks CRS and georeferencing tags; geospatial bounds and origin mapping are unavailable.',
    });
  }

  if (drift.forward?.status === 'NOT_AVAILABLE') {
    limitations.push({
      id: 'no-forward',
      title: 'FORWARD DRIFT UNAVAILABLE',
      prov: 'NOT_AVAILABLE',
      desc: 'Forward dispersion forecasting was not generated or is unsupported for this input.',
    });
  }

  if (ais.status === 'NO_CANDIDATES' || ais.status === 'AIS_DATA_UNAVAILABLE') {
    limitations.push({
      id: 'ais-coverage',
      title: 'AIS COVERAGE LIMITATION',
      prov: 'NOT_AVAILABLE',
      desc: 'Zero candidates found or AIS data coverage was unavailable in the target search window.',
    });
  }

  if (geo.available && geo.spillFootprint) {
    limitations.push({
      id: 'model-geometry',
      title: 'MODEL-DERIVED SPILL GEOMETRY',
      prov: 'MODEL_DERIVED',
      desc: 'Spill polygon is predicted by neural segmentation and carries boundary uncertainty.',
    });
  }

  if (origin.status === 'ESTIMATED') {
    limitations.push({
      id: 'model-origin',
      title: 'MODEL-DERIVED ORIGIN',
      prov: 'MODEL_DERIVED',
      desc: `Origin carries a model uncertainty radius of ${origin.uncertaintyRadiusKm ? origin.uncertaintyRadiusKm.toFixed(2) : 2.5} km.`,
    });
  }

  // Always applicable
  limitations.push({
    id: 'attribution-guardrail',
    title: 'VESSEL ATTRIBUTION NOT ESTABLISHED',
    prov: 'NOT_AVAILABLE',
    desc: 'Spatiotemporal AIS correlation indicates geographic proximity only; it does not prove vessel responsibility.',
  });

  return (
    <div
      data-testid="investigation-limitations-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '16px',
        background: 'rgba(15, 23, 42, 0.7)',
        border: '1px solid rgba(51, 65, 85, 0.65)',
        borderRadius: '8px',
      }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} color="#F59E0B" />
          <h3 style={{ margin: 0, fontSize: '0.90rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Evidence Limitations ({limitations.length})
          </h3>
        </div>
        <span style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontFamily: 'monospace' }}>
          Auto-derived
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {limitations.map((lim) => (
          <div
            key={lim.id}
            data-testid={`limitation-${lim.id}`}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              padding: '8px 12px',
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(51, 65, 85, 0.4)',
              borderRadius: '4px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: '1 1 240px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#E2E8F0' }}>
                {lim.title}
              </span>
              <span style={{ fontSize: '0.70rem', color: '#94A3B8', lineHeight: 1.3 }}>
                {lim.desc}
              </span>
            </div>
            <ProvenanceBadge type={lim.prov} size="xs" />
          </div>
        ))}
      </div>
    </div>
  );
}
