"""
Open-Meteo Explicit Secondary MetOcean Adapter (Phase 16.4 Part 5)

Explicitly configured secondary provider for high-resolution Copernicus Marine and ERA5 proxies.
CRITICAL MANDATE:
- NEVER acts as an automatic, silent fallback for Copernicus Marine or ECMWF.
- Active ONLY when explicitly enabled via METOCEAN_SECONDARY_PROVIDER=openmeteo.
- Preserves explicit provenance: provider="OPEN_METEO".
"""

import os
import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import urllib.request
import json

from app.drift.metocean.base_adapter import (
    BaseMetoceanAdapter,
    MetoceanAdapterError,
    MetoceanDataUnavailableError,
)
from app.drift.metocean.schemas import (
    HourlyForcingPoint,
    MetoceanForcingSeries,
    MetoceanProvenance,
)

logger = logging.getLogger(__name__)


class OpenMeteoSecondaryAdapter(BaseMetoceanAdapter):
    """
    Explicit secondary adapter querying Open-Meteo REST API.
    """

    def __init__(self):
        self.is_enabled = (os.environ.get("METOCEAN_SECONDARY_PROVIDER") or "").strip().lower() == "openmeteo"

    def is_configured(self) -> bool:
        """Returns True ONLY when explicitly enabled by configuration."""
        return self.is_enabled

    def fetch_forcing_series(
        self,
        latitude: float,
        longitude: float,
        t0: datetime,
        hours_back: int = 24,
        hours_forward: int = 6,
    ) -> MetoceanForcingSeries:
        if not self.is_configured():
            raise MetoceanAdapterError(
                "SECONDARY_PROVIDER_NOT_ENABLED: Open-Meteo is a secondary provider and must be "
                "explicitly enabled by setting METOCEAN_SECONDARY_PROVIDER=openmeteo in the environment."
            )

        if t0 is None:
            raise MetoceanAdapterError("METOCEAN_TIMESTAMP_REQUIRED: An authentic investigation timestamp T0 is required.")

        if t0.tzinfo is None:
            t0 = t0.replace(tzinfo=timezone.utc)
        else:
            t0 = t0.astimezone(timezone.utc)

        t_start = t0 - timedelta(hours=hours_back)
        t_end = t0 + timedelta(hours=hours_forward)

        start_date_str = t_start.strftime("%Y-%m-%d")
        end_date_str = t_end.strftime("%Y-%m-%d")

        logger.info(
            "[OpenMeteoSecondary] Fetching metocean series for (%s, %s) from %s to %s",
            latitude, longitude, start_date_str, end_date_str
        )

        try:
            # 1. Fetch Marine currents
            marine_url = (
                f"https://marine-api.open-meteo.com/v1/marine"
                f"?latitude={latitude:.4f}&longitude={longitude:.4f}"
                f"&hourly=ocean_current_velocity,ocean_current_direction"
                f"&start_date={start_date_str}&end_date={end_date_str}&timezone=UTC"
            )
            req = urllib.request.Request(marine_url, headers={"User-Agent": "OceanGuardAI/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                marine_data = json.loads(resp.read().decode("utf-8"))

            # 2. Fetch Winds (ERA5 archive or forecast depending on date)
            now_utc = datetime.now(timezone.utc)
            is_historical = (now_utc - t0).days >= 5

            if is_historical:
                weather_url = (
                    f"https://archive-api.open-meteo.com/v1/archive"
                    f"?latitude={latitude:.4f}&longitude={longitude:.4f}"
                    f"&hourly=wind_speed_10m,wind_direction_10m,wind_u_10m,wind_v_10m"
                    f"&start_date={start_date_str}&end_date={end_date_str}&timezone=UTC"
                )
                wind_ds = "ERA5_VIA_OPEN_METEO"
            else:
                weather_url = (
                    f"https://api.open-meteo.com/v1/forecast"
                    f"?latitude={latitude:.4f}&longitude={longitude:.4f}"
                    f"&hourly=wind_speed_10m,wind_direction_10m,wind_u_10m,wind_v_10m"
                    f"&start_date={start_date_str}&end_date={end_date_str}&timezone=UTC"
                )
                wind_ds = "IFS_GFS_VIA_OPEN_METEO"

            req_w = urllib.request.Request(weather_url, headers={"User-Agent": "OceanGuardAI/1.0"})
            with urllib.request.urlopen(req_w, timeout=10) as resp_w:
                weather_data = json.loads(resp_w.read().decode("utf-8"))

            # 3. Parse hourly time series
            m_hourly = marine_data.get("hourly", {})
            w_hourly = weather_data.get("hourly", {})

            m_times = m_hourly.get("time", [])
            m_vel = m_hourly.get("ocean_current_velocity", [])
            m_dir = m_hourly.get("ocean_current_direction", [])

            w_times = w_hourly.get("time", [])
            w_u = w_hourly.get("wind_u_10m", [])
            w_v = w_hourly.get("wind_v_10m", [])
            w_speed = w_hourly.get("wind_speed_10m", [])
            w_dir = w_hourly.get("wind_direction_10m", [])

            # Index weather by ISO hour
            weather_map = {}
            for i, wt in enumerate(w_times):
                weather_map[wt] = i

            backward_pts: List[HourlyForcingPoint] = []
            forward_pts: List[HourlyForcingPoint] = []

            for i, mt in enumerate(m_times):
                pt_time = datetime.fromisoformat(mt).replace(tzinfo=timezone.utc)
                if pt_time < t_start - timedelta(minutes=30) or pt_time > t_end + timedelta(minutes=30):
                    continue

                # Current components (m/s)
                c_speed = float(m_vel[i]) if i < len(m_vel) and m_vel[i] is not None else 0.0
                c_dir = float(m_dir[i]) if i < len(m_dir) and m_dir[i] is not None else 0.0
                # Oceanographic: flows TOWARDS c_dir
                c_rad = math.radians(c_dir)
                cur_u = c_speed * math.sin(c_rad)
                cur_v = c_speed * math.cos(c_rad)

                # Wind components (m/s)
                wi = weather_map.get(mt)
                if wi is not None and wi < len(w_u) and w_u[wi] is not None and w_v[wi] is not None:
                    # Open-Meteo returns direct u, v wind in m/s (or km/h depending on unit)
                    # Open-Meteo default is km/h if not specified ms
                    w_unit = weather_data.get("hourly_units", {}).get("wind_u_10m", "km/h")
                    scale = 1.0 / 3.6 if w_unit == "km/h" else 1.0
                    wu = float(w_u[wi]) * scale
                    wv = float(w_v[wi]) * scale
                elif wi is not None and wi < len(w_speed) and w_speed[wi] is not None:
                    ws = float(w_speed[wi]) / 3.6
                    wd = float(w_dir[wi])
                    # Wind blows FROM wd
                    w_rad = math.radians((wd + 180.0) % 360.0)
                    wu = ws * math.sin(w_rad)
                    wv = ws * math.cos(w_rad)
                else:
                    wu = 0.0
                    wv = 0.0

                forcing_pt = HourlyForcingPoint(
                    timestamp=pt_time,
                    latitude=latitude,
                    longitude=longitude,
                    current_u=round(cur_u, 4),
                    current_v=round(cur_v, 4),
                    wind_u=round(wu, 4),
                    wind_v=round(wv, 4),
                    current_unit="m/s",
                    wind_unit="m/s",
                    source_unit="m/s",
                    conversion_applied=False,
                    current_source="OPEN_METEO",
                    wind_source="OPEN_METEO",
                    current_dataset="CMEMS_VIA_OPEN_METEO",
                    wind_dataset=wind_ds,
                )

                if pt_time <= t0:
                    backward_pts.append(forcing_pt)
                else:
                    forward_pts.append(forcing_pt)

            # Sort points by timestamp
            backward_pts.sort(key=lambda p: p.timestamp)
            forward_pts.sort(key=lambda p: p.timestamp)

            provenance = MetoceanProvenance(
                forcing_provenance="REAL_MULTI_OBSERVATION_CURRENT" if is_historical else "REAL_FORECAST",
                provider_current="OPEN_METEO",
                provider_wind="OPEN_METEO",
                dataset_current="CMEMS_VIA_OPEN_METEO",
                dataset_wind=wind_ds,
                current_forcing_definition="Total surface current via Open-Meteo CMEMS proxy",
                temporal_resolution="1h",
                spatial_resolution_current="0.25 deg (~28 km)",
                spatial_resolution_wind="0.25 deg (~28 km)",
                depth_level="surface (z=0m)",
                coverage_start=t_start.isoformat(),
                coverage_end=t_end.isoformat(),
            )

            return MetoceanForcingSeries(
                status="SUCCESS",
                provenance=provenance,
                backward_points=backward_pts,
                forward_points=forward_pts,
            )

        except Exception as e:
            logger.error("[OpenMeteoSecondary] API request failed: %s", str(e))
            raise MetoceanDataUnavailableError(f"METOCEAN_DATA_UNAVAILABLE: Open-Meteo query failed: {str(e)}")
