"""
Environmental MetOcean Scenario Module (Phase 5)

Defines demonstration and configurable environmental forcing parameters:
  - 10-meter surface wind vector (speed, direction, leeway coefficient)
  - Surface ocean current vector (speed, direction)
  - Validation routines for meteorological / oceanographic inputs

IMPORTANT SCIENTIFIC NOTICE:
In the absence of live real-time gridded assimilation (HYCOM/OSCAR/ERA5),
this module operates with clearly labelled DEMONSTRATION environmental forcing.
Every demonstration record is tagged `source: "demo"`.
"""

import math
from dataclasses import dataclass, field
from typing import Dict, Any, Optional

KNOTS_TO_MS = 0.514444
KNOTS_TO_KMH = 1.852
MS_TO_KNOTS = 1.0 / KNOTS_TO_MS


@dataclass
class EnvironmentalParameters:
    """MetOcean parameters governing oil slick advection."""
    wind_speed_kts: float = 12.4          # 10m surface wind speed (knots)
    wind_direction_deg: float = 315.0     # Meteorological wind direction (from 315° NW)
    current_speed_kts: float = 0.8        # Surface ocean current speed (knots)
    current_direction_deg: float = 125.0  # Oceanographic current flow direction (towards 125° SE)
    windage_leeway_factor: float = 0.030  # Standard oil leeway fraction (3.0%)
    wind_deflection_deg: float = 0.0      # Ekman/Coriolis deflection angle
    source: str = "demo"                  # Source label (demo / observed / reanalysis)
    scenario_name: str = "Arabian Sea Demonstration MetOcean Field"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def validate(self) -> None:
        """Validate parameter boundaries."""
        if self.wind_speed_kts < 0 or self.wind_speed_kts > 150:
            raise ValueError(f"Wind speed {self.wind_speed_kts} kts is out of physical bounds (0-150 kts).")
        if self.current_speed_kts < 0 or self.current_speed_kts > 20:
            raise ValueError(f"Current speed {self.current_speed_kts} kts is out of physical bounds (0-20 kts).")
        if not (0.0 <= self.windage_leeway_factor <= 0.10):
            raise ValueError(f"Windage factor {self.windage_leeway_factor} is out of realistic range (0.00-0.10).")

    def get_drift_velocity_components_kmh(self) -> tuple[float, float]:
        """
        Compute resulting Lagrangian surface drift velocity components (u_east, v_north) in km/h.

        Wind (Meteorological convention): blowing FROM direction theta_wind.
          Direction of motion = (theta_wind + 180 + deflection) mod 360.
        Current (Oceanographic convention): flowing TOWARDS direction theta_current.
          Direction of motion = theta_current.

        Returns:
            (u_kmh, v_kmh): Velocity components in km/h (Eastward, Northward).
        """
        self.validate()

        # 1. Surface Current Vector (km/h)
        current_kmh = self.current_speed_kts * KNOTS_TO_KMH
        curr_rad = math.radians(self.current_direction_deg)
        # Math angles: 0° is North (y), 90° is East (x) in navigation coordinates
        u_curr = current_kmh * math.sin(curr_rad)
        v_curr = current_kmh * math.cos(curr_rad)

        # 2. Wind Leeway Drift Vector (km/h)
        wind_kmh = self.wind_speed_kts * KNOTS_TO_KMH
        wind_drift_kmh = wind_kmh * self.windage_leeway_factor
        # Wind blowing FROM theta_wind moves slick towards (theta_wind + 180)
        wind_flow_deg = (self.wind_direction_deg + 180.0 + self.wind_deflection_deg) % 360.0
        wind_rad = math.radians(wind_flow_deg)
        u_wind = wind_drift_kmh * math.sin(wind_rad)
        v_wind = wind_drift_kmh * math.cos(wind_rad)

        # 3. Total Drift Velocity
        u_total = u_curr + u_wind
        v_total = v_curr + v_wind

        return u_total, v_total

    def to_dict(self) -> Dict[str, Any]:
        """Convert parameters to serializable dictionary."""
        u_kmh, v_kmh = self.get_drift_velocity_components_kmh()
        total_speed_kmh = math.sqrt(u_kmh**2 + v_kmh**2)
        total_speed_kts = total_speed_kmh / KNOTS_TO_KMH

        return {
            "scenario_name": self.scenario_name,
            "source": self.source,
            "wind": {
                "speed_kts": self.wind_speed_kts,
                "speed_ms": round(self.wind_speed_kts * KNOTS_TO_MS, 2),
                "direction_from_deg": self.wind_direction_deg,
                "leeway_factor": self.windage_leeway_factor,
                "deflection_deg": self.wind_deflection_deg,
            },
            "current": {
                "speed_kts": self.current_speed_kts,
                "speed_ms": round(self.current_speed_kts * KNOTS_TO_MS, 2),
                "direction_towards_deg": self.current_direction_deg,
            },
            "computed_drift_speed_kts": round(total_speed_kts, 2),
            "computed_drift_speed_kmh": round(total_speed_kmh, 2),
            "units": {
                "speed": "knots (nautical miles per hour)",
                "direction": "degrees (0-360, clockwise from True North)",
                "distance": "kilometers",
            },
            "disclaimer": "Demonstration environmental scenario for simulation validation. Not real-time observations."
        }
