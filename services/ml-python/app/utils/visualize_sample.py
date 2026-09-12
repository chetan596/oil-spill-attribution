"""
SAR Sample Visualizer — Phase 3C
==================================

Produces a 3-panel visualization for each SAR scene:
  1. SAR backscatter image (normalized, single VV band)
  2. Ground-truth mask (binary or multi-class, colour-coded)
  3. Overlay (SAR + mask blended)

Works on both synthetic test data and (when available) real SAR GeoTIFFs.

NOTE: This utility only visualizes SAR images + ground truth masks.
      It does NOT visualize model predictions (no trained model exists yet).

Usage:
    python services/ml-python/app/utils/visualize_sample.py
    python services/ml-python/app/utils/visualize_sample.py \\
        --image data/samples/synthetic/synth_512_001_VV.tif \\
        --mask  data/samples/synthetic/synth_512_001_mask.png \\
        --output data/samples/synthetic/synth_512_001_viz.png
"""

import argparse
import json
import os
import sys
from typing import Dict, List, Optional

import numpy as np

try:
    import rasterio
except ImportError:
    print("[ERROR] rasterio required: pip install rasterio>=1.3.9")
    sys.exit(1)

try:
    from PIL import Image as PILImage
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import matplotlib
    matplotlib.use("Agg")  # Non-interactive backend — safe for headless environments
    import matplotlib.pyplot as plt
    import matplotlib.colors as mcolors
    HAS_MPL = True
except Exception:
    HAS_MPL = False


# ---------------------------------------------------------------------------
# Class colour map — works for binary and multi-class masks
# ---------------------------------------------------------------------------
CLASS_COLORS: Dict[int, tuple] = {
    0: (0.0, 0.2, 0.6, 0.0),    # Background / sea — transparent in overlay
    1: (1.0, 0.0, 0.0, 0.7),    # Oil spill — red
    2: (1.0, 0.6, 0.0, 0.7),    # Look-alike — orange
    3: (0.2, 0.8, 0.2, 0.7),    # Ship — green
    4: (0.6, 0.4, 0.2, 0.7),    # Land — brown
}

CLASS_LABELS: Dict[int, str] = {
    0: "Sea / Background",
    1: "Oil Spill",
    2: "Look-alike",
    3: "Ship",
    4: "Land",
}


def _load_image_band(image_path: str) -> np.ndarray:
    """Load band 1 from a GeoTIFF, normalize to [0, 1]."""
    with rasterio.open(image_path) as src:
        band = src.read(1).astype(np.float32)
    band = np.nan_to_num(band, nan=0.0, posinf=0.0, neginf=0.0)
    lo, hi = np.percentile(band, 2), np.percentile(band, 98)
    if hi > lo:
        band = np.clip((band - lo) / (hi - lo), 0.0, 1.0)
    else:
        band = np.zeros_like(band)
    return band


def _load_mask(mask_path: str) -> np.ndarray:
    """Load a mask file (PNG or .npy) and return as uint8 array."""
    ext = os.path.splitext(mask_path)[1].lower()
    if ext == ".npy":
        return np.load(mask_path).astype(np.uint8)
    try:
        from PIL import Image as PILImage  # noqa: PLC0415
        return np.array(PILImage.open(mask_path)).astype(np.uint8)
    except ImportError:
        with rasterio.open(mask_path) as src:
            return src.read(1).astype(np.uint8)


def _mask_to_rgba(mask: np.ndarray) -> np.ndarray:
    """Convert integer class mask to RGBA image using CLASS_COLORS."""
    h, w = mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    for class_id, color in CLASS_COLORS.items():
        where = mask == class_id
        rgba[where] = color
    return rgba


def _visualize_scene_pil(
    sar_band: np.ndarray,
    mask_arr: Optional[np.ndarray],
    output_path: str,
    scene_id: str = "",
    is_synthetic: bool = False,
) -> bool:
    if not HAS_PIL:
        print("[WARN] Neither matplotlib nor Pillow available for visualization.")
        return False

    h, w = sar_band.shape
    sar_u8 = (np.clip(sar_band, 0.0, 1.0) * 255.0).astype(np.uint8)
    p1 = PILImage.fromarray(sar_u8).convert("RGB")

    if mask_arr is not None:
        p2_arr = np.zeros((h, w, 3), dtype=np.uint8)
        p2_arr[mask_arr == 0] = [15, 30, 60]       # Ocean (dark blue)
        p2_arr[mask_arr == 1] = [235, 45, 45]      # Oil spill (red)
        p2_arr[mask_arr == 2] = [240, 150, 30]     # Look-alike (orange)
        p2_arr[mask_arr == 3] = [50, 200, 50]      # Ship (green)
        p2_arr[mask_arr >= 4] = [160, 110, 60]     # Land (brown)
        p2 = PILImage.fromarray(p2_arr)
    else:
        p2 = PILImage.new("RGB", (w, h), (20, 20, 20))

    p3_arr = np.stack([sar_u8, sar_u8, sar_u8], axis=-1).astype(np.float32)
    if mask_arr is not None:
        spill = mask_arr == 1
        p3_arr[spill, 0] = np.clip(p3_arr[spill, 0] * 0.4 + 235 * 0.6, 0, 255)
        p3_arr[spill, 1] = np.clip(p3_arr[spill, 1] * 0.4 + 45 * 0.6, 0, 255)
        p3_arr[spill, 2] = np.clip(p3_arr[spill, 2] * 0.4 + 45 * 0.6, 0, 255)
    p3 = PILImage.fromarray(p3_arr.astype(np.uint8))

    gap = 8
    total_w = w * 3 + gap * 2
    canvas = PILImage.new("RGB", (total_w, h), (18, 18, 18))
    canvas.paste(p1, (0, 0))
    canvas.paste(p2, (w + gap, 0))
    canvas.paste(p3, (2 * (w + gap), 0))

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    canvas.save(output_path)
    print(f"  [OK] Saved visualization -> {output_path}")
    return True


def visualize_scene(
    image_path: str,
    mask_path: Optional[str],
    output_path: str,
    scene_id: str = "",
    is_synthetic: bool = False,
) -> bool:
    """
    Produce a 3-panel PNG: [SAR image | GT mask | overlay].

    Returns True on success, False on failure.
    """
    if not os.path.isfile(image_path):
        print(f"[WARN] Image not found: {image_path}")
        return False

    try:
        sar_band = _load_image_band(image_path)
    except Exception as exc:
        print(f"[ERROR] Could not load image '{image_path}': {exc}")
        return False

    has_mask = mask_path and os.path.isfile(mask_path)
    mask_arr: Optional[np.ndarray] = None
    if has_mask:
        try:
            mask_arr = _load_mask(mask_path)
            if mask_arr.shape != sar_band.shape:
                print(f"[WARN] Mask shape {mask_arr.shape} != image shape {sar_band.shape}. "
                      "Skipping mask overlay.")
                mask_arr = None
        except Exception as exc:
            print(f"[WARN] Could not load mask '{mask_path}': {exc}")
            mask_arr = None

    if not HAS_MPL:
        return _visualize_scene_pil(sar_band, mask_arr, output_path, scene_id, is_synthetic)

    fig, axes = plt.subplots(1, 3, figsize=(15, 5), facecolor="#111")
    for ax in axes:
        ax.set_facecolor("#111")

    # ── Panel 1: SAR image ────────────────────────────────────────────────
    axes[0].imshow(sar_band, cmap="gray", vmin=0, vmax=1)
    axes[0].set_title("SAR Backscatter (VV)", color="white", fontsize=10, pad=6)
    axes[0].axis("off")

    # ── Panel 2: Ground-truth mask ────────────────────────────────────────
    if mask_arr is not None:
        rgba_mask = _mask_to_rgba(mask_arr)
        present_classes = sorted(np.unique(mask_arr).tolist())
        axes[1].imshow(sar_band, cmap="gray", vmin=0, vmax=1, alpha=0.3)
        axes[1].imshow(rgba_mask)
        legend_handles = [
            plt.Rectangle(
                (0, 0), 1, 1,
                color=CLASS_COLORS.get(c, (0.5, 0.5, 0.5, 1.0))[:3],
                label=CLASS_LABELS.get(c, f"Class {c}"),
            )
            for c in present_classes
        ]
        axes[1].legend(
            handles=legend_handles, loc="lower right",
            fontsize=7, facecolor="#222", labelcolor="white", edgecolor="#444",
        )
    else:
        axes[1].imshow(np.zeros_like(sar_band), cmap="gray")
        axes[1].text(
            0.5, 0.5, "No mask available",
            ha="center", va="center", color="#aaa", fontsize=10,
            transform=axes[1].transAxes,
        )
    axes[1].set_title("Ground-Truth Mask", color="white", fontsize=10, pad=6)
    axes[1].axis("off")

    # ── Panel 3: Overlay ──────────────────────────────────────────────────
    axes[2].imshow(sar_band, cmap="gray", vmin=0, vmax=1)
    if mask_arr is not None:
        overlay_rgba = _mask_to_rgba(mask_arr)
        axes[2].imshow(overlay_rgba)
    axes[2].set_title("Overlay (SAR + Mask)", color="white", fontsize=10, pad=6)
    axes[2].axis("off")

    # ── Title bar ─────────────────────────────────────────────────────────
    title = f"Scene: {scene_id}" if scene_id else os.path.basename(image_path)
    if is_synthetic:
        title += "  [SYNTHETIC TEST DATA — not real Sentinel-1]"
    fig.suptitle(title, color="#ccc", fontsize=9, y=1.01)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    plt.tight_layout(pad=0.5)
    plt.savefig(output_path, dpi=120, bbox_inches="tight", facecolor="#111")
    plt.close(fig)
    print(f"  [OK] Saved visualization → {output_path}")
    return True


def visualize_manifest(
    manifest_path: str,
    output_dir: str,
    max_scenes: int = 4,
) -> None:
    """Visualize up to max_scenes from a manifest."""
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    scenes = manifest.get("scenes", [])[:max_scenes]
    source = manifest.get("source", "unknown")
    is_synthetic = source == "synthetic_test"

    os.makedirs(output_dir, exist_ok=True)
    manifest_dir = os.path.dirname(os.path.abspath(manifest_path))
    print(f"\nVisualizing {len(scenes)} scene(s) from: {manifest_path}")
    for scene in scenes:
        sid = scene.get("scene_id", "unknown")
        img = scene.get("image_path", "")
        msk = scene.get("mask_path")

        if img and not os.path.isfile(img):
            cand1 = os.path.join(manifest_dir, img)
            cand2 = os.path.join(manifest_dir, os.path.basename(img))
            if os.path.isfile(cand1):
                img = cand1
            elif os.path.isfile(cand2):
                img = cand2

        if msk and not os.path.isfile(msk):
            cand1 = os.path.join(manifest_dir, msk)
            cand2 = os.path.join(manifest_dir, os.path.basename(msk))
            if os.path.isfile(cand1):
                msk = cand1
            elif os.path.isfile(cand2):
                msk = cand2

        out = os.path.join(output_dir, f"{sid}_viz.png")
        visualize_scene(img, msk, out, scene_id=sid, is_synthetic=is_synthetic)
    print(f"Done. Visualizations saved to: {output_dir}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Visualize SAR scenes + GT masks.")
    parser.add_argument("--image", help="Path to a single SAR GeoTIFF to visualize.")
    parser.add_argument("--mask", help="Path to the corresponding mask file (PNG/.npy).")
    parser.add_argument("--output", help="Output PNG path.")
    parser.add_argument(
        "--manifest",
        default="data/samples/synthetic/dataset_manifest.json",
        help="Path to dataset_manifest.json to visualize all scenes.",
    )
    parser.add_argument(
        "--output-dir",
        default="data/samples/synthetic",
        help="Directory for visualization outputs when using --manifest.",
    )
    parser.add_argument(
        "--max-scenes", type=int, default=4,
        help="Maximum number of scenes to visualize from manifest.",
    )
    args = parser.parse_args()

    if args.image:
        out = args.output or (os.path.splitext(args.image)[0] + "_viz.png")
        visualize_scene(
            image_path=args.image,
            mask_path=args.mask,
            output_path=out,
            is_synthetic=False,
        )
    else:
        if os.path.isfile(args.manifest):
            visualize_manifest(args.manifest, args.output_dir, args.max_scenes)
        else:
            print(f"[WARN] Manifest not found: {args.manifest}")
            print("       Run: python scripts/generate_synthetic_sar.py first.")


if __name__ == "__main__":
    main()
