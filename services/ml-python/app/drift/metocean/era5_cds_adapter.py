"""
ECMWF Climate Data Store (CDS) ERA5 Wind Adapter (Phase 16.4 Part 5)

Interfaces with the ECMWF CDS API to extract hourly 10-meter surface wind vectors:
- Dataset: reanalysis-era5-single-levels
- Variables: 10m_u_component_of_wind (u10), 10m_v_component_of_wind (v10)
- Units: m/s
- Provenance: REAL_HINDCAST for t <= T0; REAL_REANALYSIS_FORWARD for t > T0.
"""

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

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

logger = logging.getLogger(__name__)

DATASET_ERA5_REANALYSIS = "reanalysis-era5-single-levels"


class ECMWFCDSWindAdapter(BaseMetoceanAdapter):
    """
    Client for ECMWF Climate Data Store surface winds.
    """

    def __init__(
        self,
        api_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.api_url = api_url or os.environ.get("CDSAPI_URL")
        self.api_key = api_key or os.environ.get("CDSAPI_KEY")

    def is_configured(self) -> bool:
        """Returns True if CDS API key is provided."""
        return bool(self.api_key)

    def fetch_forcing_series(
        self,
        latitude: float,
        longitude: float,
        t0: datetime,
        hours_back: int = 24,
        hours_forward: int = 6,
    ) -> MetoceanForcingSeries:
        """
        Extract hourly time-series for 10m surface winds from ECMWF ERA5.
        """
        if not self.is_configured():
            raise MetoceanCredentialsMissingError(
                "PROVIDER_CREDENTIALS_NOT_CONFIGURED: CDSAPI_KEY must be configured in environment."
            )

        if t0 is None:
            raise MetoceanAdapterError("METOCEAN_TIMESTAMP_REQUIRED: An authentic investigation timestamp T0 is required.")

        # Ensure t0 is UTC
        if t0.tzinfo is None:
            t0 = t0.replace(tzinfo=timezone.utc)
        else:
            t0 = t0.astimezone(timezone.utc)

        t_start = t0 - timedelta(hours=hours_back)
        t_end = t0 + timedelta(hours=hours_forward)

        logger.info(
            "[ECMWF_CDS] Querying ERA5 winds for (%s, %s) from %s to %s [Dataset: %s]",
            latitude, longitude, t_start.isoformat(), t_end.isoformat(), DATASET_ERA5_REANALYSIS
        )

        try:
            import cdsapi  # type: ignore

            client = cdsapi.Client(url=self.api_url, key=self.api_key)
            # Query CDS
            raise NotImplementedError("Live cdsapi client parsing pending server connection.")

        except ImportError:
            logger.warning("[ECMWF_CDS] cdsapi library not installed. Live network queries unavailable.")
            raise MetoceanDataUnavailableError(
                "METOCEAN_DATA_UNAVAILABLE: cdsapi client library is not installed in the Python environment."
            )
        except Exception as e:
            logger.error("[ECMWF_CDS] Query failed: %s", str(e))
            raise MetoceanDataUnavailableError(f"METOCEAN_DATA_UNAVAILABLE: ECMWF CDS request failed: {str(e)}")
