"""
SAR Image Tiling and Full-Scene Reconstruction Module.
Handles slicing large SAR rasters into 512x512 overlapping chips for neural network inference
and blending tile prediction probability maps back into full-resolution raster geometry.
"""

from typing import List, Tuple, Dict, Any
import numpy as np


def generate_tiles(
    raster_array: np.ndarray,
    tile_size: int = 512,
    stride: int = 448
) -> Tuple[List[np.ndarray], List[Dict[str, int]]]:
    """
    Generate overlapping patches from a multi-channel SAR image array.

    Args:
        raster_array: Array of shape (channels, height, width).
        tile_size: Square tile dimension (default 512).
        stride: Step stride between consecutive tile starts (default 448 = 64px overlap).

    Returns:
        Tuple of:
            - List of tile arrays of shape (channels, tile_size, tile_size)
            - List of tile coordinate bounding boxes dict: {x_min, y_min, x_max, y_max, pad_right, pad_bottom}
    """
    channels, height, width = raster_array.shape

    tiles: List[np.ndarray] = []
    tile_coords: List[Dict[str, int]] = []

    y_indices = list(range(0, max(1, height - tile_size + 1), stride))
    if y_indices[-1] + tile_size < height:
        y_indices.append(height - tile_size)

    x_indices = list(range(0, max(1, width - tile_size + 1), stride))
    if x_indices[-1] + tile_size < width:
        x_indices.append(width - tile_size)

    # Handle images smaller than tile_size
    if height < tile_size or width < tile_size:
        pad_bottom = max(0, tile_size - height)
        pad_right = max(0, tile_size - width)
        padded_tile = np.pad(
            raster_array,
            ((0, 0), (0, pad_bottom), (0, pad_right)),
            mode="constant",
            constant_values=0
        )
        tiles.append(padded_tile)
        tile_coords.append({
            "y_min": 0,
            "y_max": height,
            "x_min": 0,
            "x_max": width,
            "pad_bottom": pad_bottom,
            "pad_right": pad_right,
        })
        return tiles, tile_coords

    for y in y_indices:
        for x in x_indices:
            tile = raster_array[:, y : y + tile_size, x : x + tile_size]
            tiles.append(tile)
            tile_coords.append({
                "y_min": y,
                "y_max": y + tile_size,
                "x_min": x,
                "x_max": x + tile_size,
                "pad_bottom": 0,
                "pad_right": 0,
            })

    return tiles, tile_coords


def reconstruct_full_mask(
    tile_predictions: List[np.ndarray],
    tile_coords: List[Dict[str, int]],
    full_height: int,
    full_width: int,
    tile_size: int = 512
) -> np.ndarray:
    """
    Reconstruct a continuous full-resolution 2D probability map from tile predictions
    using weighted accumulation over overlapping margins.

    Args:
        tile_predictions: List of 2D prediction probability arrays of shape (tile_size, tile_size).
        tile_coords: Coordinate bounding boxes returned by generate_tiles.
        full_height: Target raster height.
        full_width: Target raster width.
        tile_size: Tile dimension.

    Returns:
        Full-resolution 2D float32 numpy array with values in [0.0, 1.0].
    """
    accum_prob = np.zeros((full_height, full_width), dtype=np.float32)
    accum_weight = np.zeros((full_height, full_width), dtype=np.float32)

    # Create a 2D Hann window for smooth margin blending
    hann_1d = np.hanning(tile_size)
    hann_2d = np.outer(hann_1d, hann_1d).astype(np.float32)
    # Clip minimum weight to 0.05 to prevent division by near-zero at corners
    hann_2d = np.maximum(hann_2d, 0.05)

    for pred, coord in zip(tile_predictions, tile_coords):
        y_min = coord["y_min"]
        y_max = coord["y_max"]
        x_min = coord["x_min"]
        x_max = coord["x_max"]
        pad_bottom = coord.get("pad_bottom", 0)
        pad_right = coord.get("pad_right", 0)

        # Slice unpadded prediction region
        valid_pred = pred[: tile_size - pad_bottom, : tile_size - pad_right]
        valid_weight = hann_2d[: tile_size - pad_bottom, : tile_size - pad_right]

        h = y_max - y_min
        w = x_max - x_min

        accum_prob[y_min:y_max, x_min:x_max] += valid_pred[:h, :w] * valid_weight[:h, :w]
        accum_weight[y_min:y_max, x_min:x_max] += valid_weight[:h, :w]

    # Normalize by accumulated weights
    valid_mask = accum_weight > 0
    full_mask = np.zeros((full_height, full_width), dtype=np.float32)
    full_mask[valid_mask] = accum_prob[valid_mask] / accum_weight[valid_mask]

    return np.clip(full_mask, 0.0, 1.0).astype(np.float32)
