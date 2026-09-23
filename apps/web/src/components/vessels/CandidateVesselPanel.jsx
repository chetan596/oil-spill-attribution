import React from 'react';
import { Ship, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';
import EvidenceBadge from '../common/EvidenceBadge';

export default function CandidateVesselPanel({
  candidateVessels = [],
  selectedCandidate = null,
  onSelectCandidate,
  onClearSelection,
  isRealScene = false,
  className = '',
}) {
  if (isRealScene && candidateVessels.length === 0) {
    return (
      <section
        className={`panel p-4 bg-[#121417] border border-[#25292F] rounded-lg ${className}`}
        data-component="CandidatesPanel"
        data-brief-id="candidate-vessels"
        data-brief-role="list"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#25292F]">
          <div className="text-xs font-medium text-[#ECEEF1] font-display">
            Candidate Vessels
          </div>
          <EvidenceBadge type="NOT_ESTABLISHED" label="NOT ESTABLISHED" size="xs" />
        </div>
        <div className="p-4 mt-3 bg-[#0C0E11] border border-[#25292F] rounded text-xs text-[#777E87] leading-relaxed">
          AIS correlation is not established for this unlabelled real Sentinel-1 acquisition. No candidate vessel tracks are linked.
        </div>
      </section>
    );
  }

  const defaultCandidates = [
    {
      id: 'vessel-x',
      name: 'Vessel X · MV Kandla Star',
      mmsi: '419001234',
      sub: 'AIS · heading 285° · 72.78°E',
      correlation: 94,
      scorePct: 94,
    },
    {
      id: 'vessel-y',
      name: 'Vessel Y · MT Indrayani',
      mmsi: '419005678',
      sub: 'AIS · heading 212° · 72.85°E',
      correlation: 41,
      scorePct: 41,
    },
    {
      id: 'vessel-z',
      name: 'Vessel Z · Unknown trawler',
      mmsi: '419009999',
      sub: 'No AIS · radar return · 72.90°E',
      correlation: 18,
      scorePct: 18,
    },
  ];

  const list = candidateVessels.length > 0 ? candidateVessels : defaultCandidates;

  return (
    <section
      className={`panel bg-[#121417] border border-[#25292F] rounded-lg ${className}`}
      data-component="CandidatesPanel"
      data-brief-id="candidate-vessels"
      data-brief-role="list"
    >
      {/* Panel Header */}
      <div className="panhead flex items-center justify-between p-4 border-b border-[#25292F]">
        <div className="text-xs font-medium text-[#ECEEF1] font-display">
          Candidate Vessels
        </div>
        {selectedCandidate && (
          <button
            type="button"
            onClick={onClearSelection}
            className="flex items-center gap-1 text-[11px] font-mono text-[#A855F7] hover:underline cursor-pointer"
          >
            <RotateCcw size={10} />
            <span>Reset View</span>
          </button>
        )}
      </div>

      {/* Vessel Items */}
      <div className="vessels p-4 space-y-3 max-h-[580px] overflow-y-auto divide-y divide-[#25292F]">
        {list.map((cand, idx) => {
          const mmsi = cand.mmsi || cand.vessel?.mmsi || `vessel-${idx}`;
          const name = cand.name || cand.vessel?.name || (cand.vessel ? `${cand.vessel.name || 'Candidate'}` : `Candidate ${idx + 1}`);
          const sub = cand.sub || `AIS · heading ${cand.heading || '285'}° · ${cand.lon || '72.78'}°E`;
          const score = cand.correlation !== undefined
            ? cand.correlation
            : cand.totalScore !== undefined
            ? Math.round(cand.totalScore * 100)
            : 50;

          const isSelected = selectedCandidate && (selectedCandidate.mmsi === mmsi || selectedCandidate.vessel?.mmsi === mmsi);

          return (
            <div
              key={mmsi}
              data-brief-role="list-item"
              data-brief-id={cand.id || `vessel-${idx}`}
              onClick={() => onSelectCandidate && onSelectCandidate(cand)}
              className={`vessel pt-3 first:pt-0 cursor-pointer transition-colors ${
                isSelected ? 'bg-[rgba(168,85,247,0.06)] rounded p-2' : ''
              }`}
            >
              <h4 className="text-xs font-medium text-[#ECEEF1] font-display">
                {name}
              </h4>
              <div className="sub font-mono text-[11px] text-[#777E87] mt-0.5 mb-2 tabular-nums">
                {sub}
              </div>

              {/* Progress Bar */}
              <div
                data-chart="progress"
                data-values={score}
                className="w-full h-1.5 bg-[#1D2025] rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-[#A855F7] rounded-full transition-all duration-300"
                  style={{ width: `${score}%` }}
                />
              </div>

              <div className="corr flex items-center justify-between text-[11px] text-[#777E87] font-mono mt-2">
                <span>Correlation</span>
                <b className="text-[#ECEEF1] font-normal tabular-nums">{score}%</b>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modelled Correlation Disclaimer */}
      <div className="p-3 border-t border-[#25292F] text-[10px] font-mono text-[#777E87] leading-relaxed">
        Modelled correlation only. Does not establish legal culpability.
      </div>
    </section>
  );
}

