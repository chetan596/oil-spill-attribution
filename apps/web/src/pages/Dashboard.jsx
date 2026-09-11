import React from 'react';
import MapView from '../components/map/MapView';

export default function Dashboard() {
  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: '#020617', color: '#fff' }}>
      <header style={{ padding: '16px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Oil Spill Attribution System</h1>
        <nav style={{ display: 'flex', gap: '16px' }}>
          <a href="/" style={{ color: '#38bdf8', textDecoration: 'none' }}>Dashboard</a>
          <a href="/analysis" style={{ color: '#94a3b8', textDecoration: 'none' }}>Analysis</a>
          <a href="/reports" style={{ color: '#94a3b8', textDecoration: 'none' }}>Reports</a>
        </nav>
      </header>
      <main style={{ flex: 1, position: 'relative' }}>
        <MapView />
      </main>
    </div>
  );
}
