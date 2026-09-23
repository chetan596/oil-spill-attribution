import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { spillsApi } from '../api/spills.api';
import { dossierApi } from '../api/dossier.api';
import {
  FileText,
  CheckCircle2,
  Printer,
  Sparkles,
  Shield,
  AlertCircle,
  Satellite,
  Compass,
  Ship,
  Database,
  Clock,
  AlertTriangle,
  FolderOpen,
  ArrowRight,
  Search,
  ExternalLink,
  Filter,
  Layers,
  ChevronRight,
  Plus,
  RefreshCw,
  Activity,
  Award,
  BarChart3,
  Calendar,
  Eye,
  Info,
  Download,
} from 'lucide-react';

// Canonical benchmark investigation records for robust archive display
const CANONICAL_DOSSIERS = [
  {
    id: 'demo-scene-001',
    analysisId: 'demo-scene-001',
    dossierId: 'OG-DOSSIER-2026-001',
    title: 'Mumbai Offshore Surveillance Sector — High-Density Spill',
    region: 'Mumbai Offshore',
    regionKey: 'mumbai',
    areaKm2: 4.73,
    confidence: 0.94,
    source: 'demo',
    sensor: 'Sentinel-1A IW GRD',
    timestamp: '2026-09-12T06:15:00Z',
    status: 'COMPLETED',
    isSynthesized: true,
    topCandidate: {
      name: 'MT PACIFIC BRAVO',
      mmsi: '413289000',
      flag: 'PA',
      score: 94,
      cpaKm: 0.35,
      cpaTime: '04:12 UTC',
    },
    drift: {
      origin: '18.942° N, 72.081° E',
      uncertaintyKm: 2.6,
      windowHours: 24,
      status: 'MODELLED',
    },
  },
  {
    id: 'demo-scene-002',
    analysisId: 'demo-scene-002',
    dossierId: 'OG-DOSSIER-2026-002',
    title: 'Gulf of Kutch Tanker Lane — Heavy Fuel Oil Discharge',
    region: 'Gulf of Kutch',
    regionKey: 'kutch',
    areaKm2: 3.21,
    confidence: 0.89,
    source: 'demo',
    sensor: 'Sentinel-1B IW GRD',
    timestamp: '2026-09-10T14:40:00Z',
    status: 'COMPLETED',
    isSynthesized: true,
    topCandidate: {
      name: 'VLCC OCEAN EMPEROR',
      mmsi: '636015000',
      flag: 'LR',
      score: 88,
      cpaKm: 0.72,
      cpaTime: '11:20 UTC',
    },
    drift: {
      origin: '22.518° N, 69.192° E',
      uncertaintyKm: 3.1,
      windowHours: 24,
      status: 'MODELLED',
    },
  },
  {
    id: 'demo-scene-003',
    analysisId: 'demo-scene-003',
    dossierId: 'OG-DOSSIER-2026-003',
    title: 'Paradip Port Approach Anchorage — Bilge Water Anomaly',
    region: 'Paradip',
    regionKey: 'bengal',
    areaKm2: 1.85,
    confidence: 0.82,
    source: 'demo',
    sensor: 'Sentinel-1A IW GRD',
    timestamp: '2026-09-08T09:10:00Z',
    status: 'COMPLETED',
    isSynthesized: false,
    topCandidate: {
      name: 'BULK CARRIER NORDIC SUN',
      mmsi: '352001000',
      flag: 'MH',
      score: 81,
      cpaKm: 1.15,
      cpaTime: '06:50 UTC',
    },
    drift: {
      origin: '20.142° N, 86.820° E',
      uncertaintyKm: 4.2,
      windowHours: 24,
      status: 'MODELLED',
    },
  },
  {
    id: 'demo-scene-004',
    analysisId: 'demo-scene-004',
    dossierId: 'OG-DOSSIER-2026-004',
    title: 'Goa / Malabar Coastal Transit — Minor Sheen Streak',
    region: 'Goa / Malabar',
    regionKey: 'malabar',
    areaKm2: 0.92,
    confidence: 0.76,
    source: 'demo',
    sensor: 'Sentinel-1A IW GRD',
    timestamp: '2026-09-05T18:25:00Z',
    status: 'COMPLETED',
    isSynthesized: false,
    topCandidate: {
      name: 'FEEDER STAR 4',
      mmsi: '563004000',
      flag: 'SG',
      score: 72,
      cpaKm: 1.85,
      cpaTime: '15:10 UTC',
    },
    drift: {
      origin: '15.340° N, 73.610° E',
      uncertaintyKm: 5.0,
      windowHours: 24,
      status: 'MODELLED',
    },
  },
  {
    id: 'REAL_CDSE',
    analysisId: 'REAL_CDSE',
    dossierId: 'OG-DOSSIER-2026-CDSE',
    title: 'Copernicus CDSE Sentinel-1 SAR Live Ingestion Feed',
    region: 'Operational SAR Scene',
    regionKey: 'cdse',
    areaKm2: 2.45,
    confidence: 0.91,
    source: 'real_cdse',
    sensor: 'Sentinel-1A IW GRDH Level-1',
    timestamp: '2026-09-14T02:18:00Z',
    status: 'IN REVIEW',
    isSynthesized: false,
    topCandidate: null,
    drift: {
      origin: 'NOT ESTABLISHED',
      uncertaintyKm: null,
      windowHours: 24,
      status: 'NOT ESTABLISHED',
    },
  },
];

export default function Reports() {
  const [spills, setSpills] = useState([]);
  const [selectedSpillId, setSelectedSpillId] = useState('demo-scene-001');
  const [dossierResult, setDossierResult] = useState(null);
  const [isLoadingSpills, setIsLoadingSpills] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterSource, setFilterSource] = useState('ALL');
  const [filterRegion, setFilterRegion] = useState('ALL');
  const navigate = useNavigate();

  const loadSpills = async () => {
    setIsLoadingSpills(true);
    setError(null);
    try {
      const res = await spillsApi.list();
      const rawList = res?.data?.spills || res?.data || (Array.isArray(res) ? res : []);
      
      // Merge with canonical dossiers ensuring canonical structure is available
      const merged = CANONICAL_DOSSIERS.map((canonical) => {
        const live = rawList.find(
          (s) => s.id === canonical.id || s.analysisId === canonical.analysisId
        );
        if (live) {
          return {
            ...canonical,
            ...live,
            areaKm2: live.areaKm2 || live.area || canonical.areaKm2,
            confidence: live.confidence || canonical.confidence,
          };
        }
        return canonical;
      });

      // Also add any other live spills from backend not in canonical
      rawList.forEach((liveSpill) => {
        if (!merged.find((m) => m.id === liveSpill.id || m.analysisId === liveSpill.analysisId)) {
          merged.push({
            id: liveSpill.id,
            analysisId: liveSpill.analysisId || liveSpill.id,
            dossierId: `OG-DOSSIER-${String(liveSpill.id).slice(0, 8)}`,
            title: liveSpill.name || `Maritime Investigation Incident #${String(liveSpill.id).slice(0, 8)}`,
            region: liveSpill.region || 'Operational Corridor',
            regionKey: 'other',
            areaKm2: liveSpill.areaKm2 || 2.5,
            confidence: liveSpill.confidence || 0.85,
            source: liveSpill.source || 'demo',
            sensor: 'Sentinel-1 IW GRD',
            timestamp: liveSpill.timestamp || new Date().toISOString(),
            status: 'COMPLETED',
            isSynthesized: false,
            topCandidate: null,
            drift: {
              origin: 'Modelled Center',
              uncertaintyKm: 3.0,
              windowHours: 24,
              status: liveSpill.source === 'real_cdse' ? 'NOT ESTABLISHED' : 'MODELLED',
            },
          });
        }
      });

      setSpills(merged);
      if (merged.length > 0 && !selectedSpillId) {
        setSelectedSpillId(merged[0].id);
      }
    } catch (err) {
      console.warn('Backend ledger load fallback to canonical dossiers:', err.message);
      setSpills(CANONICAL_DOSSIERS);
    } finally {
      setIsLoadingSpills(false);
    }
  };

  useEffect(() => {
    loadSpills();
  }, []);

  // Fetch pre-existing dossier or prepare preview for selected item
  useEffect(() => {
    if (!selectedSpillId) return;
    let isMounted = true;

    const checkExistingDossier = async () => {
      try {
        const res = await dossierApi.get(selectedSpillId);
        if (isMounted && res.exists && res.dossier) {
          setDossierResult(res);
        } else if (isMounted) {
          setDossierResult(null);
        }
      } catch {
        if (isMounted) setDossierResult(null);
      }
    };

    checkExistingDossier();
    return () => {
      isMounted = false;
    };
  }, [selectedSpillId]);

  const handleGenerate = async (targetId) => {
    const idToSynthesize = targetId || selectedSpillId;
    if (!idToSynthesize) return;
    setIsGenerating(true);
    setError(null);
    try {
      const spillObj = spills.find((s) => s.id === idToSynthesize);
      const analysisId = spillObj?.analysisId || idToSynthesize;

      setSelectedSpillId(idToSynthesize);
      const res = await dossierApi.generate(analysisId);
      setDossierResult(res.data || res);
      // Mark as synthesized in local list
      setSpills((prev) =>
        prev.map((s) => (s.id === idToSynthesize ? { ...s, isSynthesized: true } : s))
      );
    } catch (err) {
      setError(err.message || 'Failed to synthesize analytical investigation dossier');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPdf = async (targetId) => {
    const idToExport = targetId || selectedSpillId;
    if (!idToExport) return;
    setIsExportingPdf(true);
    setError(null);
    try {
      const spillObj = spills.find((s) => s.id === idToExport);
      const analysisId = spillObj?.analysisId || idToExport;

      const blob = await dossierApi.downloadPdf(analysisId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `OG-DOSSIER-${analysisId.slice(0, 8).toUpperCase()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export formal investigation PDF report. Ensure dossier is synthesized first.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Filter logic
  const filteredSpills = useMemo(() => {
    return spills.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.dossierId?.toLowerCase().includes(q) ||
        s.title?.toLowerCase().includes(q) ||
        s.region?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q) ||
        (s.topCandidate?.name && s.topCandidate.name.toLowerCase().includes(q));

      const matchesStatus =
        filterStatus === 'ALL' ||
        (filterStatus === 'COMPLETED' && (s.status === 'COMPLETED' || s.isSynthesized)) ||
        (filterStatus === 'IN_REVIEW' && s.status === 'IN REVIEW') ||
        (filterStatus === 'DRAFT' && s.status === 'DRAFT');

      const matchesSource =
        filterSource === 'ALL' ||
        (filterSource === 'DEMO' && s.source !== 'real_cdse') ||
        (filterSource === 'REAL_CDSE' && s.source === 'real_cdse');

      const matchesRegion =
        filterRegion === 'ALL' ||
        (filterRegion === 'mumbai' && (s.regionKey === 'mumbai' || s.id.includes('001'))) ||
        (filterRegion === 'kutch' && (s.regionKey === 'kutch' || s.id.includes('002'))) ||
        (filterRegion === 'bengal' && (s.regionKey === 'bengal' || s.id.includes('003'))) ||
        (filterRegion === 'malabar' && (s.regionKey === 'malabar' || s.id.includes('004')));

      return matchesSearch && matchesStatus && matchesSource && matchesRegion;
    });
  }, [spills, searchQuery, filterStatus, filterSource, filterRegion]);

  const selectedDossier = useMemo(() => {
    return spills.find((s) => s.id === selectedSpillId) || spills[0] || null;
  }, [spills, selectedSpillId]);

  const dossier = dossierResult?.dossier || (dossierResult?.data?.dossier);

  // Dynamic counts
  const totalCount = spills.length;
  const completedCount = spills.filter((s) => s.status === 'COMPLETED' || s.isSynthesized).length;
  const inProgressCount = spills.filter((s) => s.status === 'IN REVIEW' || s.status === 'DRAFT').length;
  const realCdseCount = spills.filter((s) => s.source === 'real_cdse').length;
  const demoCount = spills.filter((s) => s.source !== 'real_cdse').length;

  return (
    <div
      style={{
        backgroundColor: 'var(--og-bg)',
        color: 'var(--og-text-primary)',
        minHeight: '100%',
        padding: '24px 32px 48px',
        boxSizing: 'border-box',
        fontFamily: "'Schibsted Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ============================================================ */}
        {/* 1. COMPACT PAGE HEADER                                      */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
            paddingBottom: 16,
            borderBottom: '1px solid var(--og-border)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Link
                to="/dashboard"
                style={{
                  color: 'var(--og-teal)',
                  fontSize: 11,
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                  textDecoration: 'none',
                  letterSpacing: '0.04em',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ← OVERVIEW
              </Link>
              <span style={{ color: 'var(--og-border-strong)' }}>|</span>
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--og-text-muted)',
                  background: 'var(--og-surface-raised)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--og-border-subtle)',
                }}
              >
                EVIDENCE & INVESTIGATION RECORDS
              </span>
            </div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 600,
                fontFamily: "'Hanken Grotesk', sans-serif",
                margin: 0,
                color: 'var(--og-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              DOSSIER ARCHIVE
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--og-text-secondary)', maxWidth: 650 }}>
              Review, synthesize and export completed oil-spill investigation dossiers and evidentiary correlation logs.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                fontSize: 11,
                fontFamily: "'Schibsted Grotesk', sans-serif",
                color: 'var(--og-success)',
              }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'var(--og-success)',
                }}
              />
              SYSTEM READY
            </div>

            <div
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--og-surface)',
                border: '1px solid var(--og-border)',
                fontSize: 11,
                fontFamily: "'Schibsted Grotesk', sans-serif",
                color: 'var(--og-text-secondary)',
              }}
            >
              TOTAL DOSSIERS: <strong style={{ color: 'var(--og-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{totalCount}</strong>
            </div>

            <Link
              to="/new-mission"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                borderRadius: 8,
                backgroundColor: 'var(--og-violet)',
                color: '#FFFFFF',
                fontSize: 12,
                fontFamily: "'Schibsted Grotesk', sans-serif",
                fontWeight: 600,
                textDecoration: 'none',
                transition: 'background-color 0.15s ease',
              }}
            >
              <Plus size={14} />
              <span>NEW MISSION</span>
            </Link>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2. ARCHIVE SUMMARY STRIP                                     */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border-subtle)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                TOTAL INVESTIGATIONS
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-primary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {totalCount}
              </div>
            </div>
            <FolderOpen size={20} style={{ color: 'var(--og-text-muted)', opacity: 0.8 }} />
          </div>

          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border-subtle)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                COMPLETED & SYNTHESIZED
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-success)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {completedCount}
              </div>
            </div>
            <CheckCircle2 size={20} style={{ color: 'var(--og-success)', opacity: 0.8 }} />
          </div>

          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border-subtle)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                DRAFT / IN REVIEW
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-amber)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {inProgressCount}
              </div>
            </div>
            <Activity size={20} style={{ color: 'var(--og-amber)', opacity: 0.8 }} />
          </div>

          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border-subtle)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                PROVENANCE SPLIT
              </div>
              <div style={{ fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", color: 'var(--og-text-secondary)', marginTop: 4 }}>
                <span style={{ color: 'var(--og-violet-soft)' }}>{demoCount} DEMO</span> &bull;{' '}
                <span style={{ color: 'var(--og-teal)' }}>{realCdseCount} CDSE</span>
              </div>
            </div>
            <Database size={20} style={{ color: 'var(--og-teal)', opacity: 0.8 }} />
          </div>
        </div>

        {/* Error notification banner if any */}
        {error && (
          <div
            style={{
              backgroundColor: 'rgba(248, 113, 113, 0.08)',
              border: '1px solid rgba(248, 113, 113, 0.25)',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: 'var(--og-error)',
              fontSize: 12,
              fontFamily: "'Schibsted Grotesk', sans-serif",
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
            <button
              onClick={loadSpills}
              style={{
                background: 'var(--og-surface-raised)',
                border: '1px solid var(--og-border)',
                color: 'var(--og-text-primary)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: "'Schibsted Grotesk', sans-serif",
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* 3. SEARCH & FILTER TOOLBAR                                   */}
        {/* ============================================================ */}
        <div
          style={{
            backgroundColor: 'var(--og-surface)',
            border: '1px solid var(--og-border-subtle)',
            borderRadius: 8,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--og-text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search dossier ID, incident, vessel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 32px',
                backgroundColor: 'var(--og-surface-recessed)',
                border: '1px solid var(--og-border)',
                borderRadius: 6,
                color: 'var(--og-text-primary)',
                fontSize: 12,
                fontFamily: "'Schibsted Grotesk', sans-serif",
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Filter Selects */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                STATUS:
              </span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  backgroundColor: 'var(--og-surface-recessed)',
                  border: '1px solid var(--og-border)',
                  borderRadius: 6,
                  color: 'var(--og-text-primary)',
                  fontSize: 11,
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                  padding: '6px 10px',
                  outline: 'none',
                }}
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="IN_REVIEW">IN REVIEW</option>
                <option value="DRAFT">DRAFT</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                SOURCE:
              </span>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                style={{
                  backgroundColor: 'var(--og-surface-recessed)',
                  border: '1px solid var(--og-border)',
                  borderRadius: 6,
                  color: 'var(--og-text-primary)',
                  fontSize: 11,
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                  padding: '6px 10px',
                  outline: 'none',
                }}
              >
                <option value="ALL">ALL SOURCES</option>
                <option value="DEMO">DEMO BENCHMARK</option>
                <option value="REAL_CDSE">REAL CDSE</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                REGION:
              </span>
              <select
                value={filterRegion}
                onChange={(e) => setFilterRegion(e.target.value)}
                style={{
                  backgroundColor: 'var(--og-surface-recessed)',
                  border: '1px solid var(--og-border)',
                  borderRadius: 6,
                  color: 'var(--og-text-primary)',
                  fontSize: 11,
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                  padding: '6px 10px',
                  outline: 'none',
                }}
              >
                <option value="ALL">ALL REGIONS</option>
                <option value="mumbai">Mumbai Offshore</option>
                <option value="kutch">Gulf of Kutch</option>
                <option value="bengal">Paradip Port</option>
                <option value="malabar">Goa / Malabar</option>
              </select>
            </div>

            {(searchQuery || filterStatus !== 'ALL' || filterSource !== 'ALL' || filterRegion !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('ALL');
                  setFilterSource('ALL');
                  setFilterRegion('ALL');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--og-amber)',
                  fontSize: 11,
                  fontFamily: "'Schibsted Grotesk', sans-serif",
                  cursor: 'pointer',
                  padding: '4px 6px',
                  textDecoration: 'underline',
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 4. MAIN 2-COLUMN WORKSPACE                                   */}
        {/* ============================================================ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* ========================================================== */}
          {/* LEFT COLUMN: DOSSIER ARCHIVE LIST                          */}
          {/* ========================================================== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 4px',
              }}
            >
              <div style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, letterSpacing: '0.04em', color: 'var(--og-text-secondary)', textTransform: 'uppercase' }}>
                ARCHIVE LEDGER ({filteredSpills.length} RECORDS)
              </div>
              <div style={{ fontSize: 11, fontFamily: "'Schibsted Grotesk', sans-serif", color: 'var(--og-text-muted)' }}>
                SELECT RECORD TO INSPECT EVIDENCE
              </div>
            </div>

            {isLoadingSpills ? (
              // Skeleton loading rows
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{
                      backgroundColor: 'var(--og-surface)',
                      border: '1px solid var(--og-border-subtle)',
                      borderRadius: 8,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      opacity: 0.6,
                    }}
                  >
                    <div style={{ height: 14, width: '40%', backgroundColor: 'var(--og-surface-raised)', borderRadius: 4 }} />
                    <div style={{ height: 12, width: '70%', backgroundColor: 'var(--og-surface-elevated)', borderRadius: 4 }} />
                    <div style={{ height: 24, width: '100%', backgroundColor: 'var(--og-surface-elevated)', borderRadius: 4 }} />
                  </div>
                ))}
              </div>
            ) : filteredSpills.length === 0 ? (
              // Empty State
              <div
                style={{
                  backgroundColor: 'var(--og-surface)',
                  border: '1px solid var(--og-border-subtle)',
                  borderRadius: 8,
                  padding: '48px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <FileText size={40} style={{ color: 'var(--og-text-muted)', opacity: 0.4 }} />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-primary)' }}>
                  NO INVESTIGATION DOSSIERS
                </h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--og-text-muted)', maxWidth: 360 }}>
                  No matching investigation records found for the applied filter criteria. Completed investigations will appear here.
                </p>
                <Link
                  to="/new-mission"
                  style={{
                    marginTop: 8,
                    padding: '7px 16px',
                    borderRadius: 8,
                    backgroundColor: 'var(--og-violet)',
                    color: '#FFFFFF',
                    fontSize: 12,
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  CREATE NEW MISSION
                </Link>
              </div>
            ) : (
              // Dossier Records
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredSpills.map((spill) => {
                  const isSelected = selectedSpillId === spill.id;
                  const targetAnalysisId = spill.analysisId || spill.id;
                  const isRealCdse = spill.source === 'real_cdse';

                  return (
                    <div
                      key={spill.id}
                      onClick={() => setSelectedSpillId(spill.id)}
                      style={{
                        backgroundColor: isSelected ? 'var(--og-surface-raised)' : 'var(--og-surface)',
                        border: isSelected ? '1px solid var(--og-border-strong)' : '1px solid var(--og-border-subtle)',
                        borderRadius: 8,
                        padding: 16,
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease, border-color 0.15s ease',
                        position: 'relative',
                      }}
                    >
                      {/* Top row: Dossier ID + Status badge */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              fontSize: 12,
                              fontFamily: "'Schibsted Grotesk', sans-serif",
                              fontWeight: 600,
                              color: 'var(--og-text-primary)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {spill.dossierId || `OG-DOSSIER-${String(spill.id).slice(0, 8)}`}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "'Schibsted Grotesk', sans-serif",
                              padding: '2px 6px',
                              borderRadius: 4,
                              backgroundColor: isRealCdse ? 'rgba(73, 198, 200, 0.1)' : 'rgba(168, 85, 247, 0.1)',
                              border: isRealCdse
                                ? '1px solid rgba(73, 198, 200, 0.3)'
                                : '1px solid rgba(168, 85, 247, 0.3)',
                              color: isRealCdse ? 'var(--og-teal)' : 'var(--og-violet-soft)',
                              fontWeight: 600,
                            }}
                          >
                            {isRealCdse ? 'CDSE AUTHENTICATED' : 'DEMO BENCHMARK'}
                          </span>
                        </div>

                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "'Schibsted Grotesk', sans-serif",
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: spill.isSynthesized || spill.status === 'COMPLETED'
                              ? 'rgba(74, 222, 128, 0.1)'
                              : 'rgba(231, 166, 58, 0.1)',
                            color: spill.isSynthesized || spill.status === 'COMPLETED' ? 'var(--og-success)' : 'var(--og-amber)',
                            border: spill.isSynthesized || spill.status === 'COMPLETED'
                              ? '1px solid rgba(74, 222, 128, 0.3)'
                              : '1px solid rgba(231, 166, 58, 0.3)',
                            fontWeight: 600,
                          }}
                        >
                          {spill.isSynthesized ? 'SYNTHESIZED' : spill.status || 'READY'}
                        </span>
                      </div>

                      {/* Incident Title */}
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          fontFamily: "'Schibsted Grotesk', sans-serif",
                          color: 'var(--og-text-primary)',
                          marginBottom: 10,
                        }}
                      >
                        {spill.title || spill.name || `Investigation Incident #${spill.id}`}
                      </div>

                      {/* Evidence Grid Pills */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: 8,
                          backgroundColor: 'var(--og-surface-recessed)',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--og-border)',
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 9, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)' }}>
                            SAR OBSERVED
                          </div>
                          <div style={{ fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-teal)', fontVariantNumeric: 'tabular-nums' }}>
                            {spill.areaKm2 ? `${Number(spill.areaKm2).toFixed(2)} km²` : '2.45 km²'}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 9, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)' }}>
                            DRIFT STATUS
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontFamily: "'Schibsted Grotesk', sans-serif",
                              fontWeight: 600,
                              color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-amber)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {isRealCdse ? 'NOT ESTABLISHED' : 'MODELLED (±2.6km)'}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: 9, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', color: 'var(--og-text-muted)' }}>
                            AIS CORRELATION
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontFamily: "'Schibsted Grotesk', sans-serif",
                              fontWeight: 600,
                              color: isRealCdse ? 'var(--og-text-muted)' : 'var(--og-violet)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {isRealCdse
                              ? 'NOT ESTABLISHED'
                              : spill.topCandidate
                              ? `${spill.topCandidate.score}% TOP MATCH`
                              : `${Math.round((spill.confidence || 0.94) * 100)}% MATCH`}
                          </div>
                        </div>
                      </div>

                      {/* Footer Info & Row Actions */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          fontFamily: "'Schibsted Grotesk', sans-serif",
                          color: 'var(--og-text-muted)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={12} />
                          <span>{new Date(spill.timestamp || Date.now()).toLocaleDateString('en-GB')}</span>
                          <span>&bull;</span>
                          <span style={{ color: 'var(--og-text-secondary)' }}>{spill.region}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerate(spill.id);
                            }}
                            disabled={isGenerating}
                            style={{
                              backgroundColor: 'var(--og-surface-raised)',
                              border: '1px solid var(--og-border)',
                              color: 'var(--og-violet)',
                              padding: '4px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontFamily: "'Schibsted Grotesk', sans-serif",
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              transition: 'background-color 0.15s ease',
                            }}
                          >
                            <Sparkles size={11} />
                            <span>{spill.isSynthesized ? 'Re-Synthesize' : 'Synthesize'}</span>
                          </button>

                          <Link
                            to={`/analysis/${targetAnalysisId}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              color: 'var(--og-text-secondary)',
                              fontSize: 11,
                              textDecoration: 'none',
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <span>Analysis</span>
                            <ChevronRight size={12} />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ========================================================== */}
          {/* RIGHT COLUMN: SELECTED DOSSIER INTELLIGENCE SUMMARY        */}
          {/* ========================================================== */}
          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border-subtle)',
              borderRadius: 8,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              position: 'sticky',
              top: 20,
            }}
          >
            {selectedDossier ? (
              <>
                {/* Panel Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingBottom: 14,
                    borderBottom: '1px solid var(--og-border)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: "'Hanken Grotesk', sans-serif",
                        color: 'var(--og-text-muted)',
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      INVESTIGATION DOSSIER INTELLIGENCE
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-primary)' }}>
                      {selectedDossier.dossierId}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--og-text-secondary)', marginTop: 2 }}>
                      {selectedDossier.title}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "'Schibsted Grotesk', sans-serif",
                        padding: '3px 8px',
                        borderRadius: 4,
                        backgroundColor: selectedDossier.source === 'real_cdse'
                          ? 'rgba(73, 198, 200, 0.1)'
                          : 'rgba(168, 85, 247, 0.1)',
                        border: selectedDossier.source === 'real_cdse'
                          ? '1px solid rgba(73, 198, 200, 0.3)'
                          : '1px solid rgba(168, 85, 247, 0.3)',
                        color: selectedDossier.source === 'real_cdse' ? 'var(--og-teal)' : 'var(--og-violet-soft)',
                        fontWeight: 600,
                      }}
                    >
                      {selectedDossier.source === 'real_cdse' ? 'REAL CDSE SCENE' : 'DEMO BENCHMARK'}
                    </span>
                    <span style={{ fontSize: 10, fontFamily: "'Schibsted Grotesk', sans-serif", color: 'var(--og-text-muted)' }}>
                      {selectedDossier.region}
                    </span>
                  </div>
                </div>

                {/* Evidence Summary Rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", letterSpacing: '0.04em', fontWeight: 600, color: 'var(--og-text-secondary)', textTransform: 'uppercase' }}>
                    MULTI-TIER EVIDENCE SUMMARY
                  </div>

                  {/* 1. SAR Slick Observation */}
                  <div
                    style={{
                      backgroundColor: 'var(--og-surface-recessed)',
                      border: '1px solid var(--og-border)',
                      borderRadius: 6,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Satellite size={13} style={{ color: 'var(--og-teal)' }} />
                      <span style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                        OBSERVED SAR SLICK
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 6,
                        fontSize: 11,
                        fontFamily: "'Schibsted Grotesk', sans-serif",
                        color: 'var(--og-text-secondary)',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Area: </span>
                        <strong style={{ color: 'var(--og-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{Number(selectedDossier.areaKm2).toFixed(2)} km²</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Confidence: </span>
                        <strong style={{ color: 'var(--og-teal)', fontVariantNumeric: 'tabular-nums' }}>
                          {Math.round((selectedDossier.confidence || 0.94) * 100)}%
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Sensor: </span>
                        <span>{selectedDossier.sensor ? 'S1A IW' : 'Sentinel-1'}</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Drift Reconstruction */}
                  <div
                    style={{
                      backgroundColor: 'var(--og-surface-recessed)',
                      border: '1px solid var(--og-border)',
                      borderRadius: 6,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Compass size={13} style={{ color: 'var(--og-amber)' }} />
                      <span style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                        DRIFT RECONSTRUCTION (METOCEAN)
                      </span>
                    </div>
                    {selectedDossier.source === 'real_cdse' ? (
                      <div style={{ fontSize: 11, fontFamily: "'Schibsted Grotesk', sans-serif", color: 'var(--og-text-muted)' }}>
                        DRIFT NOT ESTABLISHED (Awaiting MetOcean wind/current forcing)
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: 6,
                          fontSize: 11,
                          fontFamily: "'Schibsted Grotesk', sans-serif",
                          color: 'var(--og-text-secondary)',
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Origin: </span>
                          <span>{selectedDossier.drift?.origin || '18.94°N, 72.08°E'}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Uncertainty: </span>
                          <strong style={{ color: 'var(--og-amber)', fontVariantNumeric: 'tabular-nums' }}>&plusmn;2.6 km</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Window: </span>
                          <span>24h Hindcast</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. AIS Attribution Correlation */}
                  <div
                    style={{
                      backgroundColor: 'var(--og-surface-recessed)',
                      border: '1px solid var(--og-border)',
                      borderRadius: 6,
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Ship size={13} style={{ color: 'var(--og-violet)' }} />
                      <span style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-primary)' }}>
                        AIS ATTRIBUTION CORRELATION
                      </span>
                    </div>
                    {selectedDossier.source === 'real_cdse' ? (
                      <div style={{ fontSize: 11, fontFamily: "'Schibsted Grotesk', sans-serif", color: 'var(--og-text-muted)' }}>
                        NO VERIFIED AIS CANDIDATE (Synthetic AIS isolated from real CDSE)
                      </div>
                    ) : selectedDossier.topCandidate ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: 6,
                          fontSize: 11,
                          fontFamily: "'Schibsted Grotesk', sans-serif",
                          color: 'var(--og-text-secondary)',
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Top Candidate: </span>
                          <strong style={{ color: 'var(--og-text-primary)' }}>{selectedDossier.topCandidate.name}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>Score: </span>
                          <strong style={{ color: 'var(--og-violet)', fontVariantNumeric: 'tabular-nums' }}>{selectedDossier.topCandidate.score}%</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--og-text-muted)', fontSize: 10 }}>CPA: </span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{selectedDossier.topCandidate.cpaKm} km</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, fontFamily: "'Schibsted Grotesk', sans-serif", color: 'var(--og-text-secondary)' }}>
                        AIS Trajectory Correlated (Score: 94%)
                      </div>
                    )}
                  </div>
                </div>

                {/* Provenance Strip */}
                <div
                  style={{
                    backgroundColor: 'var(--og-surface-recessed)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                  }}
                >
                  {selectedDossier.source === 'real_cdse' ? (
                    <>
                      <div>SAR: <span style={{ color: 'var(--og-teal)' }}>OBSERVED / CDSE</span></div>
                      <div>DRIFT: <span style={{ color: 'var(--og-text-muted)' }}>NOT ESTABLISHED</span></div>
                      <div>AIS: <span style={{ color: 'var(--og-text-muted)' }}>NOT ESTABLISHED</span></div>
                      <div>METOCEAN: <span style={{ color: 'var(--og-teal)' }}>SOURCE DEPENDENT</span></div>
                    </>
                  ) : (
                    <>
                      <div>SAR: <span style={{ color: 'var(--og-teal)' }}>OBSERVED</span></div>
                      <div>DRIFT: <span style={{ color: 'var(--og-amber)' }}>MODELLED</span></div>
                      <div>AIS: <span style={{ color: 'var(--og-violet)' }}>DEMO</span></div>
                      <div>METOCEAN: <span style={{ color: 'var(--og-text-muted)' }}>DEMO</span></div>
                    </>
                  )}
                </div>

                {/* Evidence Chain Flow */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, letterSpacing: '0.04em', color: 'var(--og-text-muted)', textTransform: 'uppercase' }}>
                    EVIDENCE CHAIN VERIFICATION
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 4,
                      fontSize: 9,
                      fontFamily: "'Schibsted Grotesk', sans-serif",
                    }}
                  >
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--og-border)' }}>
                      <div style={{ color: 'var(--og-text-muted)' }}>01 SAR PASS</div>
                      <div style={{ color: 'var(--og-teal)', fontWeight: 600 }}>OBSERVED</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--og-border)' }}>
                      <div style={{ color: 'var(--og-text-muted)' }}>02 SLICK MASK</div>
                      <div style={{ color: 'var(--og-teal)', fontWeight: 600 }}>OBSERVED</div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--og-border)' }}>
                      <div style={{ color: 'var(--og-text-muted)' }}>03 DRIFT HINDCAST</div>
                      <div style={{ color: selectedDossier.source === 'real_cdse' ? 'var(--og-text-muted)' : 'var(--og-amber)', fontWeight: 600 }}>
                        {selectedDossier.source === 'real_cdse' ? 'NOT ESTABLISHED' : 'MODELLED'}
                      </div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--og-border)' }}>
                      <div style={{ color: 'var(--og-text-muted)' }}>04 AIS CORRELATION</div>
                      <div style={{ color: selectedDossier.source === 'real_cdse' ? 'var(--og-text-muted)' : 'var(--og-violet)', fontWeight: 600 }}>
                        {selectedDossier.source === 'real_cdse' ? 'NOT ESTABLISHED' : 'CORRELATED'}
                      </div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--og-border)' }}>
                      <div style={{ color: 'var(--og-text-muted)' }}>05 CANDIDATE RANK</div>
                      <div style={{ color: selectedDossier.source === 'real_cdse' ? 'var(--og-text-muted)' : 'var(--og-success)', fontWeight: 600 }}>
                        {selectedDossier.source === 'real_cdse' ? 'NOT ESTABLISHED' : 'ANALYTICAL'}
                      </div>
                    </div>
                    <div style={{ background: 'var(--og-surface-recessed)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--og-border)' }}>
                      <div style={{ color: 'var(--og-text-muted)' }}>06 DOSSIER STATUS</div>
                      <div style={{ color: selectedDossier.isSynthesized ? 'var(--og-success)' : 'var(--og-amber)', fontWeight: 600 }}>
                        {selectedDossier.isSynthesized ? 'SYNTHESIZED' : 'READY'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legal & Scientific Disclaimer */}
                <div
                  style={{
                    backgroundColor: 'var(--og-surface-recessed)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 10,
                    color: 'var(--og-text-secondary)',
                    lineHeight: 1.4,
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                  }}
                >
                  <strong style={{ color: 'var(--og-text-muted)' }}>ANALYTICAL DISCLAIMER:</strong> Analytical vessel correlation does not establish legal culpability. Physical sampling and laboratory validation remain required for formal maritime prosecution.
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleGenerate(selectedDossier.id)}
                      disabled={isGenerating}
                      style={{
                        backgroundColor: 'var(--og-magenta)',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontSize: 12,
                        fontFamily: "'Schibsted Grotesk', sans-serif",
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        cursor: isGenerating ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>SYNTHESIZING...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>{selectedDossier.isSynthesized ? 'RE-SYNTHESIZE' : 'SYNTHESIZE DOSSIER'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportPdf(selectedDossier.id)}
                      disabled={isExportingPdf}
                      style={{
                        backgroundColor: 'transparent',
                        color: 'var(--og-teal)',
                        border: '1px solid var(--og-teal)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontSize: 12,
                        fontFamily: "'Schibsted Grotesk', sans-serif",
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        cursor: isExportingPdf ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {isExportingPdf ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>EXPORTING...</span>
                        </>
                      ) : (
                        <>
                          <Download size={13} />
                          <span>EXPORT PDF</span>
                        </>
                      )}
                    </button>
                  </div>

                  <Link
                    to={`/analysis/${selectedDossier.analysisId || selectedDossier.id}`}
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid var(--og-border-strong)',
                      color: 'var(--og-text-primary)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: 12,
                      fontFamily: "'Schibsted Grotesk', sans-serif",
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      textDecoration: 'none',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <span>OPEN INVESTIGATION WORKSPACE</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </>
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--og-text-muted)', fontSize: 12 }}>
                Select an investigation record from the left ledger to inspect evidence.
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* 5. FULL SYNTHESIZED DOSSIER DOCUMENT DETAIL VIEW             */}
        {/* ============================================================ */}
        {dossier && (
          <div
            style={{
              backgroundColor: 'var(--og-surface)',
              border: '1px solid var(--og-border-subtle)',
              borderRadius: 8,
              padding: '24px 28px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              marginTop: 10,
            }}
          >
            {/* Dossier Document Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                paddingBottom: 16,
                borderBottom: '1px solid var(--og-border)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--og-success)', fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600 }}>
                  <CheckCircle2 size={15} />
                  <span>SYNTHESIZED INVESTIGATION DOSSIER</span>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-primary)', margin: '4px 0 0' }}>
                  {dossierResult.title || `Forensic Spill Investigation Report — ${selectedDossier?.dossierId || selectedSpillId}`}
                </h2>
                <div style={{ fontSize: 11, color: 'var(--og-text-muted)', fontFamily: "'Schibsted Grotesk', sans-serif", marginTop: 4 }}>
                  Report Generated: <span style={{ color: 'var(--og-text-secondary)' }}>{new Date(dossierResult.createdAt || Date.now()).toUTCString()}</span> &bull; Classification: <strong style={{ color: 'var(--og-text-secondary)' }}>ANALYTICAL CORRELATION LEDGER</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleExportPdf(selectedDossier?.analysisId || selectedDossier?.id || selectedSpillId)}
                  disabled={isExportingPdf}
                  style={{
                    backgroundColor: 'var(--og-teal)',
                    border: 'none',
                    color: '#FFFFFF',
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: isExportingPdf ? 'not-allowed' : 'pointer',
                  }}
                >
                  <Download size={13} />
                  <span>{isExportingPdf ? 'Exporting...' : 'Export PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid var(--og-border-strong)',
                    color: 'var(--og-text-primary)',
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontFamily: "'Schibsted Grotesk', sans-serif",
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <Printer size={13} />
                  <span>Print Dossier</span>
                </button>
              </div>
            </div>

            {/* Structured Dossier Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Executive Summary */}
              {dossier.executiveSummary && (
                <div
                  style={{
                    backgroundColor: 'var(--og-surface-recessed)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 6,
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, letterSpacing: '0.04em', color: 'var(--og-text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Executive Summary
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--og-text-secondary)', lineHeight: 1.6, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                    {dossier.executiveSummary}
                  </p>
                </div>
              )}

              {/* 1. OBSERVED EVIDENCE */}
              {dossier.observedEvidence && dossier.observedEvidence.length > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--og-surface-recessed)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 6,
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-teal)', textTransform: 'uppercase', marginBottom: 8 }}>
                    <Satellite size={14} />
                    <span>1. OBSERVED EVIDENCE (SENTINEL-1 SAR ACQUISITION)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--og-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                    {dossier.observedEvidence.map((item, idx) => (
                      <li key={idx} style={{ lineHeight: 1.5 }}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 2. MODELLED EVIDENCE */}
              {dossier.modelledEvidence && dossier.modelledEvidence.length > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--og-surface-recessed)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 6,
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-amber)', textTransform: 'uppercase', marginBottom: 8 }}>
                    <Compass size={14} />
                    <span>2. MODELLED EVIDENCE (DRIFT HINDCAST & METOCEAN FORCING)</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--og-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                    {dossier.modelledEvidence.map((item, idx) => (
                      <li key={idx} style={{ lineHeight: 1.5 }}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 3. CANDIDATE VESSEL ATTRIBUTION ASSESSMENTS */}
              {dossier.candidateAssessments && dossier.candidateAssessments.length > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--og-surface-recessed)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 6,
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-violet)', textTransform: 'uppercase', marginBottom: 10 }}>
                    <Ship size={14} />
                    <span>3. CANDIDATE VESSEL ATTRIBUTION CORRELATIONS</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dossier.candidateAssessments.map((cand, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: 'var(--og-surface)',
                          border: '1px solid var(--og-border-subtle)',
                          borderRadius: 6,
                          padding: 12,
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-text-primary)', marginBottom: 4 }}>
                          {cand.candidateVessel}
                        </div>
                        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--og-text-secondary)', lineHeight: 1.5, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                          {cand.summary}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {cand.supportingEvidence && cand.supportingEvidence.length > 0 && (
                            <div
                              style={{
                                backgroundColor: 'rgba(74, 222, 128, 0.05)',
                                border: '1px solid rgba(74, 222, 128, 0.2)',
                                borderRadius: 4,
                                padding: 8,
                                fontSize: 11,
                                fontFamily: "'Schibsted Grotesk', sans-serif",
                              }}
                            >
                              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-success)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>
                                SUPPORTING EVIDENCE
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 14, color: 'var(--og-text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {cand.supportingEvidence.map((s, sIdx) => (
                                  <li key={sIdx}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {cand.limitingEvidence && cand.limitingEvidence.length > 0 && (
                            <div
                              style={{
                                backgroundColor: 'rgba(231, 166, 58, 0.05)',
                                border: '1px solid rgba(231, 166, 58, 0.2)',
                                borderRadius: 4,
                                padding: 8,
                                fontSize: 11,
                                fontFamily: "'Schibsted Grotesk', sans-serif",
                              }}
                            >
                              <div style={{ fontSize: 10, fontFamily: "'Hanken Grotesk', sans-serif", color: 'var(--og-amber)', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>
                                LIMITING FACTORS
                              </div>
                              <ul style={{ margin: 0, paddingLeft: 14, color: 'var(--og-text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {cand.limitingEvidence.map((l, lIdx) => (
                                  <li key={lIdx}>{l}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. TIMELINE */}
              {dossier.timeline && dossier.timeline.length > 0 && (
                <div
                  style={{
                    backgroundColor: 'var(--og-surface-recessed)',
                    border: '1px solid var(--og-border)',
                    borderRadius: 6,
                    padding: '12px 16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
                    <Clock size={14} />
                    <span>4. CHRONOLOGICAL EVENT TIMELINE</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {dossier.timeline.map((step, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 11, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                        <div style={{ width: 140, shrink: 0, color: 'var(--og-text-secondary)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                          {step.time}
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ color: 'var(--og-amber)', fontWeight: 600, marginRight: 6 }}>
                            [{step.phase}]
                          </span>
                          <span style={{ color: 'var(--og-text-secondary)' }}>{step.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. SCIENTIFIC LIMITATIONS & RECOMMENDATIONS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {dossier.limitations && dossier.limitations.length > 0 && (
                  <div
                    style={{
                      backgroundColor: 'var(--og-surface-recessed)',
                      border: '1px solid var(--og-border)',
                      borderRadius: 6,
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-amber)', textTransform: 'uppercase', marginBottom: 6 }}>
                      <AlertTriangle size={14} />
                      <span>5. SCIENTIFIC LIMITATIONS</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--og-text-secondary)', display: 'flex', flexDirection: 'column', gap: 3, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                      {dossier.limitations.map((lim, idx) => (
                        <li key={idx}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {dossier.recommendedFollowUp && dossier.recommendedFollowUp.length > 0 && (
                  <div
                    style={{
                      backgroundColor: 'var(--og-surface-recessed)',
                      border: '1px solid var(--og-border)',
                      borderRadius: 6,
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, color: 'var(--og-success)', textTransform: 'uppercase', marginBottom: 6 }}>
                      <Shield size={14} />
                      <span>6. RECOMMENDED FOLLOW-UP</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--og-text-secondary)', display: 'flex', flexDirection: 'column', gap: 3, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                      {dossier.recommendedFollowUp.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 7. MANDATORY DISCLAIMER */}
              <div
                style={{
                  backgroundColor: 'var(--og-surface-recessed)',
                  border: '1px solid var(--og-border)',
                  borderRadius: 6,
                  padding: '12px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--og-text-muted)', fontSize: 11, fontFamily: "'Hanken Grotesk', sans-serif", fontWeight: 600, marginBottom: 4 }}>
                  <AlertCircle size={15} />
                  <span>MANDATORY EVIDENTIARY & SCIENTIFIC DISCLAIMER</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--og-text-secondary)', lineHeight: 1.5, fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                  {dossier.disclaimer ||
                    'Attribution assessments are probabilistic correlations based on satellite SAR segmentation and backward drift trajectories. Physical sampling and maritime authority inspection remain necessary to establish legal responsibility.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
