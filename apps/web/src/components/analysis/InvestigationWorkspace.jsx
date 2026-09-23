/**
 * InvestigationWorkspace.jsx
 * Phase 16.4 Part 6 — Complete Investigation Workspace
 *
 * Consolidates the full manual investigation evidence chain:
 *   INPUT
 *     ↓
 *   AI DETECTION
 *     ↓
 *   SPILL FOOTPRINT
 *     ↓
 *   GEOSPATIAL ANALYSIS
 *     ↓
 *   ESTIMATED ORIGIN
 *     ↓
 *   DRIFT / BACKTRACK
 *     ↓
 *   AIS CORRELATION
 *     ↓
 *   POTENTIAL CANDIDATES
 *     ↓
 *   ATTRIBUTION STATUS
 */

import React, { useState } from 'react';
import InvestigationHeader from './InvestigationHeader';
import ProvenanceLegend from './ProvenanceLegend';
import InvestigationSummaryPanel from './InvestigationSummaryPanel';
import InvestigationInputModelCard from './InvestigationInputModelCard';
import InvestigationDetectionPanel from './InvestigationDetectionPanel';
import InvestigationGeospatialPanel from './InvestigationGeospatialPanel';
import InvestigationOriginPanel from './InvestigationOriginPanel';
import InvestigationDriftPanel from './InvestigationDriftPanel';
import InvestigationAisPanel from './InvestigationAisPanel';
import InvestigationAttributionPanel from './InvestigationAttributionPanel';
import InvestigationLimitationsPanel from './InvestigationLimitationsPanel';
import InvestigationExportControl from './InvestigationExportControl';
import { Layers, Compass, Ship, ShieldAlert, FileText } from 'lucide-react';

export default function InvestigationWorkspace({ canonical, className = '' }) {
  if (!canonical) return null;

  const [activeSection, setActiveSection] = useState('all'); // 'all' | 'detection' | 'origin_drift' | 'ais' | 'attribution'

  const navTabs = [
    { id: 'all', label: 'Full Evidence Chain', icon: Layers },
    { id: 'detection', label: 'Detection & Geospatial', icon: FileText },
    { id: 'origin_drift', label: 'Origin & Drift', icon: Compass },
    { id: 'ais', label: 'AIS Candidates', icon: Ship },
    { id: 'attribution', label: 'Attribution & Limits', icon: ShieldAlert },
  ];

  return (
    <div
      data-testid="investigation-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        width: '100%',
        color: '#F8FAFC',
      }}
      className={className}
    >
      {/* 1. Header */}
      <InvestigationHeader canonical={canonical} />

      {/* 2. Actions & Legend Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
        }}
      >
        <ProvenanceLegend />
        <InvestigationExportControl canonical={canonical} />
      </div>

      {/* 3. Summary Panel */}
      <InvestigationSummaryPanel canonical={canonical} />

      {/* 4. Section Navigation Filter */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          padding: '6px 8px',
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(51, 65, 85, 0.55)',
          borderRadius: '6px',
        }}
      >
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`workspace-tab-${tab.id}`}
              onClick={() => setActiveSection(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '4px',
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.03em',
                cursor: 'pointer',
                background: isActive ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                border: `1px solid ${isActive ? '#38BDF8' : 'transparent'}`,
                color: isActive ? '#38BDF8' : '#94A3B8',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 5. Detailed Panels based on active filter */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Detection & Geospatial Section */}
        {(activeSection === 'all' || activeSection === 'detection') && (
          <>
            <InvestigationInputModelCard canonical={canonical} />
            <InvestigationDetectionPanel canonical={canonical} />
            <InvestigationGeospatialPanel canonical={canonical} />
          </>
        )}

        {/* Origin & Drift Section */}
        {(activeSection === 'all' || activeSection === 'origin_drift') && (
          <>
            <InvestigationOriginPanel canonical={canonical} />
            <InvestigationDriftPanel canonical={canonical} />
          </>
        )}

        {/* AIS Correlation Section */}
        {(activeSection === 'all' || activeSection === 'ais') && (
          <InvestigationAisPanel canonical={canonical} />
        )}

        {/* Attribution & Limitations Section */}
        {(activeSection === 'all' || activeSection === 'attribution') && (
          <>
            <InvestigationAttributionPanel canonical={canonical} />
            <InvestigationLimitationsPanel canonical={canonical} />
          </>
        )}
      </div>
    </div>
  );
}
