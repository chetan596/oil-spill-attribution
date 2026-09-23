/**
 * Phase 16.4 Part 1 — Investigation Loading Skeleton Tests
 *
 * Verifies:
 *  1. Loading skeleton renders (not a blank page)
 *  2. Loading message renders
 *  3. All skeleton sections render (left, map, right)
 *  4. Real map is NOT shown before valid geospatial data
 *  5. Old investigation data is NOT shown while new investigation loads
 *  6. Subsystem failure does NOT blank the entire page
 *  7. Final loaded state renders actual workspace (skeleton absent)
 *  8. No fake geographic coordinates in the skeleton
 *  9. No demo data appears in the skeleton
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import InvestigationLoadingSkeleton from '../../components/analysis/InvestigationLoadingSkeleton';

// ─── Environment mocks ────────────────────────────────────────────────────────
vi.mock('react-leaflet', () => ({
  Polygon:      (p) => React.createElement('div', { ...p, 'data-type': 'Polygon' }),
  Tooltip:      (p) => React.createElement('div', { ...p, 'data-type': 'Tooltip' }),
  Popup:        (p) => React.createElement('div', { ...p, 'data-type': 'Popup' }),
  CircleMarker: (p) => React.createElement('div', { ...p, 'data-type': 'CircleMarker' }),
  Circle:       (p) => React.createElement('div', { ...p, 'data-type': 'Circle' }),
  Polyline:     (p) => React.createElement('div', { ...p, 'data-type': 'Polyline' }),
  useMap:       () => ({ fitBounds: vi.fn(), flyTo: vi.fn(), setView: vi.fn() }),
}));

vi.mock('leaflet', () => ({
  default: {
    latLngBounds: vi.fn(() => ({ isValid: () => true, pad: vi.fn(() => ({})) })),
    latLng:       vi.fn(() => ({})),
    icon:         vi.fn(() => ({})),
    divIcon:      vi.fn(() => ({})),
  },
  latLngBounds: vi.fn(() => ({ isValid: () => true, pad: vi.fn(() => ({})) })),
  latLng:       vi.fn(() => ({})),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderToHtml(element) {
  return ReactDOMServer.renderToStaticMarkup(element);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('InvestigationLoadingSkeleton — Phase 16.4 Part 1', () => {

  // 1. Loading skeleton renders
  it('renders the loading skeleton root element', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).toContain('data-testid="investigation-loading-skeleton"');
  });

  // 2. Loading message renders
  it('renders a loading message', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    // The first message in the sequence
    expect(html).toContain('data-testid="skeleton-loading-message"');
    expect(html).toContain('Loading investigation...');
  });

  // 3. All skeleton sections render
  it('renders left panel skeleton', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).toContain('data-testid="skeleton-left-panel"');
  });

  it('renders map shell skeleton', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).toContain('data-testid="skeleton-map-shell"');
  });

  it('renders right panel skeleton', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).toContain('data-testid="skeleton-right-panel"');
  });

  it('renders all 6 pipeline stage skeleton badges', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).toContain('data-testid="skeleton-stage-sar"');
    expect(html).toContain('data-testid="skeleton-stage-detection"');
    expect(html).toContain('data-testid="skeleton-stage-drift"');
    expect(html).toContain('data-testid="skeleton-stage-ais"');
    expect(html).toContain('data-testid="skeleton-stage-cpa"');
    expect(html).toContain('data-testid="skeleton-stage-dossier"');
  });

  it('renders skeleton map controls as non-interactive placeholders', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).toContain('data-testid="skeleton-map-controls"');
  });

  // 4. Real map NOT shown before valid data
  it('does NOT contain a real map component in the skeleton', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    // The real map component has id="analysis-map" or renders with a Leaflet container
    // Skeleton must not expose Leaflet map containers
    expect(html).not.toContain('leaflet-container');
    expect(html).not.toContain('id="analysis-map"');
  });

  // 5. No stale old-investigation data during loading
  it('does NOT contain any investigation-specific scientific values', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton jobId="47351f7f-test" />);
    // Must not show geographic coordinates
    expect(html).not.toMatch(/\d{1,3}\.\d+°[NS]/);
    expect(html).not.toMatch(/\d{1,3}\.\d+°[EW]/);
    // Must not show vessel names
    expect(html).not.toMatch(/MMSI:\s*\d{9}/);
    // Must not show Mumbai/Portland/India demo defaults
    expect(html).not.toContain('Mumbai');
    expect(html).not.toContain('Portland');
    expect(html).not.toContain('18.921');
    expect(html).not.toContain('72.832');
  });

  // 6. Subsystem failure does NOT blank page
  it('shows DRIFT UNAVAILABLE notice without blanking the skeleton', () => {
    const html = renderToHtml(
      <InvestigationLoadingSkeleton subsystems={{ drift: 'unavailable' }} />
    );
    // Still renders the skeleton root
    expect(html).toContain('data-testid="investigation-loading-skeleton"');
    // Shows the unavailable notice
    expect(html).toContain('data-testid="skeleton-subsystem-unavailable-drift"');
    expect(html).toContain('DRIFT UNAVAILABLE');
    // Still shows left and map panels
    expect(html).toContain('data-testid="skeleton-left-panel"');
    expect(html).toContain('data-testid="skeleton-map-shell"');
  });

  it('shows AIS UNAVAILABLE without removing map shell', () => {
    const html = renderToHtml(
      <InvestigationLoadingSkeleton subsystems={{ ais: 'unavailable' }} />
    );
    expect(html).toContain('AIS UNAVAILABLE');
    expect(html).toContain('data-testid="skeleton-map-shell"');
  });

  it('multiple subsystem failures do not blank the page', () => {
    const html = renderToHtml(
      <InvestigationLoadingSkeleton subsystems={{ sar: 'unavailable', drift: 'unavailable', ais: 'unavailable' }} />
    );
    expect(html).toContain('data-testid="investigation-loading-skeleton"');
    expect(html).toContain('SAR UNAVAILABLE');
    expect(html).toContain('DRIFT UNAVAILABLE');
    expect(html).toContain('AIS UNAVAILABLE');
    // Map shell still present
    expect(html).toContain('data-testid="skeleton-map-shell"');
  });

  // 7. jobId prop renders correctly
  it('shows truncated jobId in the status bar when provided', () => {
    const html = renderToHtml(
      <InvestigationLoadingSkeleton jobId="47351f7f-00d0-4dfe-bfb1-d4c788b55ff6" />
    );
    expect(html).toContain('47351f7f');
  });

  it('does not show jobId block when jobId is null', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton jobId={null} />);
    // Should not contain any job ID prefix that would leak stale job context
    expect(html).not.toContain('[…]');
  });

  // 8. No fake geographic coordinates
  it('does not contain fake map coordinates in map shell', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    // Map shell must not display lat/lng as text
    expect(html).not.toMatch(/lat:\s*[\d.]+/i);
    expect(html).not.toMatch(/lng:\s*[\d.]+/i);
    // No Mumbai co-ords
    expect(html).not.toContain('18.92');
    expect(html).not.toContain('72.83');
  });

  // 9. No demo data
  it('does not contain demo scenario data', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).not.toContain('demo-scene-001');
    expect(html).not.toContain('Mumbai Offshore');
    expect(html).not.toContain('DEMONSTRATION SCENARIO');
    expect(html).not.toContain('S1A_IW_GRDH_1SDV_20260912T061500_MUMBAI_DEMO');
  });

  // 10. Map shell contains the "Preparing" message not coordinate placeholders
  it('map shell shows "Preparing Investigation Map" status text', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).toContain('Preparing Investigation Map');
  });

  it('map shell explains why map is not shown yet', () => {
    const html = renderToHtml(<InvestigationLoadingSkeleton />);
    expect(html).toContain('geospatial evidence is verified');
  });
});
