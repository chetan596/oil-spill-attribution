# Oil Spill Detection & Vessel Attribution System

An end-to-end AI-powered platform for detecting marine oil slicks from Synthetic Aperture Radar (SAR) imagery, simulating backward drift (hindcast), and attributing spills to candidate vessels using historical AIS tracking, hydrodynamic modeling, and multi-criteria scoring.

## Features
- **SAR Satellite Processing**: Ingestion and normalization of Sentinel-1 / RADARSAT data.
- **Deep Learning Slick Detection**: Custom U-Net segmentation with Super-Resolution enhancement.
- **Hydrodynamic Hindcast**: Reverse drift trajectory simulation powered by GNOME / PyGnome.
- **AIS Vessel Attribution**: Proximity, trajectory match, temporal correlation, and anomaly scoring.
- **Automated Investigation Reports**: LLM-driven structured summary and legal evidence packaging.
- **Interactive Web UI**: Geospatial dashboard with slick polygons, vessel routes, and drift playback.

## Architecture Overview
```
[Sentinel-1 SAR / AIS Data / Weather API]
                   │
                   ▼
       [FastAPI ML Service] ─── (U-Net Slick Detection & GNOME Hindcast)
                   │
                   ▼
     [Node.js Backend & Workers] ── (AIS Scoring, BullMQ, PostGIS, LLM)
                   │
                   ▼
          [React + Vite Web UI] ── (Interactive Map, Playback & Reports)
```

## Quickstart
```bash
# Clone & install dependencies
pnpm install

# Start infrastructure (Postgres+PostGIS, Redis)
docker-compose up -d postgres redis

# Launch services in development mode
make dev
```
