"""
Unit Tests for Aspect-Preserving Preprocessor and Overlapping Tiling Module (Phase 2A & 2B).
"""

import pytest
import numpy as np
from PIL import Image

from app.preprocessing.optical_preprocessor import (
    letterbox_image,
    reverse_letterbox_mask,
    generate_optical_tiles,
    reconstruct_optical_probability_map,
    LetterboxMetadata,
    TileMetadata,
)
from app.inference.optical_inference_engine import OpticalInferenceEngine, InferenceMode


class TestLetterboxPreprocessing:
    """Tests for Phase 2A letterbox aspect-preserving transformation and inverse mapping."""

    @pytest.mark.parametrize("orig_w, orig_h", [
        (612, 259),   # Representative failed aspect ratio (2.36:1)
        (1920, 1080), # Standard 16:9 landscape
        (1080, 1920), # Standard 9:16 portrait
        (512, 512),   # Square 1:1
        (800, 200),   # Extreme landscape 4:1
        (200, 800),   # Extreme portrait 1:4
        (4000, 3000), # Large 4:3
    ])
    def test_letterbox_preserves_aspect_ratio(self, orig_w: int, orig_h: int):
        """Verify proportional scaling and exact target canvas dimensions."""
        img = Image.new("RGB", (orig_w, orig_h), color=(100, 150, 200))
        target_size = (256, 256)

        padded_img, meta = letterbox_image(img, target_size=target_size, pad_value=0)

        # 1. Output canvas must match target size exactly
        assert padded_img.size == target_size

        # 2. Metadata integrity
        assert meta.original_width == orig_w
        assert meta.original_height == orig_h
        assert meta.target_width == target_size[0]
        assert meta.target_height == target_size[1]
        assert meta.resized_width + meta.pad_left + meta.pad_right == target_size[0]
        assert meta.resized_height + meta.pad_top + meta.pad_bottom == target_size[1]

        # 3. Content aspect ratio must be preserved within rounding tolerance
        orig_aspect = orig_w / orig_h
        resized_aspect = meta.resized_width / meta.resized_height
        assert abs(orig_aspect - resized_aspect) < 0.05

    @pytest.mark.parametrize("orig_w, orig_h", [
        (612, 259),
        (1920, 1080),
        (1080, 1920),
        (400, 300),
    ])
    def test_reverse_letterbox_restores_exact_dimensions(self, orig_w: int, orig_h: int):
        """Verify inverse letterbox mapping restores exact original image dimensions."""
        img = Image.new("RGB", (orig_w, orig_h), color=(50, 100, 150))
        target_size = (256, 256)

        padded_img, meta = letterbox_image(img, target_size=target_size)

        # Simulate a 256x256 model output probability map
        dummy_prob_map = np.full((256, 256), 0.75, dtype=np.float32)

        # Reverse map
        restored = reverse_letterbox_mask(dummy_prob_map, meta, interpolation="bilinear")

        # Must match (original_height, original_width)
        assert restored.shape == (orig_h, orig_w)
        assert restored.dtype == np.float32

    def test_reverse_letterbox_discrete_mask(self):
        """Verify reverse letterbox on discrete integer binary masks."""
        orig_w, orig_h = 612, 259
        img = Image.new("RGB", (orig_w, orig_h))
        padded_img, meta = letterbox_image(img, target_size=(256, 256))

        # Binary uint8 mask with centered box
        dummy_mask = np.zeros((256, 256), dtype=np.uint8)
        dummy_mask[100:150, 100:150] = 1

        restored_mask = reverse_letterbox_mask(dummy_mask, meta, interpolation="nearest")

        assert restored_mask.shape == (orig_h, orig_w)
        assert restored_mask.dtype == np.uint8
        assert np.max(restored_mask) == 1


class TestTiledInferencePreprocessing:
    """Tests for Phase 2B sliding window overlapping tile generation and 2D Hann reconstruction."""

    @pytest.mark.parametrize("width, height, tile_size, overlap", [
        (1024, 768, 256, 0.25),
        (612, 259, 256, 0.25),
        (2048, 2048, 512, 0.30),
        (300, 200, 256, 0.20), # Smaller than tile_size
    ])
    def test_tile_generation(self, width: int, height: int, tile_size: int, overlap: float):
        """Verify tile count, dimensions, and coordinate coverage."""
        img = Image.new("RGB", (width, height), color=(128, 128, 128))
        tiles, coords, meta = generate_optical_tiles(img, tile_size=tile_size, overlap_ratio=overlap)

        assert len(tiles) == meta.tile_count
        assert len(coords) == meta.tile_count
        assert meta.original_width == width
        assert meta.original_height == height

        for chip in tiles:
            assert chip.size == (tile_size, tile_size)

        for c in coords:
            assert c["x_max"] - c["x_min"] <= tile_size
            assert c["y_max"] - c["y_min"] <= tile_size

    def test_reconstruct_optical_probability_map(self):
        """Verify smooth reconstruction from constant probability tiles recovers exact original size."""
        width, height = 800, 600
        tile_size = 256
        overlap = 0.25

        img = Image.new("RGB", (width, height))
        tiles, coords, meta = generate_optical_tiles(img, tile_size=tile_size, overlap_ratio=overlap)

        # Simulate constant 0.90 probability for each tile
        tile_probs = [np.full((tile_size, tile_size), 0.90, dtype=np.float32) for _ in tiles]

        full_prob, recon_ms = reconstruct_optical_probability_map(
            tile_probabilities=tile_probs,
            tile_coords=coords,
            full_height=height,
            full_width=width,
            tile_size=tile_size,
            blend_window="hann"
        )

        assert full_prob.shape == (height, width)
        assert full_prob.dtype == np.float32
        assert np.all(full_prob >= 0.0) and np.all(full_prob <= 1.0)
        # Hann weighted blend of constant 0.90 must equal 0.90 everywhere
        np.testing.assert_allclose(full_prob, 0.90, atol=1e-3)
        assert recon_ms >= 0.0


class TestOpticalInferenceEngineModes:
    """Tests for OpticalInferenceEngine supporting LEGACY_V2, ASPECT_PRESERVING, and TILED modes."""

    def test_engine_modes_enum(self):
        """Verify InferenceMode enum values."""
        assert InferenceMode.LEGACY_V2.value == "LEGACY_V2"
        assert InferenceMode.ASPECT_PRESERVING.value == "ASPECT_PRESERVING"
        assert InferenceMode.TILED.value == "TILED"
