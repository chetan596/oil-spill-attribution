"""
SAR Radiometric Normalization Module.
Converts calibrated Sentinel-1 SAR Sigma0 (dB) backscatter or linear power to normalized float32 arrays in [0.0, 1.0].
"""

from typing import Optional, Tuple, Dict
import numpy as np


# Default scientific calibration ranges for Sentinel-1 C-Band SAR in decibels (dB)
DEFAULT_DB_BOUNDS: Dict[str, Tuple[float, float]] = {
    "VV": (-35.0, -5.0),
    "VH": (-45.0, -15.0),
    "DEFAULT": (-35.0, -5.0),
}
DB_NORMALIZATION_RANGES = DEFAULT_DB_BOUNDS

# Explicit versioned contract for Sentinel-1 calibrated dB preprocessing
SENTINEL1_PREPROCESSING_CONTRACT_V1 = {
    "identifier": "sentinel1_sigma0_db_v1",
    "vv_min_db": -35.0,
    "vv_max_db": -5.0,
    "vh_min_db": -45.0,
    "vh_max_db": -15.0,
    "formula": "clip((x - min_db) / (max_db - min_db), 0.0, 1.0)",
    "channel_order": ["VV", "VH"],
}


def preprocess_sentinel1_scene(
    vv_array: np.ndarray,
    vh_array: np.ndarray,
    nodata: Optional[float] = None,
) -> np.ndarray:
    """
    Preprocess a 2-channel Sentinel-1 SAR scene into a normalized float32 tensor of shape (2, H, W).
    Channel 0: VV normalized [-35, -5] dB -> [0.0, 1.0]
    Channel 1: VH normalized [-45, -15] dB -> [0.0, 1.0]
    """
    vv_norm = normalize_sar_band(vv_array, polarization="VV", nodata=nodata)
    vh_norm = normalize_sar_band(vh_array, polarization="VH", nodata=nodata)
    return np.stack([vv_norm, vh_norm], axis=0).astype(np.float32)


def normalize_sar_band(
    band_data: np.ndarray,
    polarization: str = "VV",
    min_db: Optional[float] = None,
    max_db: Optional[float] = None,
    clip_percentiles: Optional[Tuple[float, float]] = None,
    nodata: Optional[float] = None,
) -> np.ndarray:
    """
    Normalize a single 2D SAR band array to range [0.0, 1.0].

    For calibrated Sentinel-1 Sigma0 in decibels (dB):
      - VV: [-35 dB, -5 dB] -> [0.0, 1.0]
      - VH: [-45 dB, -15 dB] -> [0.0, 1.0]
      Formula: normalized = np.clip((value - min_db) / (max_db - min_db), 0.0, 1.0)

    Args:
        band_data: 2D numpy array containing SAR backscatter values.
        polarization: "VV", "VH", or other band identifier.
        min_db: Optional explicit lower dB bound.
        max_db: Optional explicit upper dB bound.
        clip_percentiles: Optional (low, high) percentiles for fallback adaptive normalization.
        nodata: Optional nodata value to mask.

    Returns:
        Normalized 2D float32 numpy array with values in [0.0, 1.0].
    """
    arr = band_data.astype(np.float32)

    # Validity mask: finite values not equal to nodata
    valid_mask = np.isfinite(arr)
    if nodata is not None:
        valid_mask &= (arr != nodata)

    if not np.any(valid_mask):
        return np.zeros_like(arr, dtype=np.float32)

    # Determine whether input is linear power with high dynamic range (> 255)
    # If linear power, convert to dB = 10 * log10(max(x, 1e-6))
    max_val = float(np.nanmax(arr[valid_mask]))
    min_val = float(np.nanmin(arr[valid_mask]))
    if max_val > 255.0 and min_val >= 0:
        arr = np.where(valid_mask & (arr > 0), 10.0 * np.log10(np.maximum(arr, 1e-6)), -50.0)

    # Select dB bounds
    pol_key = polarization.upper().strip() if isinstance(polarization, str) else "VV"
    default_min, default_max = DEFAULT_DB_BOUNDS.get(pol_key, DEFAULT_DB_BOUNDS["DEFAULT"])
    low_bound = min_db if min_db is not None else default_min
    high_bound = max_db if max_db is not None else default_max

    # Fallback to adaptive percentiles if explicitly requested
    if clip_percentiles is not None:
        valid_vals = arr[valid_mask]
        low_bound = float(np.percentile(valid_vals, clip_percentiles[0]))
        high_bound = float(np.percentile(valid_vals, clip_percentiles[1]))

    if high_bound > low_bound:
        clipped = np.clip(arr, low_bound, high_bound)
        normalized = (clipped - low_bound) / (high_bound - low_bound)
    else:
        normalized = np.zeros_like(arr, dtype=np.float32)

    # Mask non-valid pixels to 0.0
    normalized = np.where(valid_mask, normalized, 0.0)
    return normalized.astype(np.float32)
