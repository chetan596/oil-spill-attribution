"""
SAR Radiometric Normalization Module.
Converts raw radar amplitudes/intensities to normalized float32 arrays in [0.0, 1.0].
"""

import numpy as np


def normalize_sar_band(band_data: np.ndarray, clip_percentiles: tuple = (1.0, 99.0)) -> np.ndarray:
    """
    Normalize a single 2D SAR band array to range [0.0, 1.0].
    Applies logarithmic/decibel scaling if linear power, followed by robust percentile clipping.

    Args:
        band_data: 2D numpy array containing SAR backscatter values.
        clip_percentiles: (low_percentile, high_percentile) for outlier suppression.

    Returns:
        Normalized 2D float32 numpy array with values in [0.0, 1.0].
    """
    arr = band_data.astype(np.float32)

    # If data has large positive dynamic range (> 255), apply log-compression: dB = 10*log10(x + eps)
    if np.max(arr) > 255.0:
        arr = np.where(arr > 0, 10.0 * np.log10(np.maximum(arr, 1e-6)), 0.0)

    # Compute robust percentile bounds (ignoring exact zeros from masking)
    valid_mask = arr > 0
    if np.any(valid_mask):
        valid_vals = arr[valid_mask]
        p_low = np.percentile(valid_vals, clip_percentiles[0])
        p_high = np.percentile(valid_vals, clip_percentiles[1])
    else:
        p_low, p_high = 0.0, 1.0

    if p_high > p_low:
        clipped = np.clip(arr, p_low, p_high)
        normalized = (clipped - p_low) / (p_high - p_low)
    else:
        normalized = np.zeros_like(arr, dtype=np.float32)

    return normalized.astype(np.float32)
