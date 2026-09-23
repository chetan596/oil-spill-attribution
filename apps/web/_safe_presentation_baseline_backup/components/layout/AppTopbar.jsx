import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Waves, Share2, PlusCircle, Sparkles, Check } from 'lucide-react';
import NetworkStatus from '../common/NetworkStatus';
import SourceBadge from '../common/SourceBadge';

export default function AppTopbar({
  activeScene = 'SIH-26.1K',
  sceneMeta = 'Sentinel-1 C-band · 18.94°N 72.81°E',
  mode = 'DEMO',
  provenanceState,
  onOpenSystemStatus,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSynthesize = () => {
    navigate('/reports');
  };

  return (
    <header
      className="topbar flex items-center justify-between gap-4 px-6 py-3 bg-[#0A0A0B] border-b border-[#252529] select-none flex-shrink-0 z-30"
      data-brief-id="topbar"
      data-brief-role="nav-top"
      role="banner"
    >
      {/* Left: Brand Identity */}
      <div className="brand flex items-center gap-3">
        <span className="brand-mark w-7 h-7 rounded-full border border-[rgba(255,255,255,0.12)] flex items-center justify-center text-[#A855F7] flex-shrink-0">
          <Waves size={16} />
        </span>
        <span className="brand-name font-display text-base font-medium text-[#F5F5F5] tracking-wide">
          OceanGuard AI
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[rgba(255,255,255,0.04)] text-[#5C5C63]">
          SIH26143
        </span>
      </div>

      {/* Center: Current Scene Metadata (Tabular Nums) */}
      <div className="hidden md:flex items-center gap-3">
        <SourceBadge mode={mode} provenanceState={provenanceState} size="sm" />
        <span className="scene-meta font-mono text-xs text-[#5C5C63] tabular-nums">
          Scene <b className="text-[#C8C8CE] font-normal">{activeScene}</b> · {sceneMeta}
        </span>
      </div>

      {/* Right: Network Status, Share Action & Synthesize CTA */}
      <div className="flex items-center gap-3">
        <NetworkStatus onClick={onOpenSystemStatus} />

        <button
          type="button"
          onClick={handleShare}
          className="ghost-btn hidden sm:inline-flex items-center gap-1.5 text-xs text-[#C8C8CE] hover:text-[#F5F5F5] border border-[rgba(255,255,255,0.08)] hover:bg-[#141416] rounded-full px-3.5 py-1.5 transition-colors cursor-pointer"
          title="Copy link to current forensic investigation"
        >
          {copied ? <Check size={13} className="text-[#1AE8A0]" /> : <Share2 size={13} />}
          <span>{copied ? 'Copied' : 'Share'}</span>
        </button>

        {location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/analysis') ? (
          <button
            type="button"
            onClick={handleSynthesize}
            className="cta-synthesize text-white rounded-full px-4 py-1.5 text-xs font-medium cursor-pointer shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
            data-brief-id="cta-synthesize"
            data-brief-role="cta"
          >
            <Sparkles size={13} className="flex-shrink-0" />
            <span>Synthesize Dossier</span>
          </button>
        ) : (
          <Link
            to="/analysis/new"
            className="button-primary text-black rounded-full px-4 py-1.5 text-xs font-medium cursor-pointer transition-all"
          >
            <PlusCircle size={13} className="flex-shrink-0" />
            <span>New Mission</span>
          </Link>
        )}
      </div>
    </header>
  );
}

