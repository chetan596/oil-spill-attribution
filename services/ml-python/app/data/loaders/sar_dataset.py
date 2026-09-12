"""
SAR Oil Spill PyTorch Dataset — Phase 3C
==========================================

SARSpillDataset: A manifest-driven PyTorch Dataset for Sentinel-1 (and synthetic)
SAR segmentation scenes.

Design principles:
  - Scene-level (not tile-level) loading: loads a full scene, then returns tiles
    on demand, ensuring no scene appears in multiple splits.
  - Supports binary and multi-class segmentation modes.
  - Supports VV and VV+VH (dual-polarization) inputs.
  - Applies optional augmentations (horizontal flip, vertical flip, 90° rotation)
    using only numpy (no albumentations dependency).
  - Returns (image_tensor, mask_tensor, metadata) tuples.

Usage:
    from app.data.loaders.sar_dataset import SARSpillDataset
    from torch.utils.data import DataLoader

    ds = SARSpillDataset(
        manifest_path="data/samples/synthetic/dataset_manifest.json",
        split="train",
        mode="binary",
        tile_size=512,
        augment=True,
    )
    loader = DataLoader(ds, batch_size=4, shuffle=True, num_workers=0)
    for images, masks, metas in loader:
        # images: (B, C, H, W)   float32 in [0, 1]
        # masks:  (B, H, W)      int64
        ...

NOTE: This Dataset does NOT perform scene-level splitting. Use
generate_splits.py to assign 'split' values in the manifest first.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    import torch
    from torch.utils.data import Dataset
    HAS_TORCH = True
except (ImportError, OSError):
    HAS_TORCH = False
    torch = None
    class Dataset:  # type: ignore
        pass

try:
    import rasterio
except ImportError:
    raise ImportError("rasterio is required. Install with: pip install rasterio>=1.3.9")

from app.preprocessing.normalization import normalize_sar_band


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_VALID_SPLITS = {"train", "val", "test", None}


class SARDatasetError(Exception):
    """Raised for dataset configuration or file access errors."""
    pass


class SARSpillDataset(Dataset):
    """
    PyTorch Dataset for SAR marine oil spill semantic segmentation.

    Args:
        manifest_path:    Path to dataset_manifest.json.
        split:            One of "train", "val", "test", or None (load all).
                          Scenes whose manifest 'split' field does not match are excluded.
        mode:             "binary"     → mask values are {0, 1} regardless of source classes.
                          "multiclass" → mask values are preserved as-is.
        tile_size:        If not None, each loaded scene is tiled into (tile_size × tile_size)
                          patches with no overlap (simple grid crop, stride == tile_size).
                          If None, the full scene is returned as-is.
        stride:           Tile stride when tile_size is set. Default equals tile_size (no overlap).
        augment:          If True, apply random horizontal/vertical flip and 90° rotation.
        polarization:     "VV" (1 channel), "VH" (1 channel), or "dual"/"VV+VH" (2 channels).
                          If the scene has only one band, dual-pol falls back to single VV.
        binary_spill_class: Integer class ID considered as "oil spill" for binary mode.
                            Default 1. Pixels == this value become 1; all others become 0.
    """

    def __init__(
        self,
        manifest_path: str,
        split: Optional[str] = None,
        mode: str = "binary",
        tile_size: Optional[int] = 512,
        stride: Optional[int] = None,
        augment: bool = False,
        polarization: str = "VV",
        binary_spill_class: int = 1,
    ) -> None:
        if split not in _VALID_SPLITS:
            raise SARDatasetError(f"split='{split}' is invalid. Use 'train', 'val', 'test', or None.")
        if mode not in ("binary", "multiclass"):
            raise SARDatasetError(f"mode='{mode}' is invalid. Use 'binary' or 'multiclass'.")

        self.manifest_path = os.path.abspath(manifest_path)
        self.split = split
        self.mode = mode
        self.tile_size = tile_size
        self.stride = stride if stride is not None else (tile_size or 512)
        self.augment = augment
        self.polarization = polarization.upper().replace("+", "").replace(" ", "")
        self.binary_spill_class = binary_spill_class

        self._scenes: List[Dict[str, Any]] = self._load_manifest()
        self._items: List[Dict[str, Any]] = self._build_item_index()
        self._cache: Dict[str, Tuple[np.ndarray, np.ndarray, Dict[str, Any]]] = {}

    # ── Manifest ─────────────────────────────────────────────────────────────

    def _load_manifest(self) -> List[Dict[str, Any]]:
        if not os.path.isfile(self.manifest_path):
            raise SARDatasetError(f"Manifest not found: {self.manifest_path}")
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        source = manifest.get("source", "unknown")
        if source == "synthetic_test":
            print(
                "[SARSpillDataset] WARNING: Loading SYNTHETIC test data. "
                "Do NOT use for model accuracy evaluation."
            )

        scenes = manifest.get("scenes", [])
        if self.split is not None:
            scenes = [s for s in scenes if s.get("split") == self.split]
        if not scenes:
            print(
                f"[SARSpillDataset] WARNING: No scenes found for split='{self.split}'. "
                "Check that generate_splits.py has been run on this manifest."
            )
        return scenes

    # ── Item index ────────────────────────────────────────────────────────────

    def _build_item_index(self) -> List[Dict[str, Any]]:
        """
        Build a flat list of (scene, tile_offset) items.

        If tile_size is None → one item per scene.
        If tile_size is set  → items are tile (y, x) offsets within each scene.
        """
        items: List[Dict[str, Any]] = []
        for scene in self._scenes:
            w: int = scene.get("width", 0)
            h: int = scene.get("height", 0)
            if self.tile_size is None or w == 0 or h == 0:
                items.append({"scene": scene, "y": 0, "x": 0, "tiled": False})
            else:
                ts = self.tile_size
                st = self.stride
                ys = list(range(0, max(1, h - ts + 1), st))
                if not ys or ys[-1] + ts < h:
                    ys.append(max(0, h - ts))
                xs = list(range(0, max(1, w - ts + 1), st))
                if not xs or xs[-1] + ts < w:
                    xs.append(max(0, w - ts))
                for y in ys:
                    for x in xs:
                        items.append({"scene": scene, "y": y, "x": x, "tiled": True})
        return items

    # ── Dataset interface ─────────────────────────────────────────────────────

    def __len__(self) -> int:
        return len(self._items)

    def __getitem__(self, idx: int) -> Tuple[Any, Any, Dict[str, Any]]:
        item = self._items[idx]
        scene = item["scene"]
        y_off = item["y"]
        x_off = item["x"]

        # Load image & mask (with in-memory scene caching)
        scene_key = scene.get("scene_id") or scene.get("image_path", "")
        if scene_key in self._cache:
            image_arr, mask_arr, img_meta = self._cache[scene_key]
        else:
            image_arr, img_meta = self._load_image(scene)
            mask_arr = self._load_mask(scene, img_meta)
            self._cache[scene_key] = (image_arr, mask_arr, img_meta)

        # Crop tile
        if item["tiled"] and self.tile_size is not None:
            ts = self.tile_size
            h, w = image_arr.shape[1], image_arr.shape[2]
            y1 = y_off
            y2 = min(y_off + ts, h)
            x1 = x_off
            x2 = min(x_off + ts, w)
            image_arr = self._pad_to_tile(image_arr[:, y1:y2, x1:x2], ts)
            mask_arr = self._pad_to_tile_2d(mask_arr[y1:y2, x1:x2], ts)

        # Augmentation
        if self.augment:
            image_arr, mask_arr = self._augment(image_arr, mask_arr)

        # Mode conversion
        if self.mode == "binary":
            binary_mask = (mask_arr == self.binary_spill_class).astype(np.int64)
            mask_tensor = torch.from_numpy(binary_mask).long() if (HAS_TORCH and torch is not None) else binary_mask
        else:
            mask_tensor = torch.from_numpy(mask_arr.astype(np.int64)).long() if (HAS_TORCH and torch is not None) else mask_arr.astype(np.int64)

        image_tensor = torch.from_numpy(image_arr).float() if (HAS_TORCH and torch is not None) else image_arr.astype(np.float32)

        metadata: Dict[str, Any] = {
            "scene_id": scene.get("scene_id", ""),
            "source": scene.get("source", "unknown"),
            "split": scene.get("split"),
            "polarization": scene.get("polarization", "VV"),
            "crs": scene.get("crs"),
            "tile_offset": [y_off, x_off],
            "mode": self.mode,
        }
        if scene.get("source") == "synthetic_test":
            metadata["WARNING"] = "SYNTHETIC DATA — not real Sentinel-1 imagery"

        return image_tensor, mask_tensor, metadata

    def _resolve_scene_path(self, path: str) -> str:
        if not path:
            return path
        if os.path.isfile(path):
            return path
        manifest_dir = os.path.dirname(self.manifest_path)
        cand1 = os.path.join(manifest_dir, path)
        if os.path.isfile(cand1):
            return cand1
        cand2 = os.path.join(manifest_dir, os.path.basename(path))
        if os.path.isfile(cand2):
            return cand2
        return path

    # ── Image loading ─────────────────────────────────────────────────────────

    def _load_image(self, scene: Dict[str, Any]) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Load and normalize SAR GeoTIFF. Returns (channels, H, W) float32 array."""
        raw_path = scene.get("image_path", "")
        path = self._resolve_scene_path(raw_path)
        if not os.path.isfile(path):
            raise SARDatasetError(f"Image file not found: '{raw_path}'")

        try:
            with rasterio.open(path) as src:
                band_count = src.count
                metadata = {
                    "width": src.width,
                    "height": src.height,
                    "band_count": band_count,
                    "crs": src.crs.to_string() if src.crs else None,
                    "transform": list(src.transform),
                    "nodata": src.nodata,
                }

                pol = self.polarization
                if pol in ("DUAL", "VVVH") and band_count >= 2:
                    band1 = src.read(1)
                    band2 = src.read(2)
                    bands = [band1, band2]
                else:
                    bands = [src.read(1)]

        except Exception as exc:
            raise SARDatasetError(f"Failed to read '{path}': {exc}") from exc

        processed = []
        for band in bands:
            clean = np.nan_to_num(band.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
            nodata = metadata.get("nodata")
            if nodata is not None:
                clean = np.where(clean == nodata, 0.0, clean)
            processed.append(normalize_sar_band(clean))

        return np.stack(processed, axis=0).astype(np.float32), metadata

    # ── Mask loading ──────────────────────────────────────────────────────────

    def _load_mask(self, scene: Dict[str, Any], img_meta: Dict[str, Any]) -> np.ndarray:
        """Load ground-truth mask. Returns (H, W) uint8 array."""
        raw_path = scene.get("mask_path", "")
        path = self._resolve_scene_path(raw_path)

        if not path or not os.path.isfile(path):
            # No mask available → return zeros matching image dimensions
            h = img_meta.get("height", scene.get("height", 512))
            w = img_meta.get("width", scene.get("width", 512))
            return np.zeros((h, w), dtype=np.uint8)

        ext = os.path.splitext(path)[1].lower()
        try:
            if ext == ".npy":
                mask = np.load(path).astype(np.uint8)
            else:
                try:
                    from PIL import Image as PILImage  # noqa: PLC0415
                    mask = np.array(PILImage.open(path)).astype(np.uint8)
                except ImportError:
                    with rasterio.open(path) as msrc:
                        mask = msrc.read(1).astype(np.uint8)
        except Exception as exc:
            raise SARDatasetError(f"Failed to read mask '{path}': {exc}") from exc

        if mask.ndim != 2:
            raise SARDatasetError(
                f"Mask must be 2D [H, W], got shape {mask.shape} for '{path}'."
            )
        return mask

    # ── Tile padding ──────────────────────────────────────────────────────────

    @staticmethod
    def _pad_to_tile(arr: np.ndarray, tile_size: int) -> np.ndarray:
        """Pad (C, H, W) array to (C, tile_size, tile_size) with zero-padding."""
        c, h, w = arr.shape
        ph = max(0, tile_size - h)
        pw = max(0, tile_size - w)
        return np.pad(arr, ((0, 0), (0, ph), (0, pw)), mode="constant", constant_values=0.0)

    @staticmethod
    def _pad_to_tile_2d(arr: np.ndarray, tile_size: int) -> np.ndarray:
        """Pad (H, W) mask to (tile_size, tile_size) with zero-padding."""
        h, w = arr.shape
        ph = max(0, tile_size - h)
        pw = max(0, tile_size - w)
        return np.pad(arr, ((0, ph), (0, pw)), mode="constant", constant_values=0)

    # ── Augmentation ──────────────────────────────────────────────────────────

    @staticmethod
    def _augment(
        image: np.ndarray,
        mask: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Apply spatially consistent random augmentation.
        Uses numpy only — no additional library dependencies.

        Augmentations applied (each with p=0.5):
          - Horizontal flip
          - Vertical flip
          - 90° rotation (0, 90, 180, or 270°)
        """
        rng = np.random.default_rng()

        # Horizontal flip
        if rng.random() < 0.5:
            image = np.flip(image, axis=2).copy()
            mask = np.flip(mask, axis=1).copy()

        # Vertical flip
        if rng.random() < 0.5:
            image = np.flip(image, axis=1).copy()
            mask = np.flip(mask, axis=0).copy()

        # Random 90° rotation (k=0,1,2,3 → 0°,90°,180°,270°)
        k = rng.integers(0, 4)
        if k > 0:
            image = np.rot90(image, k=k, axes=(1, 2)).copy()
            mask = np.rot90(mask, k=k, axes=(0, 1)).copy()

        return image, mask

    # ── Info ──────────────────────────────────────────────────────────────────

    def info(self) -> Dict[str, Any]:
        """Return a summary of dataset configuration."""
        return {
            "manifest_path": self.manifest_path,
            "split": self.split,
            "mode": self.mode,
            "tile_size": self.tile_size,
            "stride": self.stride,
            "augment": self.augment,
            "polarization": self.polarization,
            "num_scenes": len(self._scenes),
            "num_items": len(self._items),
        }
