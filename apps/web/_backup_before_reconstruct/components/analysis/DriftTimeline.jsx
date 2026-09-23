import React, { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

export default function DriftTimeline({
  initialTime = '16:00 UTC',
  hindcastHours = -24,
  forecastHours = 6,
  onTimeChange,
  isLive = false,
  className = '',
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(72); // 0 to 100 percentage along timeline

  useEffect(() => {
    let timer;
    if (isPlaying) {
      timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 100;
          }
          return prev + 1;
        });
      }, 200);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  const handleTrackClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newProgress = Math.max(0, Math.min(100, Math.round((clickX / rect.width) * 100)));
    setProgress(newProgress);
    if (onTimeChange) onTimeChange(newProgress);
  };

  return (
    <section
      className={`panel timeline p-4 bg-[#141416] border border-[#252529] rounded-lg ${className}`}
      data-component="DriftTimeline"
      data-brief-id="drift-timeline"
      data-brief-role="chart"
    >
      <h3 className="text-xs font-medium text-[#C8C8CE] font-display tracking-wide">
        Drift Timeline · Hindcast {hindcastHours} h → Forecast +{forecastHours} h
      </h3>

      {/* Scrub Track */}
      <div className="tl-row flex items-center gap-3 mt-3 text-xs text-[#5C5C63] font-mono select-none" data-brief-id="tl-scrub" data-brief-role="viz">
        <span className="text-[11px] tabular-nums">{hindcastHours} h</span>
        <div
          className="tl-track flex-1 h-1 bg-[rgba(255,255,255,0.10)] rounded-full relative cursor-pointer group"
          onClick={handleTrackClick}
          data-viz="drift-scrub"
          role="slider"
          aria-valuenow={progress}
          aria-valuemin="0"
          aria-valuemax="100"
          tabIndex={0}
        >
          {/* Hindcast & Forecast Segments */}
          <div
            className="tl-fill absolute left-0 top-0 bottom-0 rounded-full bg-[#a34ff1] transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
          <div
            className="tl-dot absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#b774ff] ring-2 ring-[#141416] group-hover:scale-125 transition-transform"
            style={{ left: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums">+{forecastHours} h</span>
      </div>

      {/* Legend */}
      <div className="tl-legend flex items-center gap-5 mt-2.5 text-[11px] text-[#5C5C63] font-mono">
        <span className="flex items-center">
          <span className="sw bg-[#8b32d5]" />
          Hindcast (Backward Dispersion)
        </span>
        <span className="flex items-center">
          <span className="sw bg-[#b774ff]" />
          Forecast (Forward Advection)
        </span>
      </div>

      {/* Playback Controls & Timestamp */}
      <div className="play-row flex items-center gap-3 mt-4" data-brief-id="tl-playback" data-brief-role="cta">
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? 'Pause drift playback' : 'Play drift playback'}
          className="play w-9 h-9 rounded-full bg-[#222224] hover:bg-[#2A2A2E] text-[#e8e8ea] flex items-center justify-center cursor-pointer transition-colors flex-shrink-0"
        >
          {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>

        <span className="play-time font-display text-sm font-medium text-[#e8e8ea] tabular-nums">
          {initialTime}
        </span>

        <span className="meta text-xs text-[#5C5C63]">
          Scrub to trace vessel trajectory and slick signature
        </span>
      </div>
    </section>
  );
}

