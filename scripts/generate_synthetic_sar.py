"""
Synthetic SAR Test Data Generator — Phase 3C
=============================================

Generates SYNTHETIC test GeoTIFF rasters + binary ground-truth masks
specifically to exercise the SAR preprocessing pipeline without any
real Sentinel-1 imagery.

IMPORTANT — READ THIS:
  - All outputs are SYNTHETIC. They are NOT real Sentinel-1 data.
  - They MUST NOT be used to claim model accuracy or benchmark scores.
  - They exist solely to validate the software pipeline.
  - Every output file is tagged with source="synthetic_test" in its manifest entry.

Output directory: data/samples/synthetic/

Usage:
  python scripts/generate_synthetic_sar.py
  python scripts/generate_synthetic_sar.py --size 2048 --num-scenes 5
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import List, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Optional rasterio import — must be installed in the active environment
# ---------------------------------------------------------------------------
try:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds
except ImportError:
    print("[ERROR] rasterio is not installed in the current environment.")
    print("        Run: pip install rasterio>=1.3.9")
    sys.exit(1)

try:
    from PIL import Image as PILImage
    HAS_PIL = True
except ImportError:
    HAS_PIL = False  # Masks will be saved as raw numpy .npy instead


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# Realistic Mumbai offshore bounding box (WGS84 lon/lat)
BBOX_LON_MIN = 72.50
BBOX_LON_MAX = 73.20
BBOX_LAT_MIN = 18.60
BBOX_LAT_MAX = 19.30

CRS_WGS84 = CRS.from_epsg(4326)


def _make_synthetic_sar_band(height: int, width: int, rng: np.random.Generator) -> np.ndarray:
    """
    Generate a synthetic VV-polarization-like SAR backscatter array.

    Physical simulation approximation:
      - Ocean background: low mean (dark, ~-20 dB in real data)
      - Speckle noise: multiplicative Rayleigh fading (typical of coherent imaging)
      - Oil slick regions: suppressed backscatter (even darker patches)

    Returns float32 array in physical-unit-like range [0, 65535] (uint16 equivalent)
    so it exercises the same normalization code used on real imagery.
    """
    # Base ocean backscatter (gamma distribution approximates speckle statistics)
    ocean = rng.gamma(shape=2.0, scale=1800.0, size=(height, width)).astype(np.float32)

    return ocean


def _add_oil_spill_regions(
    band: np.ndarray,
    mask: np.ndarray,
    rng: np.random.Generator,
    num_spills: int = 2,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Overlay synthetic oil spill shapes onto the SAR band (lower backscatter)
    and paint the corresponding pixels in the mask.

    Returns (modified_band, modified_mask).
    """
    height, width = band.shape
    for _ in range(num_spills):
        cx = rng.integers(width // 4, 3 * width // 4)
        cy = rng.integers(height // 4, 3 * height // 4)
        rx = rng.integers(width // 12, width // 6)
        ry = rng.integers(height // 12, height // 6)

        yy, xx = np.ogrid[:height, :width]
        ellipse_mask = ((xx - cx) ** 2 / rx ** 2 + (yy - cy) ** 2 / ry ** 2) <= 1.0

        # Oil spills dampen backscatter — multiply by 0.15–0.35
        damping = rng.uniform(0.15, 0.35)
        band[ellipse_mask] = band[ellipse_mask] * damping

        # Mark as class 1 (oil spill) in ground-truth mask
        mask[ellipse_mask] = 1

    return band, mask


def generate_scene(
    scene_id: str,
    height: int,
    width: int,
    output_dir: str,
    rng: np.random.Generator,
    add_spills: bool = True,
) -> dict:
    """
    Generate a single synthetic SAR scene + mask and return a manifest entry.

    Args:
        scene_id:   Unique string identifier for this scene.
        height:     Raster height in pixels.
        width:      Raster width in pixels.
        output_dir: Destination directory (will be created).
        rng:        NumPy random Generator.
        add_spills: Whether to paint oil spill regions into this scene.

    Returns:
        dict: Manifest entry for this scene.
    """
    os.makedirs(output_dir, exist_ok=True)

    tif_path = os.path.join(output_dir, f"{scene_id}_VV.tif")
    mask_path = os.path.join(output_dir, f"{scene_id}_mask.png")

    # Build synthetic band and mask
    band = _make_synthetic_sar_band(height, width, rng)
    mask = np.zeros((height, width), dtype=np.uint8)  # 0 = sea background

    if add_spills:
        num_spills = rng.integers(1, 3)
        band, mask = _add_oil_spill_regions(band, mask, rng, num_spills=num_spills)

    # Compute affine transform from realistic bounding box
    transform = from_bounds(
        west=BBOX_LON_MIN,
        south=BBOX_LAT_MIN,
        east=BBOX_LON_MAX,
        north=BBOX_LAT_MAX,
        width=width,
        height=height,
    )

    resolution_lon = (BBOX_LON_MAX - BBOX_LON_MIN) / width
    resolution_lat = (BBOX_LAT_MAX - BBOX_LAT_MIN) / height

    # Write GeoTIFF (single VV band, float32)
    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype=np.float32,
        crs=CRS_WGS84,
        transform=transform,
        nodata=None,
    ) as dst:
        dst.write(band.astype(np.float32), 1)

    # Write ground-truth mask
    if HAS_PIL:
        pil_mask = PILImage.fromarray(mask, mode="L")
        pil_mask.save(mask_path)
    else:
        # Fall back to saving as .npy if Pillow not available
        mask_path = mask_path.replace(".png", ".npy")
        np.save(mask_path, mask)

    spill_pixel_count = int(np.sum(mask == 1))
    contains_spill = spill_pixel_count > 0

    print(f"  [OK] {scene_id}: {width}x{height}px  spill_pixels={spill_pixel_count}  -> {tif_path}")

    return {
        "scene_id": scene_id,
        "source": "synthetic_test",
        "WARNING": "SYNTHETIC DATA — NOT real Sentinel-1 imagery. Do not use for accuracy claims.",
        "image_path": os.path.relpath(tif_path).replace("\\", "/"),
        "mask_path": os.path.relpath(mask_path).replace("\\", "/"),
        "split": None,
        "polarization": "VV",
        "width": width,
        "height": height,
        "crs": "EPSG:4326",
        "transform": list(transform),
        "resolution": [round(resolution_lon, 8), round(resolution_lat, 8)],
        "acquisition_time": None,
        "classes": [
            {"id": 0, "name": "sea_background"},
            {"id": 1, "name": "oil_spill_synthetic"},
        ],
        "contains_spill": contains_spill,
        "spill_pixel_count": spill_pixel_count,
    }


def main(argv: List[str] = None) -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic SAR test scenes for pipeline validation."
    )
    parser.add_argument(
        "--size",
        type=int,
        default=512,
        help="Primary scene size in pixels (square). Default 512.",
    )
    parser.add_argument(
        "--num-scenes",
        type=int,
        default=6,
        help="Number of scenes to generate. Default 6 (4 with spills, 2 clean).",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data/samples/synthetic",
        help="Output directory. Default: data/samples/synthetic/",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility. Default 42.",
    )
    parser.add_argument(
        "--include-large",
        action="store_true",
        help="Also generate one 2048×2048 scene to exercise the tiling pipeline.",
    )
    args = parser.parse_args(argv)

    rng = np.random.default_rng(args.seed)

    print("\n" + "=" * 60)
    print("SYNTHETIC SAR TEST DATA GENERATOR — Phase 3C")
    print("=" * 60)
    print("WARNING: All outputs are SYNTHETIC. NOT real Sentinel-1 data.")
    print(f"Output directory : {args.output_dir}")
    print(f"Primary scene size: {args.size}×{args.size}px")
    print(f"Number of scenes : {args.num_scenes}")
    print(f"Random seed      : {args.seed}")
    print("=" * 60 + "\n")

    os.makedirs(args.output_dir, exist_ok=True)

    scenes = []
    num_with_spills = max(1, int(args.num_scenes * 0.67))

    for i in range(args.num_scenes):
        scene_id = f"synth_{args.size}_{i+1:03d}"
        add_spills = i < num_with_spills
        entry = generate_scene(
            scene_id=scene_id,
            height=args.size,
            width=args.size,
            output_dir=args.output_dir,
            rng=rng,
            add_spills=add_spills,
        )
        scenes.append(entry)

    # Optional large scene for tiling validation
    if args.include_large:
        print("\n  Generating 2048×2048 scene for tiling pipeline test ...")
        large_entry = generate_scene(
            scene_id="synth_2048_001",
            height=2048,
            width=2048,
            output_dir=args.output_dir,
            rng=rng,
            add_spills=True,
        )
        scenes.append(large_entry)

    # Write manifest
    manifest = {
        "dataset_id": "synthetic-sar-test-v1",
        "dataset_version": "1.0",
        "source": "synthetic_test",
        "WARNING": "SYNTHETIC DATA ONLY. NOT real Sentinel-1 imagery. NOT suitable for accuracy evaluation.",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generator_script": "scripts/generate_synthetic_sar.py",
        "total_scenes": len(scenes),
        "scenes": scenes,
    }

    manifest_path = os.path.join(args.output_dir, "dataset_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n  [OK] Manifest written -> {manifest_path}")
    print(f"  Total scenes: {len(scenes)}")
    print(f"  With spills: {sum(1 for s in scenes if s['contains_spill'])}")
    print(f"  Clean:       {sum(1 for s in scenes if not s['contains_spill'])}")
    print("\n" + "=" * 60)
    print("DONE - Synthetic SAR test data generated.")
    print("Use python scripts/download-dataset.py to inspect and validate.")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
