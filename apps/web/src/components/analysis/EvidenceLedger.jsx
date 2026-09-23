import React from 'react';
import { Satellite, Compass, Ship, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

export default function EvidenceLedger({
  entries = [],
  activeEntryId,
  onSelectEntry,
  className = '',
}) {
  const defaultEntries = [
    {
      id: 'entry-1',
      stage: '01',
      title: 'Satellite Pass #1 — SAR acquisition',
      type: 'OBSERVED',
      timestamp: '12 Sep 2026 · 06:15 UTC',
      description: 'High-confidence slick signature detected off the Mumbai corridor.',
      facts: [
        { label: 'Area', value: '2.3 km²' },
        { label: 'Confidence', value: '92%' },
        { label: 'Coord', value: '18.94°N 72.81°E' },
      ],
      coordinates: [18.94, 72.81],
      accented: false,
    },
    {
      id: 'entry-2',
      stage: '02',
      title: 'Drift Prediction',
      type: 'MODELLED',
      timestamp: '12 Sep 2026 · 06:20 UTC',
      description: 'Lagrangian forward advection based on ECMWF 10-m surface wind.',
      facts: [
        { label: 'Vector', value: '4.2 km NW' },
        { label: 'Speed', value: '0.8 m/s' },
      ],
      accented: false,
    },
    {
      id: 'entry-3',
      stage: '03',
      title: 'Hindcast — origin fix',
      type: 'MODELLED',
      timestamp: '12 Sep 2026 · 06:32 UTC',
      description: 'Backward dispersion trajectory resolves stationary discharge point.',
      facts: [
        { label: 'Origin', value: '18.91°N 72.79°E' },
        { label: 'Window', value: '-24 h' },
      ],
      coordinates: [18.91, 72.79],
      accented: false,
    },
    {
      id: 'entry-4',
      stage: '04',
      title: 'Candidate Match — Vessel X',
      type: 'MODELLED_CORRELATION',
      timestamp: '12 Sep 2026 · 07:04 UTC',
      description: 'MV Kandla Star AIS track intersects hindcast origin window.',
      facts: [
        { label: 'Correlation', value: '94%' },
        { label: 'Heading', value: '285°' },
        { label: 'Pos', value: '72.78°E' },
      ],
      accented: true,
    },
    {
      id: 'entry-5',
      stage: '05',
      title: 'Satellite Pass #2 — confirmation',
      type: 'OBSERVED',
      timestamp: '12 Sep 2026 · 08:40 UTC',
      description: 'Secondary Sentinel-1 pass confirms slick elongation along drift axis.',
      facts: [
        { label: 'Area', value: '2.8 km²' },
        { label: 'Confidence', value: '89%' },
      ],
      accented: false,
    },
    {
      id: 'entry-6',
      stage: '06',
      title: 'Dispatch — patrol asset tasked',
      type: 'OBSERVED',
      timestamp: '12 Sep 2026 · 09:15 UTC',
      description: 'Indian Coast Guard Interceptor tasked for ground-truth inspection.',
      facts: [
        { label: 'ETA', value: '71 min' },
        { label: 'Range', value: '31 km' },
      ],
      accented: false,
    },
  ];

  const displayEntries = entries.length > 0 ? entries : defaultEntries;

  return (
    <section
      className={`panel bg-[#121417] border border-[#25292F] rounded-lg ${className}`}
      data-component="LedgerPanel"
      data-brief-id="evidence-ledger"
      data-brief-role="list"
    >
      {/* Panel Header */}
      <div className="panhead flex items-center justify-between p-4 border-b border-[#25292F]">
        <div className="flex items-center gap-2">
          <span className="sw bg-[#A855F7]" />
          <span className="text-xs font-medium text-[#ECEEF1] font-display tracking-wide">
            Evidence Ledger · {displayEntries.length} entries
          </span>
        </div>
      </div>

      {/* Ledger Entries List */}
      <div className="ledger p-4 space-y-4 max-h-[580px] overflow-y-auto divide-y divide-[#25292F]">
        {displayEntries.map((entry, idx) => {
          const isSelected = activeEntryId === entry.id;

          return (
            <div
              key={entry.id || idx}
              data-brief-role="list-item"
              data-brief-id={entry.id || `entry-${idx + 1}`}
              onClick={() => onSelectEntry && onSelectEntry(entry)}
              className={`entry pt-3 first:pt-0 cursor-pointer transition-colors ${
                isSelected ? 'bg-[rgba(168,85,247,0.06)] rounded p-2' : ''
              }`}
            >
              {/* Timestamp & Type Badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="ts font-mono text-[11px] text-[#777E87] tabular-nums">
                  {entry.timestamp}
                </span>
                {entry.type && (
                  <EvidenceBadge type={entry.type} size="xs" />
                )}
              </div>

              {/* Title */}
              <h3
                className={`text-xs font-medium mt-1 mb-1 font-display tracking-wide ${
                  entry.accented ? 'text-[#A855F7]' : 'text-[#ECEEF1]'
                }`}
              >
                {entry.title}
              </h3>

              {/* Summary Description */}
              {entry.description && (
                <p className="text-xs text-[#B1B6BD] leading-relaxed mb-2">
                  {entry.description}
                </p>
              )}

              {/* Key Forensic Facts */}
              {entry.facts && entry.facts.length > 0 && (
                <div className="facts flex items-center gap-3 flex-wrap text-[11px] text-[#777E87] font-mono">
                  {entry.facts.map((fact, fIdx) => (
                    <span key={fIdx}>
                      {fact.label}{' '}
                      <b className="text-[#B1B6BD] font-normal tabular-nums">
                        {fact.value}
                      </b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

