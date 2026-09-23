import React, { useState } from 'react';
import Button from '../components/common/Button';
import IconButton from '../components/common/IconButton';
import EvidenceBadge from '../components/common/EvidenceBadge';
import StatusBadge from '../components/common/StatusBadge';
import SourceBadge from '../components/common/SourceBadge';
import ModelBadge from '../components/common/ModelBadge';
import Tooltip from '../components/common/Tooltip';
import { Metric, MetricStrip } from '../components/common/Metric';
import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonMap,
  SkeletonTable,
  SkeletonChart,
  SkeletonMetric,
} from '../components/common/Skeleton';
import ErrorState from '../components/common/ErrorState';
import MediaErrorState from '../components/common/MediaErrorState';
import EmptyState from '../components/common/EmptyState';
import NetworkStatus from '../components/common/NetworkStatus';
import DownloadProgress from '../components/common/DownloadProgress';
import JobProgress from '../components/common/JobProgress';
import Drawer from '../components/common/Drawer';
import Modal from '../components/common/Modal';
import ModelDrawer from '../components/analysis/ModelDrawer';
import VesselDrawer from '../components/vessels/VesselDrawer';
import {
  Satellite,
  Compass,
  Ship,
  Sparkles,
  Search,
  Plus,
  Radio,
  Layers,
  Info,
} from 'lucide-react';

export default function DesignSystem() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modelDrawerOpen, setModelDrawerOpen] = useState(false);
  const [vesselDrawerOpen, setVesselDrawerOpen] = useState(false);

  return (
    <div
      style={{
        backgroundColor: 'var(--og-bg)',
        color: 'var(--og-text-primary)',
        minHeight: '100%',
        padding: '24px 32px 48px',
        boxSizing: 'border-box',
        fontFamily: 'var(--og-font-body)',
      }}
    >
      <div className="space-y-10 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium text-[var(--og-violet)] uppercase tracking-wider">
              TACTICAL MARITIME DESIGN SYSTEM
            </span>
            <span className="text-[var(--og-text-muted)]">•</span>
            <EvidenceBadge type="OBSERVED" label="CANONICAL TOKENS" size="xs" />
          </div>
          <h1 className="page-title text-3xl md:text-4xl font-display font-medium text-[var(--og-text-primary)]">
            Blue Forensic AI Design System & Component Reference
          </h1>
          <p className="text-xs text-[var(--og-text-secondary)] max-w-2xl leading-relaxed">
            Operational maritime forensic UI primitives: Canonical dark palette (~90%+ neutral darks: #0A0B0D canvas, #121417 surface, #171A1E raised), semantic accents (Teal #49C6C8, Amber #E7A63A, Violet #A855F7, Magenta #EC4899, Green #4ADE80), Hanken Grotesk + Schibsted Grotesk typography, 8px card radius, and strict evidence provenance.
          </p>
        </div>

        {/* ── 1. COLOR TOKENS ────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-[var(--og-text-primary)] uppercase tracking-wider">
            1. Color Palette Tokens (~90% Neutral Darks, ~10% Semantic Accents)
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3 font-mono text-xs">
            <div className="p-3 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
              <div className="w-full h-8 bg-[var(--og-bg)] border border-[var(--og-border)] rounded mb-2" />
              <span className="text-[var(--og-text-primary)] block font-sans font-medium">Canvas</span>
              <span className="text-[var(--og-text-muted)] text-[10px]">#0A0B0D</span>
            </div>

            <div className="p-3 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
              <div className="w-full h-8 bg-[var(--og-surface)] border border-[var(--og-border)] rounded mb-2" />
              <span className="text-[var(--og-text-primary)] block font-sans font-medium">Surface</span>
              <span className="text-[var(--og-text-muted)] text-[10px]">#121417</span>
            </div>

            <div className="p-3 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
              <div className="w-full h-8 bg-[var(--og-surface-raised)] border border-[var(--og-border)] rounded mb-2" />
              <span className="text-[var(--og-text-primary)] block font-sans font-medium">Raised</span>
              <span className="text-[var(--og-text-muted)] text-[10px]">#171A1E</span>
            </div>

            <div className="p-3 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
              <div className="w-full h-8 bg-[var(--og-teal)] rounded mb-2" />
              <span className="text-[var(--og-text-primary)] block font-sans font-medium">Teal (SAR)</span>
              <span className="text-[var(--og-text-muted)] text-[10px]">#49C6C8</span>
            </div>

            <div className="p-3 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
              <div className="w-full h-8 bg-[var(--og-amber)] rounded mb-2" />
              <span className="text-[var(--og-text-primary)] block font-sans font-medium">Amber (Drift)</span>
              <span className="text-[var(--og-text-muted)] text-[10px]">#E7A63A</span>
            </div>

            <div className="p-3 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
              <div className="w-full h-8 bg-[var(--og-violet)] rounded mb-2" />
              <span className="text-[var(--og-text-primary)] block font-sans font-medium">Violet (AIS/CTA)</span>
              <span className="text-[var(--og-text-muted)] text-[10px]">#A855F7</span>
            </div>

            <div className="p-3 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
              <div className="w-full h-8 bg-[var(--og-magenta)] rounded mb-2" />
              <span className="text-[var(--og-text-primary)] block font-sans font-medium">Magenta</span>
              <span className="text-[var(--og-text-muted)] text-[10px]">#EC4899</span>
            </div>

            <div className="p-3 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
              <div className="w-full h-8 bg-[var(--og-success)] rounded mb-2" />
              <span className="text-[var(--og-text-primary)] block font-sans font-medium">Success</span>
              <span className="text-[var(--og-text-muted)] text-[10px]">#4ADE80</span>
            </div>
          </div>
        </section>

        {/* ── 2. BUTTONS & CONTROLS ──────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-[var(--og-text-primary)] uppercase tracking-wider">
            2. Button System (Primary #A855F7, Secondary 1px #343940, Ghost)
          </h2>
          <div className="p-5 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg flex items-center gap-4 flex-wrap">
            <Button variant="primary" icon={Satellite}>Primary Action</Button>
            <Button variant="secondary" icon={Compass}>Secondary Action</Button>
            <Button variant="ghost" icon={Info}>Ghost Action</Button>
            <Button variant="synthesize" icon={Sparkles}>Synthesize Dossier</Button>
            <Button variant="danger">Danger Action</Button>
            <Button variant="primary" loading={true}>Processing...</Button>
            <IconButton icon={Radio} active={true} tooltip="Active Sensor" />
          </div>
        </section>

        {/* ── 3. BADGES & EVIDENCE CLASSIFICATIONS ───────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-[var(--og-text-primary)] uppercase tracking-wider">
            3. Evidence Badges & Controlled Vocabulary
          </h2>
          <div className="p-5 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg flex items-center gap-3 flex-wrap">
            <EvidenceBadge type="OBSERVED" label="OBSERVED (SAR)" />
            <EvidenceBadge type="MODELLED" label="MODELLED (DRIFT)" />
            <EvidenceBadge type="MODELLED_CORRELATION" label="MODELLED CORRELATION (AIS)" />
            <EvidenceBadge type="DEMONSTRATION" label="DEMONSTRATION" />
            <EvidenceBadge type="SYNTHESIS" label="SYNTHESIS (DOSSIER)" />
            <EvidenceBadge type="NOT_ESTABLISHED" label="NOT ESTABLISHED" />
            <SourceBadge mode="REAL_CDSE" provenanceState="REAL_CDSE_SAR_PIXELS_VERIFIED" />
            <SourceBadge mode="DEMO" />
            <ModelBadge modelId="unet-dual-pol-sar-v2" onClick={() => setModelDrawerOpen(true)} />
            <NetworkStatus />
          </div>
        </section>

        {/* ── 4. TITLEBAND KPIS & TABULAR NUMERICS ────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-[var(--og-text-primary)] uppercase tracking-wider">
            4. Metric Strip & KPIs
          </h2>
          <div className="p-5 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg">
            <MetricStrip
              metrics={[
                { label: 'Slick Area', value: '2.3', unit: 'km²', provenance: 'OBSERVED' },
                { label: 'Detection Confidence', value: '92', unit: '%', provenance: 'MODELLED' },
                { label: 'Drift Displacement', value: '4.2', unit: 'km NW', provenance: 'MODELLED' },
                { label: 'Modelled Origin', value: '18.91°N 72.79°E', unit: '±1.2 km', provenance: 'HINDCAST' },
              ]}
            />
          </div>
        </section>

        {/* ── 5. SKELETON LOADERS ────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-[var(--og-text-primary)] uppercase tracking-wider">
            5. Shimmer Skeleton Loading Suite
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SkeletonCard />
            <SkeletonChart height="140px" />
            <SkeletonTable rows={3} cols={3} />
          </div>
        </section>

        {/* ── 6. ERROR & EMPTY STATES ────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-[var(--og-text-primary)] uppercase tracking-wider">
            6. Error & Empty States
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ErrorState
              title="Copernicus STAC Query Failed"
              message="The remote ESA catalogue service timed out during token validation."
              technicalDetails={{ httpStatus: 504, gateway: 'cdse.copernicus.eu' }}
              onRetry={() => alert('Retrying...')}
            />
            <MediaErrorState type="SAR" onRetry={() => alert('Retrying SAR fetch...')} />
          </div>
        </section>

        {/* ── 7. DOWNLOAD & JOB PIPELINE PROGRESS ─────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-[var(--og-text-primary)] uppercase tracking-wider">
            7. Truthful Telemetry & Pipeline Progress
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DownloadProgress
              state="DOWNLOADING"
              downloadedBytes={673185792}
              totalBytes={997255168}
              speed={8808038}
              etaSeconds={37}
              productName="S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG"
            />
            <JobProgress
              jobId="3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79"
              currentStageId="AI_INFERENCE"
              elapsedSeconds={42}
            />
          </div>
        </section>

        {/* ── 8. DRAWERS & MODALS ────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-sm font-mono font-medium text-[var(--og-text-primary)] uppercase tracking-wider">
            8. Forensic Drawers & Modals
          </h2>
          <div className="p-5 bg-[var(--og-surface)] border border-[var(--og-border)] rounded-lg flex items-center gap-4 flex-wrap">
            <Button variant="secondary" onClick={() => setModelDrawerOpen(true)}>
              Open Model Intelligence Drawer
            </Button>
            <Button variant="secondary" onClick={() => setVesselDrawerOpen(true)}>
              Open Candidate Vessel Drawer
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open Generic Modal
            </Button>
          </div>
        </section>

        {/* Model Drawer */}
        <ModelDrawer isOpen={modelDrawerOpen} onClose={() => setModelDrawerOpen(false)} />

        {/* Vessel Drawer */}
        <VesselDrawer
          isOpen={vesselDrawerOpen}
          onClose={() => setVesselDrawerOpen(false)}
          vessel={{
            name: 'MV Kandla Star',
            mmsi: '419001234',
            heading: 285,
            speed: 12.4,
            correlation: 94,
          }}
        />

        {/* Modal Demo */}
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Generic Tactical Maritime Modal"
          subtitle="Forensic Inspection Dialog"
        >
          <p className="text-xs text-[var(--og-text-secondary)] leading-relaxed">
            Standard dialog container with focus trap, neutral dark background, 8px radius, and escape key listener.
          </p>
        </Modal>
      </div>
    </div>
  );
}

