import React from 'react';
import { Polyline, Popup } from 'react-leaflet';

export default function GridLayer({
  bounds = [[18.5, 72.0], [19.8, 73.2]],
  step = 0.2,
}) {
  const minLat = bounds ? Math.floor(bounds[0][0] / step) * step : 18.4;
  const maxLat = bounds ? Math.ceil(bounds[1][0] / step) * step : 19.8;
  const minLng = bounds ? Math.floor(bounds[0][1] / step) * step : 72.0;
  const maxLng = bounds ? Math.ceil(bounds[1][1] / step) * step : 73.2;

  const latLines = [];
  for (let lat = minLat; lat <= maxLat + 0.01; lat += step) {
    latLines.push({
      lat: Number(lat.toFixed(2)),
      positions: [
        [lat, minLng - 0.5],
        [lat, maxLng + 0.5],
      ],
    });
  }

  const lngLines = [];
  for (let lng = minLng; lng <= maxLng + 0.01; lng += step) {
    lngLines.push({
      lng: Number(lng.toFixed(2)),
      positions: [
        [minLat - 0.5, lng],
        [maxLat + 0.5, lng],
      ],
    });
  }

  return (
    <>
      {latLines.map((line, idx) => (
        <Polyline
          key={`lat-${idx}`}
          positions={line.positions}
          pathOptions={{
            color: '#334d44',
            weight: 0.75,
            opacity: 0.35,
            dashArray: '2, 6',
            interactive: false,
          }}
        />
      ))}
      {lngLines.map((line, idx) => (
        <Polyline
          key={`lng-${idx}`}
          positions={line.positions}
          pathOptions={{
            color: '#334d44',
            weight: 0.75,
            opacity: 0.35,
            dashArray: '2, 6',
            interactive: false,
          }}
        />
      ))}
    </>
  );
}
