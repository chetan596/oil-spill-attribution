import React, { useState, useEffect } from 'react';
import { Activity, Wifi, WifiOff } from 'lucide-react';

export default function NetworkStatus({ onClick, className = '' }) {
  const [latency, setLatency] = useState(24);
  const [status, setStatus] = useState('ONLINE');

  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate micro-telemetry jitter around 18-34ms
      setLatency(Math.floor(20 + Math.random() * 12));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-[6px] bg-[#121417] border border-[rgba(255,255,255,0.055)] hover:border-[#343940] text-xs font-mono transition-colors cursor-pointer select-none ${className}`}
      title="API Telemetry: 24ms latency · Connected to Node & Python ML backend"
      aria-label="System Network Status"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ADE80] opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4ADE80]"></span>
      </span>
      <span className="text-[#ECEEF1] font-sans font-medium text-[11px]">Station Ready</span>
      <span className="text-[#777E87] text-[11px] tabular-nums hidden sm:inline">{latency}ms</span>
    </button>
  );
}
