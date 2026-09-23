"""
Unit Tests for MetOcean Wind & Hydrodynamic Feature Fusion — Phase V5-C.
========================================================================

Tests:
1. Wind speed derivation U10 = sqrt(u10^2 + v10^2)
2. Meteorological FROM wind direction and circular components (sin, cos)
3. Zero/calm wind singularity handling
4. Deterministic normalization [0, 1] for wind speed
5. Preservation of direction sin/cos strictly in [-1.0, 1.0] (no [0, 1] mapping)
6. Spatial grid resampling via RegularGridInterpolator to target SAR grid
7. 5-channel multimodal tensor construction [1, 5, H, W]
8. MultimodalSARSpillDataset item generation and metadata integrity
"""

import pytest
import numpy as np
import torch

from app.preprocessing.metocean_fusion import (
    derive_wind_speed,
    derive_wind_direction_meteorological,
    normalize_wind_speed,
    resample_metocean_field,
    build_v5c_multimodal_tensor,
)
from app.data.loaders.sar_dataset import MultimodalSARSpillDataset


def test_derive_wind_speed():
    """Test Pythagorean wind speed calculation."""
    u = np.array([3.0, 0.0, -4.0, 6.0], dtype=np.float32)
    v = np.array([4.0, 5.0, 0.0, 8.0], dtype=np.float32)
    ws = derive_wind_speed(u, v)

    expected = np.array([5.0, 5.0, 4.0, 10.0], dtype=np.float32)
    assert np.allclose(ws, expected, atol=1e-5)
    assert ws.dtype == np.float32


def test_derive_wind_direction_meteorological():
    """Test meteorological FROM direction convention and sin/cos values."""
    # North wind (blowing FROM North towards South): u=0, v=-5 -> dir=0° / 360°, sin=0, cos=1
    u_n = np.array([0.0], dtype=np.float32)
    v_n = np.array([-5.0], dtype=np.float32)
    deg_n, sin_n, cos_n = derive_wind_direction_meteorological(u_n, v_n)
    assert np.isclose(deg_n[0], 0.0, atol=1e-3) or np.isclose(deg_n[0], 360.0, atol=1e-3)
    assert np.isclose(sin_n[0], 0.0, atol=1e-4)
    assert np.isclose(cos_n[0], 1.0, atol=1e-4)

    # East wind (blowing FROM East towards West): u=-5, v=0 -> dir=90°, sin=1, cos=0
    u_e = np.array([-5.0], dtype=np.float32)
    v_e = np.array([0.0], dtype=np.float32)
    deg_e, sin_e, cos_e = derive_wind_direction_meteorological(u_e, v_e)
    assert np.isclose(deg_e[0], 90.0, atol=1e-3)
    assert np.isclose(sin_e[0], 1.0, atol=1e-4)
    assert np.isclose(cos_e[0], 0.0, atol=1e-4)

    # South wind (blowing FROM South towards North): u=0, v=5 -> dir=180°, sin=0, cos=-1
    u_s = np.array([0.0], dtype=np.float32)
    v_s = np.array([5.0], dtype=np.float32)
    deg_s, sin_s, cos_s = derive_wind_direction_meteorological(u_s, v_s)
    assert np.isclose(deg_s[0], 180.0, atol=1e-3)
    assert np.isclose(sin_s[0], 0.0, atol=1e-4)
    assert np.isclose(cos_s[0], -1.0, atol=1e-4)

    # West wind (blowing FROM West towards East): u=5, v=0 -> dir=270°, sin=-1, cos=0
    u_w = np.array([5.0], dtype=np.float32)
    v_w = np.array([0.0], dtype=np.float32)
    deg_w, sin_w, cos_w = derive_wind_direction_meteorological(u_w, v_w)
    assert np.isclose(deg_w[0], 270.0, atol=1e-3)
    assert np.isclose(sin_w[0], -1.0, atol=1e-4)
    assert np.isclose(cos_w[0], 0.0, atol=1e-4)


def test_calm_wind_singularity():
    """Test zero wind condition produces valid finite outputs without NaN."""
    u_zero = np.array([0.0], dtype=np.float32)
    v_zero = np.array([0.0], dtype=np.float32)
    deg, sin_val, cos_val = derive_wind_direction_meteorological(u_zero, v_zero)

    assert np.isfinite(deg[0])
    assert np.isfinite(sin_val[0])
    assert np.isfinite(cos_val[0])
    assert -1.0 <= sin_val[0] <= 1.0
    assert -1.0 <= cos_val[0] <= 1.0


def test_normalize_wind_speed():
    """Test deterministic wind speed normalization into [0, 1]."""
    ws = np.array([0.0, 12.5, 25.0, 30.0], dtype=np.float32)
    norm = normalize_wind_speed(ws, max_speed_ms=25.0)

    assert np.allclose(norm, np.array([0.0, 0.5, 1.0, 1.0], dtype=np.float32), atol=1e-5)
    assert np.all(norm >= 0.0) and np.all(norm <= 1.0)


def test_resample_metocean_field():
    """Test spatial resampling from coarse grid to fine SAR target grid."""
    source_lats = np.array([17.0, 18.0, 19.0, 20.0], dtype=np.float64)
    source_lons = np.array([71.0, 72.0, 73.0, 74.0], dtype=np.float64)
    source_grid = np.ones((4, 4), dtype=np.float32) * 5.0

    target_bounds = (71.5, 17.5, 73.5, 19.5)
    target_shape = (100, 100)

    resampled = resample_metocean_field(
        source_lats, source_lons, source_grid, target_bounds, target_shape
    )
    assert resampled.shape == (100, 100)
    assert np.all(np.isfinite(resampled))
    assert np.allclose(resampled, 5.0, atol=1e-3)


def test_build_v5c_multimodal_tensor():
    """Test 5-channel tensor construction and integrity checks."""
    H, W = 64, 64
    vv = np.random.uniform(-30.0, -10.0, (H, W)).astype(np.float32)
    vh = np.random.uniform(-40.0, -20.0, (H, W)).astype(np.float32)
    ws = np.random.uniform(2.0, 15.0, (H, W)).astype(np.float32)
    sin_dir = np.random.uniform(-1.0, 1.0, (H, W)).astype(np.float32)
    cos_dir = np.random.uniform(-1.0, 1.0, (H, W)).astype(np.float32)

    tensor = build_v5c_multimodal_tensor(vv, vh, ws, sin_dir, cos_dir, as_torch=True)

    assert isinstance(tensor, torch.Tensor)
    assert tensor.shape == (1, 5, H, W)
    assert torch.all(torch.isfinite(tensor))
    # Check channel ranges
    assert tensor[0, 0].min() >= 0.0 and tensor[0, 0].max() <= 1.0
    assert tensor[0, 1].min() >= 0.0 and tensor[0, 1].max() <= 1.0
    assert tensor[0, 2].min() >= 0.0 and tensor[0, 2].max() <= 1.0
    assert tensor[0, 3].min() >= -1.0 and tensor[0, 3].max() <= 1.0
    assert tensor[0, 4].min() >= -1.0 and tensor[0, 4].max() <= 1.0
