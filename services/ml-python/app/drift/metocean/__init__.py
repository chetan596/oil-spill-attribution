"""
Metocean Package Initialization (Phase 16.4 Part 5)
"""

from app.drift.metocean.schemas import (
    HourlyForcingPoint,
    MetoceanProvenance,
    MetoceanForcingSeries,
)
from app.drift.metocean.base_adapter import (
    BaseMetoceanAdapter,
    MetoceanAdapterError,
    MetoceanCredentialsMissingError,
    MetoceanDataUnavailableError,
)
from app.drift.metocean.copernicus_adapter import CopernicusMarineCurrentAdapter
from app.drift.metocean.era5_cds_adapter import ECMWFCDSWindAdapter
from app.drift.metocean.openmeteo_adapter import OpenMeteoSecondaryAdapter
from app.drift.metocean.factory import get_metocean_forcing, generate_demo_forcing_series

__all__ = [
    "HourlyForcingPoint",
    "MetoceanProvenance",
    "MetoceanForcingSeries",
    "BaseMetoceanAdapter",
    "MetoceanAdapterError",
    "MetoceanCredentialsMissingError",
    "MetoceanDataUnavailableError",
    "CopernicusMarineCurrentAdapter",
    "ECMWFCDSWindAdapter",
    "OpenMeteoSecondaryAdapter",
    "get_metocean_forcing",
    "generate_demo_forcing_series",
]
