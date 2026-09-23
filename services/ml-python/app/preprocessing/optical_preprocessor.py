"""
Aspect-Preserving Preprocessing and Overlapping Tile Inference Module (Phase 2A & 2B).

Provides robust, reusable image transformations for optical marine imagery:
  1. Letterbox transformation with aspect-ratio preservation and padding metadata.
  2. Inverse mapping from letterboxed model space back to exact original pixel dimensions.
  3. Sliding window overlapping tile decomposition with configurable tile sizes and overlap ratios.
  4. 2D smooth window blending (Hann window) for full-resolution probability map and mask reconstruction.
"""

from dataclasses import dataclass, asdict, field
from typing import Tuple, Dict, Any, Optional, List, Union
import time

import numpy as np
import cv2
from PIL import Image
import scipy.ndimage


@dataclass
class LetterboxMetadata:
    """Metadata tracking letterbox geometric transformation for exact inverse mapping."""
    original_width: int
    original_height: int
    resized_width: int
    resized_height: int
    target_width: int
    target_height: int
    scale: float
    pad_left: int
    pad_right: int
    pad_top: int
    pad_bottom: int
    pad_value: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TileMetadata:
    """Metadata for sliding-window tiled inference and scene reconstruction."""
    tile_count: int
    tile_size: int
    overlap_ratio: float
    stride: int
    original_width: int
    original_height: int
    tiling_time_ms: float = 0.0
    inference_time_ms: float = 0.0
    reconstruction_time_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def letterbox_image(
    image: Union[Image.Image, np.ndarray],
    target_size: Tuple[int, int] = (256, 256),
    pad_value: int = 0,
    interpolation: Any = Image.Resampling.BILINEAR
) -> Tuple[Image.Image, LetterboxMetadata]:
    """
    Resize image proportionally to fit within target_size (target_width, target_height)
    while strictly preserving the original aspect ratio, padding the remaining borders.

    Args:
        image: PIL Image or numpy array (H, W, C) or (H, W).
        target_size: Tuple of (target_width, target_height).
        pad_value: Pixel value used for padding borders (default 0 / black).
        interpolation: PIL resampling filter (default BILINEAR).

    Returns:
        Tuple of (padded_image as PIL Image, LetterboxMetadata).
    """
    if isinstance(image, np.ndarray):
        if image.ndim == 2:
            pil_img = Image.fromarray(image, mode="L")
        elif image.ndim == 3 and image.shape[2] == 3:
            pil_img = Image.fromarray(image, mode="RGB")
        elif image.ndim == 3 and image.shape[2] == 4:
            pil_img = Image.fromarray(image, mode="RGBA")
        else:
            pil_img = Image.fromarray(image)
    else:
        pil_img = image

    orig_w, orig_h = pil_img.size
    target_w, target_h = target_size

    if orig_w <= 0 or orig_h <= 0:
        raise ValueError(f"Invalid image dimensions: ({orig_w}, {orig_h})")

    # Compute scale factor preserving aspect ratio
    scale = min(target_w / orig_w, target_h / orig_h)
    resized_w = max(1, int(round(orig_w * scale)))
    resized_h = max(1, int(round(orig_h * scale)))

    # Ensure resized dimensions do not exceed target size due to rounding
    resized_w = min(resized_w, target_w)
    resized_h = min(resized_h, target_h)

    # Resize proportionally
    resized_img = pil_img.resize((resized_w, resized_h), resample=interpolation)

    # Compute padding
    pad_w = target_w - resized_w
    pad_h = target_h - resized_h
    pad_left = pad_w // 2
    pad_right = pad_w - pad_left
    pad_top = pad_h // 2
    pad_bottom = pad_h - pad_top

    # Create padded target canvas
    if pil_img.mode in ("RGB", "RGBA"):
        pad_color = (pad_value, pad_value, pad_value) if pil_img.mode == "RGB" else (pad_value, pad_value, pad_value, 255)
        padded_img = Image.new(pil_img.mode, (target_w, target_h), color=pad_color)
    elif pil_img.mode == "L":
        padded_img = Image.new("L", (target_w, target_h), color=pad_value)
    else:
        padded_img = Image.new(pil_img.mode, (target_w, target_h), color=pad_value)

    padded_img.paste(resized_img, (pad_left, pad_top))

    meta = LetterboxMetadata(
        original_width=orig_w,
        original_height=orig_h,
        resized_width=resized_w,
        resized_height=resized_h,
        target_width=target_w,
        target_height=target_h,
        scale=float(scale),
        pad_left=pad_left,
        pad_right=pad_right,
        pad_top=pad_top,
        pad_bottom=pad_bottom,
        pad_value=pad_value,
    )
    return padded_img, meta


def reverse_letterbox_mask(
    prediction_map: np.ndarray,
    metadata: LetterboxMetadata,
    interpolation: str = "bilinear"
) -> np.ndarray:
    """
    Invert letterbox padding and resize prediction map back to exact original image dimensions.

    Args:
        prediction_map: 2D numpy array of shape (target_height, target_width) or (H, W).
        metadata: LetterboxMetadata recorded during letterbox_image.
        interpolation: 'bilinear' for continuous probabilities, 'nearest' for discrete integer masks.

    Returns:
        2D numpy array of shape (original_height, original_width) with matching dtype.
    """
    if prediction_map.ndim != 2:
        raise ValueError(f"Expected 2D array, got shape {prediction_map.shape}")

    t_h, t_w = prediction_map.shape
    pad_top = metadata.pad_top
    pad_bottom = metadata.pad_bottom
    pad_left = metadata.pad_left
    pad_right = metadata.pad_right

    # Unpad coordinates
    unpad_y_max = t_h - pad_bottom if pad_bottom > 0 else t_h
    unpad_x_max = t_w - pad_right if pad_right > 0 else t_w

    unpadded_slice = prediction_map[pad_top:unpad_y_max, pad_left:unpad_x_max]

    # Handle edge case where slice is empty
    if unpadded_slice.size == 0:
        return np.zeros((metadata.original_height, metadata.original_width), dtype=prediction_map.dtype)

    is_integer = np.issubdtype(prediction_map.dtype, np.integer) or prediction_map.dtype == bool
    cv_interp = cv2.INTER_NEAREST if (is_integer or interpolation == "nearest") else cv2.INTER_LINEAR

    # Resize unpadded region back to original image dimensions
    restored = cv2.resize(
        unpadded_slice.astype(np.float32) if not is_integer else unpadded_slice.astype(np.uint8),
        (metadata.original_width, metadata.original_height),
        interpolation=cv_interp
    )

    if prediction_map.dtype == bool:
        return (restored > 0.5).astype(bool)
    elif is_integer:
        return restored.astype(prediction_map.dtype)
    else:
        return np.clip(restored, 0.0, 1.0).astype(prediction_map.dtype)


def generate_optical_tiles(
    image: Union[Image.Image, np.ndarray],
    tile_size: int = 256,
    overlap_ratio: float = 0.25
) -> Tuple[List[Image.Image], List[Dict[str, int]], TileMetadata]:
    """
    Partition arbitrary resolution optical image into overlapping square tiles.

    Args:
        image: PIL Image or numpy array.
        tile_size: Square tile dimension (e.g. 256 or 512).
        overlap_ratio: Fraction of tile size to overlap (e.g. 0.20 - 0.50, default 0.25).

    Returns:
        Tuple of:
          - List of PIL Image tiles of size (tile_size, tile_size)
          - List of coordinate bounding boxes dict: {x_min, y_min, x_max, y_max, pad_right, pad_bottom}
          - TileMetadata tracking operational metrics.
    """
    start_time = time.time()
    if isinstance(image, np.ndarray):
        if image.ndim == 2:
            pil_img = Image.fromarray(image, mode="L")
        else:
            pil_img = Image.fromarray(image, mode="RGB")
    else:
        pil_img = image

    width, height = pil_img.size
    overlap_ratio = max(0.0, min(0.75, float(overlap_ratio)))
    stride = max(1, int(round(tile_size * (1.0 - overlap_ratio))))

    tiles: List[Image.Image] = []
    tile_coords: List[Dict[str, int]] = []

    # Pad canvas if any dimension is smaller than tile_size
    pad_right_global = max(0, tile_size - width)
    pad_bottom_global = max(0, tile_size - height)

    if pad_right_global > 0 or pad_bottom_global > 0:
        padded_canvas = Image.new(pil_img.mode, (width + pad_right_global, height + pad_bottom_global), color=0)
        padded_canvas.paste(pil_img, (0, 0))
        working_img = padded_canvas
        w_work, h_work = working_img.size
    else:
        working_img = pil_img
        w_work, h_work = width, height

    y_indices = list(range(0, max(1, h_work - tile_size + 1), stride))
    if y_indices[-1] + tile_size < h_work:
        y_indices.append(h_work - tile_size)

    x_indices = list(range(0, max(1, w_work - tile_size + 1), stride))
    if x_indices[-1] + tile_size < w_work:
        x_indices.append(w_work - tile_size)

    for y in y_indices:
        for x in x_indices:
            chip = working_img.crop((x, y, x + tile_size, y + tile_size))
            tiles.append(chip)
            x_end = min(width, x + tile_size)
            y_end = min(height, y + tile_size)
            tile_coords.append({
                "x_min": x,
                "y_min": y,
                "x_max": x_end,
                "y_max": y_end,
                "pad_right": max(0, (x + tile_size) - width),
                "pad_bottom": max(0, (y + tile_size) - height),
            })

    tiling_ms = (time.time() - start_time) * 1000.0
    meta = TileMetadata(
        tile_count=len(tiles),
        tile_size=tile_size,
        overlap_ratio=overlap_ratio,
        stride=stride,
        original_width=width,
        original_height=height,
        tiling_time_ms=round(tiling_ms, 2)
    )
    return tiles, tile_coords, meta


def reconstruct_optical_probability_map(
    tile_probabilities: List[np.ndarray],
    tile_coords: List[Dict[str, int]],
    full_height: int,
    full_width: int,
    tile_size: int = 256,
    blend_window: str = "hann"
) -> Tuple[np.ndarray, float]:
    """
    Reconstruct full-resolution continuous probability map from overlapping tile predictions
    using 2D smooth window weighting to eliminate boundary seam artifacts.

    Args:
        tile_probabilities: List of 2D probability arrays of shape (tile_size, tile_size).
        tile_coords: Bounding coordinate dictionaries from generate_optical_tiles.
        full_height: Original image height.
        full_width: Original image width.
        tile_size: Tile dimension.
        blend_window: Window type ('hann', 'cosine', or 'linear').

    Returns:
        Tuple of (reconstructed 2D float32 array in [0.0, 1.0], reconstruction_time_ms).
    """
    start_time = time.time()
    accum_prob = np.zeros((full_height, full_width), dtype=np.float32)
    accum_weight = np.zeros((full_height, full_width), dtype=np.float32)

    # Generate 2D smooth weighting window
    if blend_window == "hann":
        w1d = np.hanning(tile_size)
    elif blend_window == "cosine":
        w1d = np.sin(np.linspace(0, np.pi, tile_size))
    else:
        w1d = np.ones(tile_size, dtype=np.float32)

    w2d = np.outer(w1d, w1d).astype(np.float32)
    # Ensure minimum weight floor to avoid division by zero at boundary edges
    w2d = np.maximum(w2d, 0.05)

    for pred, coord in zip(tile_probabilities, tile_coords):
        if pred.ndim != 2:
            pred = pred.squeeze()

        y_min = coord["y_min"]
        y_max = coord["y_max"]
        x_min = coord["x_min"]
        x_max = coord["x_max"]
        pad_bottom = coord.get("pad_bottom", 0)
        pad_right = coord.get("pad_right", 0)

        valid_h = tile_size - pad_bottom
        valid_w = tile_size - pad_right

        valid_pred = pred[:valid_h, :valid_w]
        valid_weight = w2d[:valid_h, :valid_w]

        target_h = y_max - y_min
        target_w = x_max - x_min

        accum_prob[y_min:y_max, x_min:x_max] += valid_pred[:target_h, :target_w] * valid_weight[:target_h, :target_w]
        accum_weight[y_min:y_max, x_min:x_max] += valid_weight[:target_h, :target_w]

    valid_mask = accum_weight > 0
    full_prob = np.zeros((full_height, full_width), dtype=np.float32)
    full_prob[valid_mask] = accum_prob[valid_mask] / accum_weight[valid_mask]

    reconstruction_ms = (time.time() - start_time) * 1000.0
    return np.clip(full_prob, 0.0, 1.0).astype(np.float32), round(reconstruction_ms, 2)
