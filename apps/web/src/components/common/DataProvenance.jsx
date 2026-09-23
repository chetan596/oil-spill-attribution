import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';

/**
 * DataProvenance – Compact "Why this data?" provenance popover.
 *
 * Provides transparent disclosure of data origin, processing chain,
 * evidence class, and known limitations for any displayed metric.
 *
 * Renders via React Portal into document.body with viewport-aware
 * positioning, ensuring the popover is NEVER clipped by parent containers,
 * cards, drawers, or overflow-hidden ancestors.
 */

/* ── Semantic token palettes ── */
const STATUS_STYLES = {
  REAL:            { color: 'var(--og-success, #4ADE80)',        bg: 'rgba(74, 222, 128, 0.10)' },
  OBSERVED:        { color: 'var(--og-teal, #49C6C8)',           bg: 'rgba(73, 198, 200, 0.10)' },
  MODELLED:        { color: 'var(--og-amber, #E7A63A)',          bg: 'rgba(231, 166, 58, 0.10)' },
  DERIVED:         { color: 'var(--og-amber, #E7A63A)',          bg: 'rgba(231, 166, 58, 0.10)' },
  DEMONSTRATION:   { color: 'var(--og-violet, #A855F7)',         bg: 'rgba(168, 85, 247, 0.10)' },
  USER_INPUT:      { color: 'var(--og-text-secondary, #B1B6BD)', bg: 'rgba(177, 182, 189, 0.08)' },
  STATIC:          { color: 'var(--og-text-muted, #777E87)',     bg: 'rgba(119, 126, 135, 0.08)' },
  FALLBACK:        { color: 'var(--og-amber, #E7A63A)',          bg: 'rgba(231, 166, 58, 0.10)' },
  NOT_ESTABLISHED: { color: 'var(--og-text-muted, #777E87)',     bg: 'rgba(119, 126, 135, 0.08)' },
};

const EVIDENCE_COLORS = {
  OBSERVED:        'var(--og-teal, #49C6C8)',
  MODELLED:        'var(--og-amber, #E7A63A)',
  ANALYTICAL:      'var(--og-violet, #A855F7)',
  AIS:             'var(--og-teal, #49C6C8)',
  DEMONSTRATION:   'var(--og-violet, #A855F7)',
  VERIFIED:        'var(--og-success, #4ADE80)',
  ERROR:           'var(--og-error, #F87171)',
  NOT_ESTABLISHED: 'var(--og-text-muted, #777E87)',
};

export default function DataProvenance({
  /* Data origin */
  status,
  source,
  dataset,
  product,
  acquisition,
  variable,
  /* Evidence class */
  evidenceClass,
  /* Processing/methodology */
  processing,
  formula,
  valueType,
  usedFor,
  /* Transparency */
  limitation,
  /* Layout */
  compact = true,
  position = 'bottom',
  iconSize,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, maxHeight: 360, placement: 'bottom' });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined' && !!document.body;

  // Viewport-aware position calculator
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoverEl = popoverRef.current;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    // If trigger has been scrolled completely outside the viewport, dismiss
    if (
      triggerRect.bottom < 0 ||
      triggerRect.top > viewportHeight ||
      triggerRect.right < 0 ||
      triggerRect.left > viewportWidth
    ) {
      setIsOpen(false);
      return;
    }

    const popoverWidth = popoverEl ? popoverEl.offsetWidth : 280;
    const popoverHeight = popoverEl ? popoverEl.offsetHeight : 240;

    // Calculate vertical space available above and below trigger
    const spaceBelow = viewportHeight - triggerRect.bottom - margin;
    const spaceAbove = triggerRect.top - margin;

    let placeAbove = false;
    let maxHeight = 360;

    // If space below is restricted (< popoverHeight or < 220px) and space above has more room, flip upward
    if (spaceBelow < Math.min(popoverHeight, 220) && spaceAbove > spaceBelow) {
      placeAbove = true;
      maxHeight = Math.max(140, Math.min(360, spaceAbove - 8));
    } else {
      placeAbove = false;
      maxHeight = Math.max(140, Math.min(360, spaceBelow - 8));
    }

    let top = placeAbove
      ? triggerRect.top - popoverHeight - 6
      : triggerRect.bottom + 6;

    // Safety guard: ensure top stays within viewport margins
    if (top < margin) {
      top = margin;
    } else if (top + popoverHeight > viewportHeight - margin) {
      top = Math.max(margin, viewportHeight - margin - popoverHeight);
    }

    // Horizontal placement: align centered on trigger, clamped inside viewport margins
    let left = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2;

    if (left + popoverWidth > viewportWidth - margin) {
      left = viewportWidth - margin - popoverWidth;
    }
    if (left < margin) {
      left = margin;
    }

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      maxHeight: Math.round(maxHeight),
      placement: placeAbove ? 'top' : 'bottom',
    });
  }, []);

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  // Compute position immediately upon opening
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  // Handle outside click, Escape, resize, and scroll tracking
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    const handlePointerDown = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  const sts = STATUS_STYLES[status] || STATUS_STYLES.NOT_ESTABLISHED;
  const evColor = EVIDENCE_COLORS[evidenceClass] || EVIDENCE_COLORS.NOT_ESTABLISHED;
  const resolvedIconSize = iconSize || (compact ? 11 : 14);

  // Build field list — only non-null entries
  const fields = [
    status        && { label: 'STATUS',      value: status,      color: sts.color },
    evidenceClass && { label: 'EVIDENCE',    value: evidenceClass, color: evColor },
    source        && { label: 'SOURCE',      value: source },
    dataset       && { label: 'DATASET',     value: dataset },
    product       && { label: 'PRODUCT',     value: product },
    acquisition   && { label: 'ACQUISITION', value: acquisition },
    variable      && { label: 'VARIABLE',    value: variable },
    valueType     && { label: 'TYPE',        value: valueType },
    usedFor       && { label: 'USED FOR',    value: usedFor },
    processing    && { label: 'PROCESSING',  value: processing },
    formula       && { label: 'FORMULA',     value: formula },
    limitation    && { label: 'LIMITATION',  value: limitation },
  ].filter(Boolean);

  if (fields.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((o) => !o);
        }}
        aria-label="Data provenance information"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        style={{
          background: 'transparent',
          border: 'none',
          padding: '1px 3px',
          cursor: 'pointer',
          color: isOpen ? 'var(--og-text-secondary, #B1B6BD)' : 'var(--og-text-muted, #777E87)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease',
          lineHeight: 1,
          fontSize: 'inherit',
          verticalAlign: 'middle',
          opacity: isOpen ? 1 : 0.7,
        }}
        title="View data provenance"
      >
        <Info size={resolvedIconSize} />
      </button>

      {isOpen && canUseDOM && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Data provenance details"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: 'max-content',
            minWidth: '240px',
            maxWidth: '310px',
            maxHeight: `${coords.maxHeight}px`,
            overflowY: 'auto',
            zIndex: 99999,
            background: 'var(--og-surface-elevated, #1D2025)',
            border: '1px solid var(--og-border-strong, #343940)',
            borderRadius: '6px',
            padding: '10px 12px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7), 0 2px 8px rgba(0, 0, 0, 0.45)',
            fontSize: '0.68rem',
            lineHeight: 1.4,
            color: 'var(--og-text-secondary, #B1B6BD)',
            fontFamily: "var(--og-font-mono, 'Schibsted Grotesk', monospace)",
            boxSizing: 'border-box',
            pointerEvents: 'auto',
          }}
        >
          {/* ── Header ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
            paddingBottom: '6px',
            borderBottom: '1px solid var(--og-border, #25292F)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                fontSize: '0.62rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--og-text-muted, #777E87)',
              }}>
                DATA PROVENANCE
              </span>
              {status && (
                <span style={{
                  fontSize: '0.60rem',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: sts.bg,
                  color: sts.color,
                  border: `1px solid ${sts.color}33`,
                }}>
                  {status}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close provenance details"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--og-text-muted, #777E87)',
                padding: '2px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                borderRadius: '3px',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--og-text-primary, #ECEEF1)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--og-text-muted, #777E87)')}
            >
              <X size={12} />
            </button>
          </div>

          {/* ── Field rows ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {fields
              .filter((f) => f.label !== 'STATUS')
              .map((field) => (
                <div key={field.label}>
                  <div style={{
                    fontSize: '0.56rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: field.color || 'var(--og-text-muted, #777E87)',
                    marginBottom: '1px',
                  }}>
                    {field.label}
                  </div>
                  <div style={{
                    fontSize: '0.66rem',
                    color: field.label === 'LIMITATION'
                      ? 'var(--og-amber, #E7A63A)'
                      : 'var(--og-text-secondary, #B1B6BD)',
                    wordBreak: 'break-word',
                    fontStyle: field.label === 'LIMITATION' ? 'italic' : 'normal',
                  }}>
                    {field.value}
                  </div>
                </div>
              ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
