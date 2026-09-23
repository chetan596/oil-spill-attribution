import React from 'react';
import { Link } from 'react-router-dom';
import { Droplet, MapPin, Clock, ArrowRight, ShieldCheck, Radio, ChevronRight } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

export default function IncidentList({
  spills = [],
  selectedSpill = null,
  onSelectSpill,
  className = '',
}) {
  const defaultSpills = [
    {
      id: 'spill-demo-001',
      title: 'Potential Oil Slick #001',
      missionId: 'MISSION-26143-A',
      sceneId: 'demo-scene-001',
      latitude: 18.94,
      longitude: 72.81,
      areaKm2: 2.3,
      confidence: 0.92,
      detectedAt: '2026-09-12T06:15:00Z',
      isRealScene: false,
    },
    {
      id: 'spill-demo-002',
      title: 'Potential Oil Slick #002',
      missionId: 'MISSION-26143-B',
      sceneId: 'demo-scene-002',
      latitude: 22.45,
      longitude: 69.10,
      areaKm2: 4.8,
      confidence: 0.88,
      detectedAt: '2026-09-11T14:30:00Z',
      isRealScene: false,
    },
    {
      id: 'spill-demo-003',
      title: 'Potential Oil Slick #003',
      missionId: 'MISSION-26143-C',
      sceneId: 'demo-scene-003',
      latitude: 20.15,
      longitude: 86.70,
      areaKm2: 1.7,
      confidence: 0.79,
      detectedAt: '2026-09-10T09:45:00Z',
      isRealScene: false,
    },
  ];

  const items = spills && spills.length > 0 ? spills : defaultSpills;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-[var(--og-text-muted,#777E87)]">
          Detected Incidents ({items.length})
        </span>
        <span className="text-[10px] font-mono text-[var(--og-text-muted,#777E87)]">
          Active Theater
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto pr-1">
        {items.map((item) => {
          const isSelected = selectedSpill?.id === item.id;
          const lat = Number(item.latitude);
          const lng = Number(item.longitude);
          const area = item.areaKm2 ? Number(item.areaKm2).toFixed(1) : '2.3';
          const conf = item.confidence ? Math.round(Number(item.confidence) * 100) : 92;

          return (
            <div
              key={item.id}
              onClick={() => onSelectSpill && onSelectSpill(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  onSelectSpill && onSelectSpill(item);
                }
              }}
              className={`p-3.5 rounded-[6px] border transition-all duration-150 cursor-pointer select-none text-left ${
                isSelected
                  ? 'bg-[var(--og-surface-raised,#171A1E)] border-[var(--og-violet,#A855F7)] shadow-sm'
                  : 'bg-[var(--og-surface,#121417)] border-[var(--og-border,#25292F)] hover:border-[var(--og-border-strong,#343940)] hover:bg-[var(--og-surface-raised,#171A1E)]'
              }`}
            >
              {/* Top Row: Title + Provenance */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0 ${
                      isSelected
                        ? 'bg-[rgba(168,85,247,0.15)] text-[var(--og-violet,#A855F7)]'
                        : 'bg-[var(--og-surface-elevated,#1D2025)] text-[var(--og-text-muted,#777E87)]'
                    }`}
                  >
                    <Droplet size={13} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-medium text-[var(--og-text-primary,#ECEEF1)] font-sans truncate">
                      {item.title || `Potential Oil Slick #${String(item.id).slice(0, 8)}`}
                    </h4>
                    <span className="text-[10px] font-mono text-[var(--og-text-muted,#777E87)] truncate block">
                      Mission #{item.missionId || String(item.id).slice(0, 6)}
                    </span>
                  </div>
                </div>

                <EvidenceBadge
                  type="OBSERVED"
                  size="sm"
                />
              </div>

              {/* Coordinates & Physical Dimensions */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-[var(--og-border-subtle,#1B1E22)] text-[11px]">
                <div className="flex items-center gap-1.5 text-[var(--og-text-secondary,#B1B6BD)] font-mono tabular-nums truncate">
                  <MapPin size={11} className="text-[var(--og-teal,#49C6C8)] flex-shrink-0" />
                  <span className="truncate">
                    {!isNaN(lat) && !isNaN(lng)
                      ? `${lat.toFixed(2)}°N ${lng.toFixed(2)}°E`
                      : '18.94°N 72.81°E'}
                  </span>
                </div>

                <div className="text-right font-mono tabular-nums">
                  <span className="text-[var(--og-text-primary,#ECEEF1)] font-medium">{area} km²</span>
                  <span className="text-[var(--og-text-muted,#777E87)] text-[10px] ml-1">({conf}%)</span>
                </div>
              </div>

              {/* Bottom Row: Timestamp + Action Link */}
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[var(--og-border-subtle,#1B1E22)] text-[10px] text-[var(--og-text-muted,#777E87)]">
                <div className="flex items-center gap-1">
                  <Clock size={10} />
                  <span>
                    {item.detectedAt
                      ? new Date(item.detectedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '12 Sep 2026 · 06:15 UTC'}
                  </span>
                </div>

                <Link
                  to={item.analysisId ? `/analysis/${item.analysisId}` : `/spills/${item.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[var(--og-violet,#A855F7)] hover:text-[#C084FC] font-medium transition-colors focus-visible:underline focus-visible:outline-none"
                >
                  <span>Command Center</span>
                  <ChevronRight size={11} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
