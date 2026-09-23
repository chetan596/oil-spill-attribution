"""
Abstract Base Class for Oceanographic and Meteorological Data Adapters (Phase 16.4 Part 5)
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import List, Optional, Tuple
from app.drift.metocean.schemas import HourlyForcingPoint, MetoceanForcingSeries, MetoceanProvenance


class MetoceanAdapterError(Exception):
    """Base exception for metocean provider failures."""
    pass


class MetoceanCredentialsMissingError(MetoceanAdapterError):
    """Raised when mandatory provider credentials are not configured."""
    pass


class MetoceanDataUnavailableError(MetoceanAdapterError):
    """Raised when the provider is unreachable, out of coverage, or returns no observations."""
    pass


class BaseMetoceanAdapter(ABC):
    """
    Abstract interface for retrieving verified, time-resolved hourly
    oceanographic currents and surface winds.
    """

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if credentials and prerequisites are configured."""
        pass

    @abstractmethod
    def fetch_forcing_series(
        self,
        latitude: float,
        longitude: float,
        t0: datetime,
        hours_back: int = 24,
        hours_forward: int = 6,
    ) -> MetoceanForcingSeries:
        """
        Retrieve hourly forcing points for [t0 - hours_back, t0 + hours_forward].

        Args:
            latitude: Target centroid latitude (WGS84)
            longitude: Target centroid longitude (WGS84)
            t0: Authentic investigation timestamp (UTC)
            hours_back: Duration backwards in hours (default 24)
            hours_forward: Duration forwards in hours (default 6)

        Returns:
            MetoceanForcingSeries containing time-resolved points and provenance.
        """
        pass
