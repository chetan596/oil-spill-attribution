"""
MetOcean Wind & Hydrodynamic Feature Fusion Module — Phase V5-C.
================================================================

Handles real ECMWF ERA5 reanalysis wind vector ingestion, physical derivation,
spatial co-registration / resampling to Sentinel-1 SAR grids, and multimodal tensor construction.

Variables & Channels:
- Channel 0: Normalized SAR VV backscatter in [0.0, 1.0] (via calibrated dB clipping)
- Channel 1: Normalized SAR VH backscatter in [0.0, 1.0] (via calibrated dB clipping)
- Channel 2: Real ERA5-derived 10-m surface wind speed U10 in [0.0, 1.0]
- Channel 3: Meteorological wind direction sin(theta) in [-1.0, 1.0]
- Channel 4: Meteorological wind direction cos(theta) in [-1.0, 1.0]

Scientific Conventions & Constraints:
- Wind Speed: U10 = sqrt(u10^2 + v10^2), normalized via clip(U10, 0, 25) / 25.0
- Meteorological Wind Direction: Direction FROM which wind blows (clockwise from North):
    theta_rad = atan2(-u10, -v10) % (2 * pi)
    direction_sin = sin(theta_rad) in [-1.0, 1.0]
    direction_cos = cos(theta_rad) in [-1.0, 1.0]
- Direction sin/cos are strictly preserved in [-1.0, 1.0] (never mapped to [0, 1]).
- Spatial Resampling: Bilinear spatial interpolation of native coarse ERA5 fields
  to the high-resolution Sentinel-1 target raster grid.
- Terminology: "ERA5-derived 10-m surface wind field spatially resampled to the Sentinel-1 scene grid"
"""

from typing import Dict, Optional, Tuple, Union, Any
import numpy as np
from scipy.interpolate import RegularGridInterpolator

try:
    import torch
    HAS_TORCH = True
except (ImportError, OSError):
    HAS_TORCH = False
    torch = None

from app.preprocessing.normalization import normalize_sar_band


def derive_wind_speed(
    u10: np.ndarray,
    v10: np.ndarray
) -> np.ndarray:
    """
    Compute 10-meter scalar wind speed from eastward (u10) and northward (v10) components.

    Formula: U10 = sqrt(u10^2 + v10^2)

    Args:
        u10: Eastward wind component in m/s (numpy array)
        v10: Northward wind component in m/s (numpy array)

    Returns:
        Wind speed in m/s (float32 numpy array)
    """
    u = np.asarray(u10, dtype=np.float32)
    v = np.asarray(v10, dtype=np.float32)
    ws = np.sqrt(u**2 + v**2).astype(np.float32)
    return ws


def derive_wind_direction_meteorological(
    u10: np.ndarray,
    v10: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute meteorological wind direction (FROM which wind blows) and continuous
    circular trigonometric encodings (sin, cos).

    Convention:
        - Meteorological wind direction is measured clockwise from True North (0° = North, 90° = East).
        - Since (u10, v10) points in the direction the wind is blowing TOWARDS,
          the vector pointing FROM is (-u10, -v10).
        - theta_rad = atan2(-u10, -v10) % (2 * pi)
        - theta_deg = degrees(theta_rad) % 360.0
        - direction_sin = sin(theta_rad) in [-1.0, 1.0]
        - direction_cos = cos(theta_rad) in [-1.0, 1.0]

    Args:
        u10: Eastward wind component in m/s (numpy array)
        v10: Northward wind component in m/s (numpy array)

    Returns:
        Tuple of (direction_deg, direction_sin, direction_cos) as float32 numpy arrays.
    """
    u = np.asarray(u10, dtype=np.float32)
    v = np.asarray(v10, dtype=np.float32)

    # Meteorological direction FROM: angle of (-u, -v) relative to North (y-axis)
    # atan2(x, y) = atan2(-u, -v)
    theta_rad = np.arctan2(-u, -v) % (2.0 * np.pi)
    theta_deg = (np.degrees(theta_rad)) % 360.0

    # Continuous circular encodings in [-1.0, 1.0]
    direction_sin = np.sin(theta_rad).astype(np.float32)
    direction_cos = np.cos(theta_rad).astype(np.float32)

    # Handle calm / zero-wind singularity deterministically
    ws = np.sqrt(u**2 + v**2)
    calm_mask = ws < 1e-6
    if np.any(calm_mask):
        theta_deg[calm_mask] = 0.0
        direction_sin[calm_mask] = 0.0
        direction_cos[calm_mask] = 1.0

    return theta_deg.astype(np.float32), direction_sin, direction_cos


def normalize_wind_speed(
    wind_speed: np.ndarray,
    max_speed_ms: float = 25.0
) -> np.ndarray:
    """
    Deterministically normalize scalar wind speed to range [0.0, 1.0].

    Formula: normalized = clip(wind_speed, 0.0, max_speed_ms) / max_speed_ms

    Args:
        wind_speed: Wind speed in m/s
        max_speed_ms: Upper bound for normalization (default 25.0 m/s ~ Storm force)

    Returns:
        Normalized float32 numpy array with values in [0.0, 1.0].
    """
    arr = np.asarray(wind_speed, dtype=np.float32)
    valid_mask = np.isfinite(arr)
    normalized = np.zeros_like(arr, dtype=np.float32)
    if np.any(valid_mask):
        clipped = np.clip(arr[valid_mask], 0.0, max_speed_ms)
        normalized[valid_mask] = clipped / max_speed_ms
    return normalized


def resample_metocean_field(
    source_lats: np.ndarray,
    source_lons: np.ndarray,
    source_grid: np.ndarray,
    target_bounds: Tuple[float, float, float, float],
    target_shape: Tuple[int, int],
    method: str = "linear"
) -> np.ndarray:
    """
    Resample a native 2D MetOcean grid (e.g. ERA5 0.25 deg) to a high-resolution
    Sentinel-1 target raster grid.

    Args:
        source_lats: 1D array of native source latitudes (must be strictly ascending)
        source_lons: 1D array of native source longitudes (must be strictly ascending)
        source_grid: 2D array of shape (len(source_lats), len(source_lons))
        target_bounds: (left_lon, bottom_lat, right_lon, top_lat) in EPSG:4326
        target_shape: (height, width) of target raster
        method: Interpolation method ('linear' for bilinear, 'nearest' for nearest-neighbor)

    Returns:
        Resampled 2D float32 numpy array of shape (height, width)
    """
    left, bottom, right, top = target_bounds
    height, width = target_shape

    # Ensure source coordinate arrays are strictly ascending for RegularGridInterpolator
    s_lats = np.asarray(source_lats, dtype=np.float64)
    s_lons = np.asarray(source_lons, dtype=np.float64)
    s_grid = np.asarray(source_grid, dtype=np.float64)

    if s_lats[1] < s_lats[0]:
        s_lats = np.flip(s_lats)
        s_grid = np.flip(s_grid, axis=0)
    if s_lons[1] < s_lons[0]:
        s_lons = np.flip(s_lons)
        s_grid = np.flip(s_grid, axis=1)

    interp_fn = RegularGridInterpolator(
        (s_lats, s_lons),
        s_grid,
        method=method,
        bounds_error=False,
        fill_value=None  # Extrapolates boundary edges cleanly
    )

    # Target grid coordinates (descending lat from top to bottom, ascending lon from left to right)
    target_lats = np.linspace(top, bottom, height, dtype=np.float64)
    target_lons = np.linspace(left, right, width, dtype=np.float64)

    mesh_lats, mesh_lons = np.meshgrid(target_lats, target_lons, indexing='ij')
    target_points = np.stack([mesh_lats.ravel(), mesh_lons.ravel()], axis=-1)

    resampled = interp_fn(target_points).reshape((height, width)).astype(np.float32)
    return resampled


def build_v5c_multimodal_tensor(
    vv_data: np.ndarray,
    vh_data: np.ndarray,
    wind_speed_resampled: np.ndarray,
    wind_sin_resampled: np.ndarray,
    wind_cos_resampled: np.ndarray,
    as_torch: bool = True
) -> Union["torch.Tensor", np.ndarray]:
    """
    Construct a validated 5-channel multimodal SAR + MetOcean tensor for Phase V5-C.

    Channel Specification:
        - Channel 0: Normalized SAR VV in [0.0, 1.0]
        - Channel 1: Normalized SAR VH in [0.0, 1.0]
        - Channel 2: Normalized Wind Speed U10 in [0.0, 1.0]
        - Channel 3: Wind Direction Sin in [-1.0, 1.0]
        - Channel 4: Wind Direction Cos in [-1.0, 1.0]

    Returns:
        Tensor of shape [5, H, W] or batched [1, 5, H, W] if as_torch=True.
    """
    vv_norm = normalize_sar_band(vv_data, "VV")
    vh_norm = normalize_sar_band(vh_data, "VH")
    ws_norm = normalize_wind_speed(wind_speed_resampled)
    sin_arr = np.clip(np.asarray(wind_sin_resampled, dtype=np.float32), -1.0, 1.0)
    cos_arr = np.clip(np.asarray(wind_cos_resampled, dtype=np.float32), -1.0, 1.0)

    # Replace any potential non-finite values deterministically
    for arr in [vv_norm, vh_norm, ws_norm, sin_arr, cos_arr]:
        invalid = ~np.isfinite(arr)
        if np.any(invalid):
            arr[invalid] = 0.0

    tensor_5ch = np.stack([vv_norm, vh_norm, ws_norm, sin_arr, cos_arr], axis=0).astype(np.float32)

    if as_torch:
        if not HAS_TORCH:
            raise RuntimeError("PyTorch is not available for tensor conversion.")
        t = torch.from_numpy(tensor_5ch).unsqueeze(0)  # [1, 5, H, W]
        # Validate integrity
        assert t.shape[1] == 5, f"Expected 5 channels, got {t.shape[1]}"
        assert torch.all(torch.isfinite(t)), "V5-C tensor contains non-finite (NaN/Inf) values!"
        assert t[0, 0].min() >= 0.0 and t[0, 0].max() <= 1.0, "Channel 0 (VV) out of bounds"
        assert t[0, 1].min() >= 0.0 and t[0, 1].max() <= 1.0, "Channel 1 (VH) out of bounds"
        assert t[0, 2].min() >= 0.0 and t[0, 2].max() <= 1.0, "Channel 2 (Wind Speed) out of bounds"
        assert t[0, 3].min() >= -1.0 and t[0, 3].max() <= 1.0, "Channel 3 (Wind Sin) out of bounds"
        assert t[0, 4].min() >= -1.0 and t[0, 4].max() <= 1.0, "Channel 4 (Wind Cos) out of bounds"
        return t

    return tensor_5ch
