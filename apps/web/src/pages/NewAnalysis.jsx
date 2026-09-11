import React, { useState } from 'react';

export default function NewAnalysis() {
  const [sarFile, setSarFile] = useState(null);

  return (
    <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', color: '#fff' }}>
      <h2>Initiate New Oil Spill Attribution Analysis</h2>
      <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
        <div>
          <label>Upload SAR Scene / GeoTIFF:</label>
          <input type="file" onChange={(e) => setSarFile(e.target.files[0])} style={{ display: 'block', marginTop: '8px' }} />
        </div>
        <div>
          <label>Time Window (Hours Hindcast):</label>
          <input type="number" defaultValue={24} style={{ display: 'block', marginTop: '8px', padding: '8px' }} />
        </div>
        <button type="submit" style={{ padding: '10px 20px', background: '#38bdf8', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Run AI Detection & Attribution Job
        </button>
      </form>
    </div>
  );
}
