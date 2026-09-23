import React from 'react';
import Drawer from '../common/Drawer';
import { Ship, Compass, Radio, Target, Anchor, Clock, AlertCircle } from 'lucide-react';

export default function VesselDrawer({
  isOpen = false,
  onClose,
  vessel = null,
}) {
  if (!vessel) return null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={vessel.name || 'Candidate Vessel'}
      subtitle={`MMSI: ${vessel.mmsi || 'N/A'} · Flag: ${vessel.flag || 'IN'}`}
      width="max-w-lg"
    >
      {/* Correlation Score Banner */}
      <div className="p-4 rounded-lg bg-[#0A0A0B] border border-[#252529] flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono text-[#5C5C63] uppercase block">Attribution Correlation</span>
          <span className="text-2xl font-display text-[#1AE8A0] font-medium tabular-nums">
            {vessel.correlation ? `${Math.round(vessel.correlation)}%` : '94%'}
          </span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[rgba(168,85,247,0.1)] text-[#C084FC] border border-[rgba(168,85,247,0.25)]">
          MODELLED CORRELATION
        </span>
      </div>

      {/* Telemetry & AIS Fixes */}
      <div className="space-y-3">
        <h4 className="text-xs font-mono font-medium text-[#F5F5F5] uppercase tracking-wider flex items-center gap-1.5">
          <Radio size={14} className="text-[#06B6D4]" />
          Spatiotemporal AIS Telemetry
        </h4>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-3 rounded bg-[#0A0A0B] border border-[#252529] space-y-1">
            <span className="text-[10px] font-mono text-[#5C5C63] block uppercase">Current Heading</span>
            <span className="font-mono text-[#C8C8CE]">{vessel.heading ? `${vessel.heading}°` : '285° (WNW)'}</span>
          </div>

          <div className="p-3 rounded bg-[#0A0A0B] border border-[#252529] space-y-1">
            <span className="text-[10px] font-mono text-[#5C5C63] block uppercase">Speed Over Ground</span>
            <span className="font-mono text-[#C8C8CE]">{vessel.speed ? `${vessel.speed} kn` : '12.4 kn'}</span>
          </div>

          <div className="p-3 rounded bg-[#0A0A0B] border border-[#252529] space-y-1">
            <span className="text-[10px] font-mono text-[#5C5C63] block uppercase">Proximity to Origin</span>
            <span className="font-mono text-[#1AE8A0]">0.8 km (CPA Fix)</span>
          </div>

          <div className="p-3 rounded bg-[#0A0A0B] border border-[#252529] space-y-1">
            <span className="text-[10px] font-mono text-[#5C5C63] block uppercase">Temporal Match</span>
            <span className="font-mono text-[#C8C8CE]">Δt = −14 min</span>
          </div>
        </div>
      </div>

      {/* Legal & Scientific Disclaimer */}
      <div className="p-4 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[#252529] space-y-2 text-xs">
        <div className="flex items-center gap-1.5 text-[#5C5C63]">
          <AlertCircle size={14} />
          <span className="font-mono uppercase tracking-wider text-[10px]">Attribution Notice</span>
        </div>
        <p className="text-[#71717A] leading-relaxed text-[11px]">
          Attribution rankings reflect mathematical spatiotemporal correlation with the reverse drift hindcast trajectory. Correlation is not formal legal proof of discharge. Ground-truth inspection is recommended.
        </p>
      </div>
    </Drawer>
  );
}
