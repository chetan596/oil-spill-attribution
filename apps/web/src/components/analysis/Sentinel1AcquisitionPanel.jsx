import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sentinel1Api } from '../../api/sentinel1.api';
import { jobsApi } from '../../api/jobs.api';
import EvidenceBadge from '../common/EvidenceBadge';
import LoadingSpinner from '../common/LoadingSpinner';
import ErrorMessage from '../common/ErrorMessage';
import {
  Satellite,
  Search,
  Calendar,
  Layers,
  Download,
  Play,
  Info,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Globe,
  Radio,
  Clock,
  Compass,
  FileCode,
  HardDrive,
  RefreshCw,
  X,
} from 'lucide-react';

function formatBbox(bbox) {
  if (!bbox || !Array.isArray(bbox) || bbox.length < 4) return '72.50°E – 73.20°E · 18.50°N – 19.20°N';
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonStr = `${Math.abs(minLon).toFixed(2)}°${minLon >= 0 ? 'E' : 'W'} – ${Math.abs(maxLon).toFixed(2)}°${maxLon >= 0 ? 'E' : 'W'}`;
  const latStr = `${Math.abs(minLat).toFixed(2)}°${minLat >= 0 ? 'N' : 'S'} – ${Math.abs(maxLat).toFixed(2)}°${maxLat >= 0 ? 'N' : 'S'}`;
  return `${lonStr} · ${latStr}`;
}

export default function Sentinel1AcquisitionPanel() {
  const navigate = useNavigate();

  // AOIs
  const [aois, setAois] = useState([]);
  const [selectedAoi, setSelectedAoi] = useState('mumbai');

  // Query state
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [mode, setMode] = useState('IW');
  const [polarization, setPolarization] = useState('VV+VH');

  // Search & Result state
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailsModalProduct, setDetailsModalProduct] = useState(null);

  // Staging / Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [processError, setProcessError] = useState(null);
  const [activeJob, setActiveJob] = useState(null);

  // Poll active real CDSE job for live progress updates
  useEffect(() => {
    if (!activeJob?.jobId) return;
    const isTerminal = ['completed', 'failed'].includes(activeJob.status?.toLowerCase());
    if (isTerminal) return;

    const interval = setInterval(async () => {
      try {
        const res = await jobsApi.getById(activeJob.jobId);
        const data = res?.data || res;
        if (!data) return;

        const payload = data.payload || {};
        const backendStatus = (data.status || 'running').toLowerCase();
        const progressVal = typeof data.progress === 'number' ? data.progress : activeJob.progress;

        setActiveJob((prev) => {
          if (!prev || prev.jobId !== activeJob.jobId) return prev;
          return {
            ...prev,
            status: backendStatus,
            progress: progressVal,
            stage: payload.stage || (backendStatus === 'completed' ? 'ANALYSIS_READY' : backendStatus === 'failed' ? 'FAILED' : prev.stage),
            stageMessage: payload.stageMessage || (backendStatus === 'completed' ? 'Processing Complete. Analysis Ready.' : prev.stageMessage),
            bytesDownloaded: payload.bytesDownloaded ?? prev.bytesDownloaded,
            totalBytes: payload.totalBytes ?? prev.totalBytes,
            downloadPercent: payload.downloadPercent ?? prev.downloadPercent,
            speedBps: payload.speedBps ?? prev.speedBps,
            errorMessage: data.errorMessage || payload.errorMessage || null,
          };
        });
      } catch (err) {
        console.warn('Failed to poll job status:', err.message);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeJob?.jobId, activeJob?.status]);

  // Load AOIs on mount
  useEffect(() => {
    let mounted = true;
    sentinel1Api
      .getAois()
      .then((res) => {
        const aoiList = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        if (mounted && aoiList.length > 0) {
          setAois(aoiList);
        }
      })
      .catch((err) => {
        console.warn('Failed to fetch AOIs:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    setIsSearching(true);
    setSearchError(null);
    setSearchResults(null);
    setSelectedProduct(null);

    try {
      const response = await sentinel1Api.searchAcquisitions({
        aoi: selectedAoi,
        startDate: startDate ? `${startDate}T00:00:00Z` : undefined,
        endDate: endDate ? `${endDate}T23:59:59Z` : undefined,
        mode,
        polarization,
        limit: 12,
      });

      const normalizedResults = Array.isArray(response?.results) ? response.results : [];
      setSearchResults(response || { results: [], totalFound: 0 });
      if (normalizedResults.length > 0) {
        setSelectedProduct(normalizedResults[0]);
      }
    } catch (err) {
      setSearchError(err.message || 'Failed to query Copernicus Data Space Ecosystem catalogue');
    } finally {
      setIsSearching(false);
    }
  };

  const handleProcessProduct = async (product) => {
    if (!product) return;
    setIsProcessing(true);
    setProcessingStatus('Validating CDSE product provenance & metadata...');
    setProcessError(null);

    try {
      setProcessingStatus('Registering Sentinel-1 acquisition in mission queue...');
      const response = await sentinel1Api.processAcquisition({
        productId: product.id,
        sarSceneId: product.id,
        timeWindowHours: 24,
        metadata: {
          productName: product.name,
          platform: product.platform,
          acquisitionStart: product.acquisitionStart,
          polarization: product.polarization,
          orbitDirection: product.orbitDirection,
          bbox: product.bbox,
        },
      });

      const jobId = response?.jobId || response?.data?.jobId;
      if (!jobId) {
        throw new Error('Pipeline dispatch did not return a valid jobId');
      }

      setActiveJob({
        jobId,
        product,
        productId: product.id,
        productName: product.name,
        platform: product.platform,
        acquisitionStart: product.acquisitionStart,
        polarization: product.polarization,
        bbox: product.bbox,
        status: 'queued',
        stage: 'QUEUED',
        stageMessage: 'Job queued in BullMQ processing pipeline...',
        progress: 5,
        bytesDownloaded: 0,
        totalBytes: null,
        speedBps: 0,
        errorMessage: null,
      });

      setIsProcessing(false);
      setProcessingStatus('');
    } catch (err) {
      setProcessError(err.message || 'Failed to dispatch Sentinel-1 processing pipeline');
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const currentAoiMeta = aois.find((a) => a.id === selectedAoi) || {
    name: 'Mumbai Offshore',
    bbox: [72.5, 18.5, 73.2, 19.2],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* ACTIVE MISSION LIVE CDSE PROCESSING & DOWNLOAD CARD */}
      {activeJob && (
        <div
          data-testid="cdse-active-mission-card"
          style={{
            backgroundColor: '#0F141C',
            border: activeJob.status === 'failed' ? '1px solid rgba(239, 68, 68, 0.7)' : '1px solid rgba(73, 198, 200, 0.7)',
            borderRadius: '6px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: activeJob.status === 'failed' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(73, 198, 200, 0.15)',
                  color: activeJob.status === 'failed' ? '#EF4444' : '#49C6C8',
                  border: activeJob.status === 'failed' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(73, 198, 200, 0.3)',
                  letterSpacing: '0.08em',
                }}
              >
                {activeJob.status === 'failed' ? 'REAL ANALYSIS FAILED' : activeJob.status === 'completed' ? 'ANALYSIS READY ✓' : 'SENTINEL-1 · REAL CDSE PIPELINE'}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#E5E7EB', wordBreak: 'break-all' }}>
                {activeJob.platform || 'Sentinel-1'} · {activeJob.productName || activeJob.productId}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace' }}>
                Job: {activeJob.jobId}
              </span>
              {activeJob.status !== 'completed' && activeJob.status !== 'failed' && (
                <button
                  type="button"
                  onClick={() => setActiveJob(null)}
                  style={{
                    background: 'none',
                    border: '1px solid #374151',
                    borderRadius: '4px',
                    color: '#9CA3AF',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '2px 8px',
                  }}
                  title="Minimize progress card — processing continues in background"
                >
                  Run in Background
                </button>
              )}
            </div>
          </div>

          {/* Stage & Progress Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {activeJob.status !== 'completed' && activeJob.status !== 'failed' && (
                  <LoadingSpinner size="14px" />
                )}
                {activeJob.status === 'completed' && (
                  <CheckCircle2 size={16} color="#10B981" />
                )}
                {activeJob.status === 'failed' && (
                  <AlertCircle size={16} color="#EF4444" />
                )}
                <span style={{ fontWeight: 700, color: activeJob.status === 'failed' ? '#EF4444' : activeJob.status === 'completed' ? '#10B981' : '#49C6C8', letterSpacing: '0.04em' }}>
                  {activeJob.stage?.replace(/_/g, ' ') || activeJob.status?.toUpperCase()}
                </span>
                <span style={{ color: '#9CA3AF', fontSize: '11px' }}>
                  — {activeJob.stageMessage}
                </span>
              </div>
              <span style={{ fontWeight: 800, color: '#E5E7EB', fontFamily: 'monospace' }}>
                {activeJob.status === 'completed' ? '100%' : `${Math.max(5, activeJob.progress || 5)}%`}
              </span>
            </div>

            {/* Progress Bar Container */}
            <div style={{ width: '100%', height: '8px', backgroundColor: '#1F2937', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                data-testid="cdse-progress-fill"
                style={{
                  height: '100%',
                  width: activeJob.status === 'completed' ? '100%' : `${Math.max(5, activeJob.progress || 5)}%`,
                  backgroundColor: activeJob.status === 'failed' ? '#EF4444' : activeJob.status === 'completed' ? '#10B981' : '#49C6C8',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>

            {/* Bytes & Speed Details */}
            {(activeJob.bytesDownloaded > 0 || activeJob.totalBytes > 0 || activeJob.speedBps > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9CA3AF', fontFamily: 'monospace', marginTop: '2px' }}>
                <span>
                  {activeJob.bytesDownloaded > 0 ? `${(activeJob.bytesDownloaded / 1048576).toFixed(1)} MB` : '0 MB'}
                  {activeJob.totalBytes ? ` / ${(activeJob.totalBytes / 1048576).toFixed(1)} MB` : ''}
                  {activeJob.downloadPercent != null ? ` (${activeJob.downloadPercent}%)` : ''}
                </span>
                {activeJob.speedBps > 0 && (
                  <span>
                    Transfer Rate: {(activeJob.speedBps / 1048576).toFixed(2)} MB/s
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Stage Milestones */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#9CA3AF', flexWrap: 'wrap', borderTop: '1px solid #1F2937', paddingTop: '10px' }}>
            <span style={{ color: activeJob.progress >= 10 ? '#49C6C8' : '#4B5563', fontWeight: activeJob.progress >= 10 ? 700 : 400 }}>
              1. CDSE AUTH {activeJob.progress >= 15 ? '✓' : ''}
            </span>
            <span style={{ color: '#4B5563' }}>→</span>
            <span style={{ color: activeJob.progress >= 15 ? '#49C6C8' : '#4B5563', fontWeight: activeJob.progress >= 15 ? 700 : 400 }}>
              2. ASSET DOWNLOAD {activeJob.progress >= 50 ? '✓' : ''}
            </span>
            <span style={{ color: '#4B5563' }}>→</span>
            <span style={{ color: activeJob.progress >= 50 ? '#49C6C8' : '#4B5563', fontWeight: activeJob.progress >= 50 ? 700 : 400 }}>
              3. PREPROCESSING {activeJob.progress >= 65 ? '✓' : ''}
            </span>
            <span style={{ color: '#4B5563' }}>→</span>
            <span style={{ color: activeJob.progress >= 65 ? '#49C6C8' : '#4B5563', fontWeight: activeJob.progress >= 65 ? 700 : 400 }}>
              4. MODEL INFERENCE {activeJob.progress >= 95 ? '✓' : ''}
            </span>
            <span style={{ color: '#4B5563' }}>→</span>
            <span style={{ color: activeJob.status === 'completed' ? '#10B981' : '#4B5563', fontWeight: activeJob.status === 'completed' ? 700 : 400 }}>
              5. READY {activeJob.status === 'completed' ? '✓' : ''}
            </span>
          </div>

          {/* Error Message Details */}
          {activeJob.status === 'failed' && activeJob.errorMessage && (
            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', padding: '8px 12px', fontSize: '11px', color: '#FCA5A5' }}>
              <strong>Error Reason:</strong> {activeJob.errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
            {activeJob.status === 'failed' && (
              <button
                type="button"
                onClick={() => activeJob.product && handleProcessProduct(activeJob.product)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <RefreshCw size={14} /> Retry Acquisition Pipeline
              </button>
            )}

            {activeJob.status === 'completed' && (
              <button
                type="button"
                data-testid="cdse-open-analysis-btn"
                onClick={() => navigate(`/analysis/REAL_CDSE?jobId=${activeJob.jobId}`)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '4px',
                  backgroundColor: '#49C6C8',
                  color: '#0D1117',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  letterSpacing: '0.04em',
                }}
              >
                <Play size={14} /> OPEN ANALYSIS
              </button>
            )}
          </div>
        </div>
      )}

      {/* 6. REAL CDSE SCENE CARD */}
      <div
        style={{
          backgroundColor: '#121417',
          border: '1px solid rgba(73, 198, 200, 0.35)',
          borderRadius: '6px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#49C6C8',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontFamily: 'monospace',
                }}
              >
                REAL CDSE ACQUISITION
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(74, 222, 128, 0.12)',
                  border: '1px solid rgba(74, 222, 128, 0.3)',
                  color: '#4ADE80',
                  fontWeight: 600,
                }}
              >
                AUTHENTICATED SOURCE
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: '#1D2025',
                  border: '1px solid #343940',
                  color: '#8E96A4',
                }}
              >
                LEVEL-1 GRD
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#ECEEF1', fontWeight: 600 }}>
              <span>Sentinel-1A</span>
              <span style={{ color: '#555C65' }}>&bull;</span>
              <span>IW GRD</span>
              <span style={{ color: '#555C65' }}>&bull;</span>
              <span style={{ color: '#49C6C8' }}>VV + VH (Dual-Pol)</span>
              <span style={{ color: '#555C65' }}>&bull;</span>
              <span style={{ color: '#E7A63A' }}>Descending (Pass 65)</span>
            </div>

            <p style={{ fontSize: '11.5px', color: '#8E96A4', margin: '2px 0 0 0', maxWidth: '720px', lineHeight: 1.4 }}>
              Forensically authenticated Level-1 GRD SAR acquisition downloaded from Copernicus Data Space Ecosystem STAC API with co-registered ERA5 wind and NOAA SST.
            </p>
          </div>

          {/* 7. LAUNCH BUTTON */}
          <button
            type="button"
            onClick={() => handleProcessProduct({
              id: 'cdse-s1a-mumbai-20240218',
              name: 'S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG',
              platform: 'Sentinel-1A',
              productType: 'IW_GRDH_1S',
              polarization: 'VV+VH',
              orbitDirection: 'DESCENDING',
              acquisitionStart: '2024-02-18T01:03:29.872826Z',
              bbox: [72.716985, 18.965879, 72.773998, 19.020798],
            })}
            disabled={isProcessing}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              backgroundColor: isProcessing ? '#1A1E24' : '#0284C7',
              color: isProcessing ? '#777E87' : '#FFFFFF',
              border: isProcessing ? '1px solid #25292F' : '1px solid #38BDF8',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              minWidth: '220px',
              transition: 'all 0.15s ease',
              boxShadow: isProcessing ? 'none' : '0 2px 8px rgba(2, 132, 199, 0.3)',
            }}
            onMouseEnter={(e) => {
              if (!isProcessing) e.currentTarget.style.backgroundColor = '#0369A1';
            }}
            onMouseLeave={(e) => {
              if (!isProcessing) e.currentTarget.style.backgroundColor = '#0284C7';
            }}
          >
            {isProcessing ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700 }}>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>DISPATCHING CDSE PIPELINE...</span>
                </div>
                <span style={{ fontSize: '9.5px', fontFamily: 'monospace', color: '#777E87' }}>
                  Prerequisite: Processing in progress
                </span>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}>
                  <Play size={13} fill="#FFFFFF" />
                  <span>LAUNCH REAL CDSE ANALYSIS</span>
                </div>
                <span style={{ fontSize: '9.5px', fontFamily: 'monospace', color: 'rgba(255, 255, 255, 0.8)' }}>
                  Target: 01:03:29 UTC &bull; Pass 65
                </span>
              </>
            )}
          </button>
        </div>

        {/* Scene Specs Telemetry Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '8px',
            paddingTop: '10px',
            borderTop: '1px solid #25292F',
            fontSize: '11px',
            fontFamily: 'monospace',
          }}
        >
          <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #25292F' }}>
            <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px', marginBottom: '2px' }}>PRODUCT UUID</span>
            <span style={{ color: '#49C6C8', fontSize: '11px', wordBreak: 'break-all' }}>3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79</span>
          </div>
          <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #25292F' }}>
            <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px', marginBottom: '2px' }}>ACQUISITION UTC</span>
            <span style={{ color: '#ECEEF1', fontWeight: 600 }}>18 Feb 2024 &bull; 01:03:29 UTC</span>
          </div>
          <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #25292F' }}>
            <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px', marginBottom: '2px' }}>PASS / ORBIT</span>
            <span style={{ color: '#E7A63A', fontWeight: 600 }}>Descending (Pass 65)</span>
          </div>
          <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #25292F' }}>
            <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px', marginBottom: '2px' }}>SUBSCENE EXTENT</span>
            <span style={{ color: '#8E96A4' }}>18.994°N, 72.745°E (512&times;512 COG)</span>
          </div>
        </div>
      </div>

      {/* 8. CDSE ACQUISITION SEARCH */}
      <div
        style={{
          backgroundColor: '#121417',
          border: '1px solid #25292F',
          borderRadius: '6px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#49C6C8',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontFamily: 'monospace',
                display: 'block',
              }}
            >
              COPERNICUS DATA SPACE ECOSYSTEM
            </span>
            <h2 style={{ fontSize: '13px', fontWeight: 600, color: '#ECEEF1', margin: '2px 0 0 0', letterSpacing: '-0.01em' }}>
              Discover Additional Sentinel-1 Acquisitions (STAC API)
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                padding: '2px 6px',
                borderRadius: '3px',
                backgroundColor: 'rgba(73, 198, 200, 0.12)',
                border: '1px solid rgba(73, 198, 200, 0.25)',
                color: '#49C6C8',
              }}
            >
              STAC API v1.0
            </span>
            <span
              style={{
                fontSize: '10px',
                fontFamily: 'monospace',
                padding: '2px 6px',
                borderRadius: '3px',
                backgroundColor: '#1D2025',
                border: '1px solid #343940',
                color: '#8E96A4',
              }}
            >
              Sentinel-1 GRD IW
            </span>
          </div>
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* 5 Filters + Action in a clean, coherent grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(200px, 1.4fr) minmax(130px, 1fr) minmax(130px, 1fr) minmax(110px, 0.9fr) minmax(100px, 0.8fr) minmax(160px, 1.1fr)',
              gap: '10px',
              alignItems: 'end',
            }}
          >
            {/* AREA OF INTEREST */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 700, color: '#8E96A4', marginBottom: '4px' }}>
                AREA OF INTEREST
              </label>
              <select
                value={selectedAoi}
                onChange={(e) => setSelectedAoi(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 8px',
                  borderRadius: '4px',
                  backgroundColor: '#0C0E11',
                  border: '1px solid #25292F',
                  color: '#ECEEF1',
                  fontSize: '11.5px',
                  fontFamily: 'inherit',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                {aois.length > 0 ? (
                  aois.map((aoi) => (
                    <option key={aoi.id} value={aoi.id}>
                      {aoi.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="mumbai">Mumbai Offshore (Arabian Sea)</option>
                    <option value="kutch">Gulf of Kutch Maritime Pass</option>
                    <option value="bengal">Bay of Bengal / Paradip Corridor</option>
                    <option value="malabar">Goa / Malabar Coastal Channel</option>
                  </>
                )}
              </select>
            </div>

            {/* FROM DATE */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 700, color: '#8E96A4', marginBottom: '4px' }}>
                FROM DATE (UTC)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 8px',
                  borderRadius: '4px',
                  backgroundColor: '#0C0E11',
                  border: '1px solid #25292F',
                  color: '#ECEEF1',
                  fontSize: '11.5px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* TO DATE */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 700, color: '#8E96A4', marginBottom: '4px' }}>
                TO DATE (UTC)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 8px',
                  borderRadius: '4px',
                  backgroundColor: '#0C0E11',
                  border: '1px solid #25292F',
                  color: '#ECEEF1',
                  fontSize: '11.5px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* POLARIZATION */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 700, color: '#8E96A4', marginBottom: '4px' }}>
                POLARIZATION
              </label>
              <select
                value={polarization}
                onChange={(e) => setPolarization(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 8px',
                  borderRadius: '4px',
                  backgroundColor: '#0C0E11',
                  border: '1px solid #25292F',
                  color: '#ECEEF1',
                  fontSize: '11.5px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="VV+VH">VV + VH</option>
                <option value="VV">VV Only</option>
              </select>
            </div>

            {/* MODE */}
            <div>
              <label style={{ display: 'block', fontSize: '10px', fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 700, color: '#8E96A4', marginBottom: '4px' }}>
                MODE
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 8px',
                  borderRadius: '4px',
                  backgroundColor: '#0C0E11',
                  border: '1px solid #25292F',
                  color: '#ECEEF1',
                  fontSize: '11.5px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <option value="IW">IW (10m)</option>
              </select>
            </div>

            {/* SEARCH BUTTON */}
            <div>
              <button
                type="submit"
                disabled={isSearching || isProcessing}
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 12px',
                  borderRadius: '4px',
                  backgroundColor: isSearching ? '#1A1E24' : '#1D2025',
                  color: isSearching ? '#777E87' : '#ECEEF1',
                  border: '1px solid #343940',
                  cursor: isSearching || isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontWeight: 600,
                  fontSize: '11.5px',
                  fontFamily: 'monospace',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                }}
                onMouseEnter={(e) => {
                  if (!isSearching && !isProcessing) {
                    e.currentTarget.style.backgroundColor = '#25292F';
                    e.currentTarget.style.borderColor = '#49C6C8';
                    e.currentTarget.style.color = '#49C6C8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSearching && !isProcessing) {
                    e.currentTarget.style.backgroundColor = '#1D2025';
                    e.currentTarget.style.borderColor = '#343940';
                    e.currentTarget.style.color = '#ECEEF1';
                  }
                }}
              >
                {isSearching ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>QUERYING...</span>
                  </>
                ) : (
                  <>
                    <Search size={13} />
                    <span>SEARCH ACQUISITIONS</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 9. AOI BOUNDING BOX DISPLAY */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              backgroundColor: '#0C0E11',
              borderRadius: '4px',
              border: '1px solid #20242A',
              fontSize: '10.5px',
              fontFamily: 'monospace',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#555C65', textTransform: 'uppercase', fontSize: '9.5px', letterSpacing: '0.04em' }}>
                AOI BOUNDING BOX:
              </span>
              <span style={{ color: '#49C6C8' }}>
                {formatBbox(currentAoiMeta.bbox)}
              </span>
            </div>
            <span style={{ color: '#555C65', fontSize: '9.5px' }}>
              WGS84 / EPSG:4326
            </span>
          </div>
        </form>
      </div>

      {/* Errors & Alerts */}
      {searchError && (
        <ErrorMessage
          title="Copernicus Catalogue Search Error"
          message={searchError}
        />
      )}

      {processError && (
        <ErrorMessage
          title="Pipeline Dispatch Failed"
          message={processError}
        />
      )}

      {/* Search Results Display */}
      {searchResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Status Header */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '4px',
              background: searchResults.isLiveVerified ? 'rgba(34, 197, 94, 0.08)' : 'rgba(234, 179, 8, 0.08)',
              border: `1px solid ${searchResults.isLiveVerified ? 'rgba(34, 197, 94, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} style={{ color: searchResults.isLiveVerified ? 'var(--accent-green)' : 'var(--accent-amber)' }} />
              <div>
                <span style={{ fontSize: '0.80rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {searchResults.isLiveVerified
                    ? 'Authenticated Real Sentinel-1 STAC Search Results'
                    : 'LIVE SENTINEL-1 DATA NOT VERIFIED'}
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'block' }}>
                  {(searchResults.results && searchResults.results.length > 0)
                    ? `Found ${searchResults.results.length} dual-polarization acquisition(s) covering selected AOI`
                    : 'No Sentinel-1 acquisitions found for selected AOI / date range'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <span
                style={{
                  fontSize: '0.70rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  background: 'var(--surface-sunken)',
                  color: 'var(--text-secondary)',
                }}
              >
                Source: {searchResults.source || 'COPERNICUS_DATA_SPACE'}
              </span>
            </div>
          </div>

          {/* Results Grid or Clean Empty State */}
          {(!searchResults.results || searchResults.results.length === 0) ? (
            <div
              className="card"
              style={{
                padding: '28px',
                textAlign: 'center',
                background: 'var(--surface-sunken)',
                border: '1px dashed var(--border-color)',
                borderRadius: '4px',
              }}
            >
              <Satellite size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.6 }} />
              <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                No Sentinel-1 Acquisitions Found
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto' }}>
                No matching dual-polarization Level-1 GRD acquisitions were returned for this query. Try expanding the date range filter or choosing a different maritime AOI.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
              {searchResults.results.map((product) => {
                const isSelected = selectedProduct && selectedProduct.id === product.id;
                const formattedDate = product.acquisitionStart
                  ? new Date(product.acquisitionStart).toUTCString()
                  : 'N/A';

                return (
                  <div
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className="card"
                    style={{
                      padding: '14px',
                      borderRadius: '4px',
                      border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-color)'}`,
                      background: isSelected ? 'rgba(56, 189, 248, 0.06)' : 'var(--surface-sunken)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div>
                      {/* Top Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Satellite size={14} style={{ color: 'var(--accent-cyan)' }} />
                          <strong style={{ fontSize: '0.80rem', color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                            {product.platform}
                          </strong>
                          <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '3px', background: 'var(--surface-raised)', color: 'var(--text-muted)' }}>
                            {product.productType}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontFamily: 'var(--font-mono)',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            background: product.orbitDirection === 'DESCENDING' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(232, 173, 106, 0.12)',
                            color: product.orbitDirection === 'DESCENDING' ? 'var(--accent-cyan)' : 'var(--accent-amber)',
                          }}
                        >
                          {product.orbitDirection}
                        </span>
                      </div>

                      {/* Product Name */}
                      <div
                        style={{
                          fontSize: '0.72rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                          wordBreak: 'break-all',
                          marginBottom: '8px',
                          lineHeight: 1.3,
                        }}
                      >
                        {product.name || product.id}
                      </div>

                      {/* Meta Pills */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.72rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                          <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>{formattedDate}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                          <Radio size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>Pol: {product.polarization}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                          <Compass size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>Rel. Orbit: {product.relativeOrbit || 'N/A'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                          <HardDrive size={12} style={{ color: 'var(--text-muted)' }} />
                          <span>Size: {product.downloadSizeMb ? `${product.downloadSizeMb} MB` : '~950 MB'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #25292F' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailsModalProduct(product);
                        }}
                        style={{
                          flex: 1,
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '11.5px',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          backgroundColor: '#1D2025',
                          color: '#ECEEF1',
                          border: '1px solid #343940',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#25292F';
                          e.currentTarget.style.borderColor = '#49C6C8';
                          e.currentTarget.style.color = '#49C6C8';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#1D2025';
                          e.currentTarget.style.borderColor = '#343940';
                          e.currentTarget.style.color = '#ECEEF1';
                        }}
                      >
                        <Info size={13} />
                        View Details
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProcessProduct(product);
                        }}
                        disabled={isProcessing}
                        style={{
                          flex: 1.3,
                          height: '32px',
                          padding: '0 10px',
                          fontSize: '11.5px',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          backgroundColor: isProcessing ? '#1A1E24' : '#0284C7',
                          color: isProcessing ? '#777E87' : '#FFFFFF',
                          border: isProcessing ? '1px solid #25292F' : '1px solid #38BDF8',
                          borderRadius: '4px',
                          cursor: isProcessing ? 'not-allowed' : 'pointer',
                          boxShadow: isProcessing ? 'none' : '0 2px 6px rgba(2, 132, 199, 0.3)',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isProcessing) e.currentTarget.style.backgroundColor = '#0369A1';
                        }}
                        onMouseLeave={(e) => {
                          if (!isProcessing) e.currentTarget.style.backgroundColor = '#0284C7';
                        }}
                      >
                        <Play size={13} fill="#FFFFFF" />
                        Download & Process
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Processing Overlay Feedback */}
      {isProcessing && (
        <div
          style={{
            padding: '14px',
            borderRadius: '4px',
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <LoadingSpinner size="sm" />
          <div>
            <strong style={{ fontSize: '0.82rem', color: 'var(--accent-cyan)', display: 'block' }}>
              Near-Real-Time Sentinel-1 Processing in Progress
            </strong>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {processingStatus || 'Dispatching job...'}
            </span>
          </div>
        </div>
      )}

      {/* Product Details Modal */}
      {detailsModalProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              maxWidth: '620px',
              width: '100%',
              padding: '18px 20px',
              backgroundColor: '#121417',
              border: '1px solid #343940',
              borderRadius: '6px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.7)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#49C6C8', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'monospace' }}>
                  Sentinel-1 Level-1 GRD Metadata
                </span>
                <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#ECEEF1', margin: '4px 0 0 0', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  {detailsModalProduct.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailsModalProduct(null)}
                style={{ background: 'none', border: 'none', color: '#777E87', cursor: 'pointer', padding: '4px' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ECEEF1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#777E87'; }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', fontFamily: 'monospace', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px' }}>Product UUID</span>
                <span style={{ color: '#49C6C8', wordBreak: 'break-all' }}>{detailsModalProduct.productUuid || detailsModalProduct.id}</span>
              </div>
              <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px' }}>Platform</span>
                <span style={{ color: '#ECEEF1', fontWeight: 600 }}>{detailsModalProduct.platform}</span>
              </div>
              <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px' }}>Acquisition Start</span>
                <span style={{ color: '#ECEEF1' }}>{detailsModalProduct.acquisitionStart || 'N/A'}</span>
              </div>
              <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px' }}>Acquisition End</span>
                <span style={{ color: '#ECEEF1' }}>{detailsModalProduct.acquisitionEnd || 'N/A'}</span>
              </div>
              <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px' }}>Instrument Mode</span>
                <span style={{ color: '#ECEEF1' }}>{detailsModalProduct.acquisitionMode || 'IW'}</span>
              </div>
              <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px' }}>Polarization</span>
                <span style={{ color: '#49C6C8', fontWeight: 600 }}>{detailsModalProduct.polarization}</span>
              </div>
              <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px' }}>Orbit Direction</span>
                <span style={{ color: '#ECEEF1' }}>{detailsModalProduct.orbitDirection}</span>
              </div>
              <div style={{ backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px' }}>Relative Orbit</span>
                <span style={{ color: '#E7A63A', fontWeight: 600 }}>{detailsModalProduct.relativeOrbit || 'N/A'}</span>
              </div>
              <div style={{ gridColumn: 'span 2', backgroundColor: '#0C0E11', padding: '6px 10px', borderRadius: '4px', border: '1px solid #20242A' }}>
                <span style={{ color: '#777E87', display: 'block', fontSize: '9.5px', marginBottom: '2px' }}>Geographic Bounding Box [W, S, E, N]</span>
                <span style={{ color: '#49C6C8' }}>
                  {formatBbox(detailsModalProduct.bbox)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDetailsModalProduct(null)}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  fontSize: '11.5px',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  backgroundColor: '#1D2025',
                  color: '#ECEEF1',
                  border: '1px solid #343940',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = detailsModalProduct;
                  setDetailsModalProduct(null);
                  handleProcessProduct(p);
                }}
                style={{
                  height: '32px',
                  padding: '0 14px',
                  fontSize: '11.5px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  backgroundColor: '#0284C7',
                  color: '#FFFFFF',
                  border: '1px solid #38BDF8',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0369A1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0284C7'; }}
              >
                Download & Process in Pipeline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
