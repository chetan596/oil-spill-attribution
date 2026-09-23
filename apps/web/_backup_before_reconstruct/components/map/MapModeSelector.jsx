import React from 'react';
import { Compass, Satellite, Wind, Ship } from 'lucide-react';

/**
 * MapModeSelector — Tactical Workstation Mode Switcher.
 * Coordinates preset layer visibility configurations across Command Investigation, SAR Analysis, Drift & Forecast, and AIS Attribution modes.
 */
export default function MapModeSelector({
  currentMode = 'investigation',
  onSelectMode = () => {},
}) {
  const modes = [
    {
      id: 'investigation',
      label: 'COMMAND INVESTIGATION',
      shortLabel: 'Investigation',
      icon: Compass,
      desc: 'Multi-source correlation: Observed SAR, Modelled Drift & AIS CPA',
    },
    {
      id: 'sar',
      label: 'SAR ANALYSIS',
      shortLabel: 'SAR Analysis',
      icon: Satellite,
      desc: 'Observed Sentinel-1 SAR imagery, AI U-Net segmentation & scene metadata',
    },
    {
      id: 'drift',
      label: 'DRIFT & FORECAST',
      shortLabel: 'Drift & Forecast',
      icon: Wind,
      desc: 'Modelled Lagrangian advection: 24h backward hindcast & 6h forward forecast',
    },
    {
      id: 'ais',
      label: 'AIS ATTRIBUTION',
      shortLabel: 'AIS Attribution',
      icon: Ship,
      desc: 'Kinematic vessel correlation, Closest Point of Approach (CPA) & evidence ranking',
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'rgba(11, 21, 19, 0.85)',
        backdropFilter: 'blur(6px)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: '3px',
      }}
    >
      {modes.map((m) => {
        const Icon = m.icon;
        const isActive = currentMode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelectMode(m.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '3px',
              border: isActive ? '1px solid var(--accent-cyan)' : '1px solid transparent',
              background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontSize: '0.72rem',
              fontWeight: isActive ? 700 : 500,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={m.desc}
          >
            <Icon size={13} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
