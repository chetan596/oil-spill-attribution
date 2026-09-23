import React from 'react';

export default function DossierExcerpt({
  title = 'Dossier excerpt — building live',
  content,
  citations = [],
  className = '',
}) {
  const defaultText =
    'Backward trajectory isolates a single stationary release at 18.91°N 72.79°E within the −24 h hindcast window [E3]. AIS track of MV Kandla Star intersects this window with 94% correlation on heading and dwell time [E4], and the second SAR pass confirms elongation along the modelled drift axis [E5]. Confidence in vessel attribution is high pending ground-truth sampling [E6].';

  const textToRender = content || defaultText;

  // Render text and replace [E1], [E2], etc. with styled purple references
  const renderFormattedText = (text) => {
    const parts = text.split(/(\[E\d+\])/g);
    return parts.map((part, idx) => {
      if (/^\[E\d+\]$/.test(part)) {
        return (
          <span key={idx} className="ref text-[#A855F7] font-mono text-[11px] font-medium mx-0.5 cursor-help" title={`Forensic Reference ${part}`}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <section
      className={`panel dossier p-5 md:p-6 bg-[#121417] border border-[#25292F] rounded-lg ${className}`}
      data-component="DossierExcerpt"
      data-brief-id="dossier-excerpt"
      data-brief-role="section"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[#ECEEF1] font-display tracking-wide">
          {title}
        </h2>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-[4px] bg-[rgba(236,72,153,0.12)] text-[#EC4899] uppercase tracking-wider">
          SYNTHESIS
        </span>
      </div>

      <p className="text-xs text-[#B1B6BD] leading-relaxed mt-2 max-w-4xl">
        {renderFormattedText(textToRender)}
      </p>
    </section>
  );
}

