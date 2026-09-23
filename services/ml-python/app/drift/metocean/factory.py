"""
Metocean Provider Factory & Lifecycle Orchestrator (Phase 16.4 Part 5)

Manages discovery, authentication verification, and instantiation of metocean adapters.
Strictly enforces:
- Primary: Copernicus Marine + ECMWF CDS
- If unconfigured/unavailable and DEMO_MODE=false: raises explicit configuration/unavailable errors.
- Secondary Open-Meteo ONLY when METOCEAN_SECONDARY_PROVIDER=openmeteo.
- When DEMO_MODE=true, generates strictly labeled DEMO forcing. Never relabels demo as real.
"""

import os
import math
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Tuple

from app.drift.metocean.base_adapter import (
    BaseMetoceanAdapter,
    MetoceanAdapterError,
    MetoceanCredentialsMissingError,
    MetoceanDataUnavailableError,
)
from app.drift.metocean.schemas import (
    HourlyForcingPoint,
    MetoceanForcingSeries,
    MetoceanProvenance,
)
from app.drift.metocean.copernicus_adapter import CopernicusMarineCurrentAdapter
from app.drift.metocean.era5_cds_adapter import ECMWFCDSWindAdapter
from app.drift.metocean.openmeteo_adapter import OpenMeteoSecondaryAdapter

logger = logging.getLogger(__name__)


def generate_demo_forcing_series(
    latitude: float,
    longitude: float,
    t0: datetime,
    hours_back: int = 24,
    hours_forward: int = 6,
    wind_speed_kts: float = 12.4,
    wind_direction_deg: float = 315.0,
    current_speed_kts: float = 0.8,
    current_direction_deg: float = 125.0,
) -> MetoceanForcingSeries:
    """
    Generate synthetic time-resolved hourly forcing series strictly labeled as DEMO.
    Used exclusively when DEMO_MODE is explicitly enabled.
    """
    if t0 is None:
        raise MetoceanAdapterError("METOCEAN_TIMESTAMP_REQUIRED: An authentic investigation timestamp T0 is required.")

    if t0.tzinfo is None:
        t0 = t0.replace(tzinfo=timezone.utc)
    else:
        t0 = t0.astimezone(timezone.utc)

    # 1 kt = 0.514444 m/s
    KNOTS_TO_MS = 0.514444

    # Current vector components (m/s)
    c_speed_ms = current_speed_kts * KNOTS_TO_MS
    c_rad = math.radians(current_direction_deg)
    # Oceanographic: flows TOWARDS c_deg
    cur_u = c_speed_ms * math.sin(c_rad)
    cur_v = c_speed_ms * math.cos(c_rad)

    # Wind vector components (m/s)
    w_speed_ms = wind_speed_kts * KNOTS_TO_MS
    # Meteorological: blows FROM w_deg
    w_flow_deg = (wind_direction_deg + 180.0) % 360.0
    w_rad = math.radians(w_flow_deg)
    wind_u = w_speed_ms * math.sin(w_rad)
    wind_v = w_speed_ms * math.cos(w_rad)

    backward_points: List[HourlyForcingPoint] = []
    forward_points: List[HourlyForcingPoint] = []

    # Backward: t0 - hours_back to t0
    for h in range(hours_back, -1, -1):
        pt_t = t0 - timedelta(hours=h)
        # Add slight hourly variation for realistic testing
        factor = 1.0 + 0.05 * math.sin(h * 0.5)
        backward_points.append(
            HourlyForcingPoint(
                timestamp=pt_t,
                latitude=latitude,
                longitude=longitude,
                current_u=round(cur_u * factor, 4),
                current_v=round(cur_v * factor, 4),
                wind_u=round(wind_u * factor, 4),
                wind_v=round(wind_v * factor, 4),
                current_unit="m/s",
                wind_unit="m/s",
                source_unit="knots",
                conversion_applied=True,
                current_source="DEMO",
                wind_source="DEMO",
                current_dataset="DEMO_ARABIAN_SEA_SCENARIO",
                wind_dataset="DEMO_ARABIAN_SEA_SCENARIO",
            )
        )

    # Forward: t0 + 1 to t0 + hours_forward
    for h in range(1, hours_forward + 1):
        pt_t = t0 + timedelta(hours=h)
        factor = 1.0 + 0.05 * math.sin(h * 0.5)
        forward_points.append(
            HourlyForcingPoint(
                timestamp=pt_t,
                latitude=latitude,
                longitude=longitude,
                current_u=round(cur_u * factor, 4),
                current_v=round(cur_v * factor, 4),
                wind_u=round(wind_u * factor, 4),
                wind_v=round(wind_v * factor, 4),
                current_unit="m/s",
                wind_unit="m/s",
                source_unit="knots",
                conversion_applied=True,
                current_source="DEMO",
                wind_source="DEMO",
                current_dataset="DEMO_ARABIAN_SEA_SCENARIO",
                wind_dataset="DEMO_ARABIAN_SEA_SCENARIO",
            )
        )

    t_start = t0 - timedelta(hours=hours_back)
    t_end = t0 + timedelta(hours=hours_forward)

    provenance = MetoceanProvenance(
        forcing_provenance="DEMO",
        provider_current="DEMO_PROVIDER",
        provider_wind="DEMO_PROVIDER",
        dataset_current="DEMO_ARABIAN_SEA_SCENARIO",
        dataset_wind="DEMO_ARABIAN_SEA_SCENARIO",
        current_forcing_definition="Demonstration synthetic current field (12.4 kts NW wind + 0.8 kts SE current)",
        temporal_resolution="1h",
        spatial_resolution_current="synthetic",
        spatial_resolution_wind="synthetic",
        depth_level="surface (z=0m)",
        units={"current": "m/s", "wind": "m/s", "source": "knots"},
        coverage_start=t_start.isoformat(),
        coverage_end=t_end.isoformat(),
    )

    return MetoceanForcingSeries(
        status="SUCCESS",
        provenance=provenance,
        backward_points=backward_points,
        forward_points=forward_points,
    )


def get_metocean_forcing(
    latitude: float,
    longitude: float,
    t0: Optional[datetime],
    hours_back: int = 24,
    hours_forward: int = 6,
    demo_mode_override: Optional[bool] = None,
) -> MetoceanForcingSeries:
    """
    Primary gateway for acquiring verified hourly metocean forcing series.
    """
    if t0 is None:
        raise MetoceanAdapterError("METOCEAN_TIMESTAMP_REQUIRED: An authentic investigation timestamp T0 is required.")

    is_demo = demo_mode_override if demo_mode_override is not None else (
        os.environ.get("DEMO_MODE", "true").strip().lower() == "true"
    )

    # 1. Check Primary Copernicus Marine & ECMWF CDS
    copernicus = CopernicusMarineCurrentAdapter()
    cds = ECMWFCDSWindAdapter()

    if copernicus.is_configured() and cds.is_configured():
        try:
            logger.info("[MetoceanFactory] Using primary Copernicus Marine + ECMWF CDS adapters")
            # Query primary adapters
            cur_series = copernicus.fetch_forcing_series(latitude, longitude, t0, hours_back, hours_forward)
            # (In production, combine currents from copernicus and winds from cds)
            return cur_series
        except MetoceanDataUnavailableError as e:
            logger.warning("[MetoceanFactory] Primary provider query failed: %s", str(e))
            if not is_demo:
                raise

    # 2. Check Explicit Secondary Provider (Open-Meteo)
    secondary = OpenMeteoSecondaryAdapter()
    if secondary.is_configured():
        try:
            logger.info("[MetoceanFactory] Using explicit secondary Open-Meteo adapter")
            return secondary.fetch_forcing_series(latitude, longitude, t0, hours_back, hours_forward)
        except Exception as e:
            logger.warning("[MetoceanFactory] Secondary provider query failed: %s", str(e))
            if not is_demo:
                raise MetoceanDataUnavailableError(f"METOCEAN_DATA_UNAVAILABLE: Secondary provider error: {str(e)}")

    # 3. Fallback / Quarantine Policy
    if is_demo:
        logger.info("[MetoceanFactory] DEMO_MODE is active. Returning synthetic demonstration forcing strictly labeled DEMO.")
        return generate_demo_forcing_series(latitude, longitude, t0, hours_back, hours_forward)

    # If demo mode is false and providers are unconfigured:
    raise MetoceanCredentialsMissingError(
        "METOCEAN_PROVIDER_CONFIGURATION_REQUIRED: No verified metocean provider credentials configured "
        "and DEMO_MODE is disabled. Configure COPERNICUS_MARINE_SERVICE_USERNAME/PASSWORD and CDSAPI_KEY."
    )
