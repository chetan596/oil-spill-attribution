import React from 'react';
import Drawer from '../common/Drawer';
import { Cpu, ShieldCheck, AlertTriangle, Layers, Database, Activity, GitBranch } from 'lucide-react';

export default function ModelDrawer({
  isOpen = false,
  onClose,
  model = {
    id: 'unet-dual-pol-sar-v2',
    name: 'Dual-Pol U-Net V2',
    architecture: '2-Channel Encoder-Decoder U-Net with Skip Connections',
    inputs: 'Sentinel-1 Level-1 GRD SAR (VV + VH amplitude rasters)',
    role: 'SAR Dark-Surface Candidate Segmentation',
    status: 'ACTIVE BASELINE',
    benchmarkIoU: 0.784,
    benchmarkDice: 0.879,
    benchmarkPrecision: 0.892,
    benchmarkRecall: 0.866,
    lookalikeFpr: 0.048,
    decisionThreshold: 0.50,
    lineage: 'Trained on verified Sentinel-1 oil slick ground-truth corpus (12,400 patches).',
    limitations: [
      'Identifies radar dark-surface anomalies (oil slicks, low wind calm water, biogenic surfactants).',
      'Does not estimate oil chemical composition or spill thickness.',
      'Live unlabelled scenes produce candidate confidence masks without synthetic accuracy claims.',
    ],
  },
}) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Model Architecture & Lineage"
      subtitle={`Identifier: ${model.id} · Version: V2.1`}
      width="max-w-xl"
    >
      {/* Overview Card */}
      <div className="p-4 rounded-lg bg-[#0A0A0B] border border-[#252529] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={16} className="text-[#A855F7]" />
            <h4 className="text-sm font-medium text-[#F5F5F5]">{model.name}</h4>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[rgba(26,232,160,0.1)] text-[#1AE8A0] border border-[rgba(26,232,160,0.25)]">
            {model.status}
          </span>
        </div>

        <p className="text-xs text-[#71717A] leading-relaxed">
          {model.architecture}
        </p>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#252529] text-[11px] font-mono">
          <div>
            <span className="text-[#5C5C63] block">Input Channels:</span>
            <span className="text-[#C8C8CE]">{model.inputs}</span>
          </div>
          <div>
            <span className="text-[#5C5C63] block">Operational Role:</span>
            <span className="text-[#C8C8CE]">{model.role}</span>
          </div>
        </div>
      </div>

      {/* Benchmark Metrics (Verified Offline Corpus) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-mono font-medium text-[#F5F5F5] uppercase tracking-wider flex items-center gap-1.5">
            <Activity size={14} className="text-[#06B6D4]" />
            Verified Offline Benchmark Metrics
          </h4>
          <span className="text-[10px] font-mono text-[#5C5C63]">Corpus Eval</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded bg-[#0A0A0B] border border-[#252529]">
            <span className="text-[10px] font-mono text-[#5C5C63] block uppercase">IoU Score (Jaccard)</span>
            <span className="text-lg font-display text-[#1AE8A0] tabular-nums font-medium">{(model.benchmarkIoU * 100).toFixed(1)}%</span>
            <div className="w-full bg-[#222224] h-1 rounded-full mt-2 overflow-hidden">
              <div className="bg-[#1AE8A0] h-full" style={{ width: `${model.benchmarkIoU * 100}%` }} />
            </div>
          </div>

          <div className="p-3 rounded bg-[#0A0A0B] border border-[#252529]">
            <span className="text-[10px] font-mono text-[#5C5C63] block uppercase">Dice Coefficient (F1)</span>
            <span className="text-lg font-display text-[#1AE8A0] tabular-nums font-medium">{(model.benchmarkDice * 100).toFixed(1)}%</span>
            <div className="w-full bg-[#222224] h-1 rounded-full mt-2 overflow-hidden">
              <div className="bg-[#1AE8A0] h-full" style={{ width: `${model.benchmarkDice * 100}%` }} />
            </div>
          </div>

          <div className="p-3 rounded bg-[#0A0A0B] border border-[#252529]">
            <span className="text-[10px] font-mono text-[#5C5C63] block uppercase">Precision / Recall</span>
            <span className="text-sm font-mono text-[#C8C8CE] tabular-nums mt-1 block">
              {(model.benchmarkPrecision * 100).toFixed(1)}% / {(model.benchmarkRecall * 100).toFixed(1)}%
            </span>
          </div>

          <div className="p-3 rounded bg-[#0A0A0B] border border-[#252529]">
            <span className="text-[10px] font-mono text-[#5C5C63] block uppercase">Look-Alike FPR</span>
            <span className="text-sm font-mono text-[#FBBF24] tabular-nums mt-1 block">
              {(model.lookalikeFpr * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Scientific Governance & Limitations */}
      <div className="p-4 rounded-lg bg-[rgba(251,191,36,0.04)] border border-[rgba(251,191,36,0.2)] space-y-2">
        <div className="flex items-center gap-2 text-[#FBBF24]">
          <AlertTriangle size={15} />
          <h5 className="text-xs font-mono font-medium uppercase tracking-wider">Scientific Governance & Known Limitations</h5>
        </div>
        <ul className="space-y-1.5 text-xs text-[#C8C8CE]">
          {model.limitations.map((lim, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-[#FBBF24] select-none">•</span>
              <span className="leading-relaxed">{lim}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Model Registry Lineage */}
      <div className="p-4 rounded-lg bg-[#0A0A0B] border border-[#252529] space-y-2 text-xs">
        <div className="flex items-center gap-2 text-[#C8C8CE]">
          <GitBranch size={14} className="text-[#A855F7]" />
          <span className="font-mono uppercase tracking-wider text-[11px] text-[#5C5C63]">Registry Status & Lineage</span>
        </div>
        <p className="text-[#71717A] leading-relaxed">
          {model.lineage} Experimental residual model <code className="text-[#C084FC]">v5-deep-residual</code> remains <b>HELD</b> pending multi-season validation.
        </p>
      </div>
    </Drawer>
  );
}
