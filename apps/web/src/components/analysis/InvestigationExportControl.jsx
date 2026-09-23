/**
 * InvestigationExportControl.jsx
 * Phase 16.4 Part 6 — Multi-Format Investigation Export Control
 *
 * Provides download actions for:
 *   - Export Investigation JSON
 *   - Export GeoJSON FeatureCollection
 *   - Export Technical Report Dossier (Markdown)
 *   - Export Artifact Manifest
 *
 * Feedback states:
 *   - IDLE
 *   - GENERATING REPORT / DOWNLOADING
 *   - REPORT READY / DOWNLOAD COMPLETE
 *   - ERROR
 */

import React, { useState } from 'react';
import { Download, FileJson, Map, FileText, PackageCheck, Loader2, Check, AlertCircle } from 'lucide-react';
import { manualAnalysisApi } from '../../api/manual-analysis.api';

export default function InvestigationExportControl({ canonical, className = '' }) {
  if (!canonical || !canonical.jobId) return null;

  const jobId = canonical.jobId;
  const [loadingType, setLoadingType] = useState(null); // 'json' | 'geojson' | 'report' | 'manifest'
  const [feedback, setFeedback] = useState(null); // { type, message }

  const triggerDownload = (blobData, filename, mimeType) => {
    const blob = new Blob([blobData], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async (type) => {
    setLoadingType(type);
    setFeedback({ type: 'info', message: type === 'report' ? 'GENERATING REPORT...' : 'PREPARING EXPORT...' });

    try {
      if (type === 'json') {
        const res = await manualAnalysisApi.exportJson(jobId);
        const jsonContent = JSON.stringify(res.data || res, null, 2);
        triggerDownload(jsonContent, `investigation_${jobId}.json`, 'application/json');
      } else if (type === 'geojson') {
        const res = await manualAnalysisApi.exportGeoJson(jobId);
        const geojsonContent = JSON.stringify(res, null, 2);
        triggerDownload(geojsonContent, `investigation_${jobId}.geojson`, 'application/geo+json');
      } else if (type === 'report') {
        const res = await manualAnalysisApi.exportReport(jobId, 'markdown');
        const reportContent = typeof res === 'string' ? res : (res.report || JSON.stringify(res, null, 2));
        triggerDownload(reportContent, `investigation_${jobId}_technical_report.md`, 'text/markdown');
      } else if (type === 'manifest') {
        const res = await manualAnalysisApi.exportManifest(jobId);
        const manifestContent = JSON.stringify(res, null, 2);
        triggerDownload(manifestContent, `investigation_${jobId}_manifest.json`, 'application/json');
      }

      setFeedback({ type: 'success', message: type === 'report' ? 'REPORT READY' : 'EXPORT READY' });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      console.error('[Export] Download failed:', err);
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || err.message || 'Export generation failed',
      });
      setTimeout(() => setFeedback(null), 4000);
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div
      data-testid="investigation-export-control"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        background: 'rgba(15, 23, 42, 0.75)',
        border: '1px solid rgba(51, 65, 85, 0.65)',
        borderRadius: '8px',
      }}
      className={className}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '4px' }}>
        <Download size={16} color="#38BDF8" />
        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Export Investigation
        </span>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          data-testid="export-json-btn"
          disabled={loadingType !== null}
          onClick={() => handleExport('json')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '5px',
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            color: '#E2E8F0',
            fontSize: '0.74rem',
            fontWeight: 600,
            cursor: loadingType !== null ? 'not-allowed' : 'pointer',
            opacity: loadingType !== null ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          {loadingType === 'json' ? <Loader2 size={13} className="animate-spin" /> : <FileJson size={13} color="#38BDF8" />}
          <span>JSON</span>
        </button>

        <button
          type="button"
          data-testid="export-geojson-btn"
          disabled={loadingType !== null}
          onClick={() => handleExport('geojson')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '5px',
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            color: '#E2E8F0',
            fontSize: '0.74rem',
            fontWeight: 600,
            cursor: loadingType !== null ? 'not-allowed' : 'pointer',
            opacity: loadingType !== null ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          {loadingType === 'geojson' ? <Loader2 size={13} className="animate-spin" /> : <Map size={13} color="#10B981" />}
          <span>GeoJSON</span>
        </button>

        <button
          type="button"
          data-testid="export-report-btn"
          disabled={loadingType !== null}
          onClick={() => handleExport('report')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '5px',
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            color: '#E2E8F0',
            fontSize: '0.74rem',
            fontWeight: 600,
            cursor: loadingType !== null ? 'not-allowed' : 'pointer',
            opacity: loadingType !== null ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          {loadingType === 'report' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} color="#F59E0B" />}
          <span>Technical Report</span>
        </button>

        <button
          type="button"
          data-testid="export-manifest-btn"
          disabled={loadingType !== null}
          onClick={() => handleExport('manifest')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '5px',
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            color: '#E2E8F0',
            fontSize: '0.74rem',
            fontWeight: 600,
            cursor: loadingType !== null ? 'not-allowed' : 'pointer',
            opacity: loadingType !== null ? 0.6 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          {loadingType === 'manifest' ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} color="#C084FC" />}
          <span>Artifact Manifest</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          data-testid="export-feedback"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            background:
              feedback.type === 'success'
                ? 'rgba(34, 197, 94, 0.15)'
                : feedback.type === 'error'
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(56, 189, 248, 0.15)',
            border: `1px solid ${
              feedback.type === 'success'
                ? 'rgba(34, 197, 94, 0.4)'
                : feedback.type === 'error'
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(56, 189, 248, 0.4)'
            }`,
            color:
              feedback.type === 'success'
                ? '#4ADE80'
                : feedback.type === 'error'
                ? '#F87171'
                : '#38BDF8',
          }}
        >
          {feedback.type === 'success' ? <Check size={12} /> : feedback.type === 'error' ? <AlertCircle size={12} /> : <Loader2 size={12} className="animate-spin" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
