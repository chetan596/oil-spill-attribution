"""
SAR Raster Preview Batch Generator
==================================
Renders calibrated, browser-friendly PNG derivatives directly from actual GeoTIFF rasters
and masks using the verified scientific preprocessing pipeline.
Preserves original GeoTIFF as authoritative source-of-truth.
"""

import os
import sys
from pathlib import Path
import numpy as np
import rasterio
from PIL import Image

# Add services/ml-python to path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root / "services" / "ml-python"))

from app.preprocessing.sar_preview import generate_sar_preview_image


def render_robust_band(file_path: Path, band_idx: int = 1) -> Image.Image:
    with rasterio.open(str(file_path)) as src:
        band = src.read(band_idx).astype(np.float32)
    band = np.nan_to_num(band, nan=0.0, posinf=0.0, neginf=0.0)
    lo, hi = np.percentile(band, 2), np.percentile(band, 98)
    if hi > lo:
        norm = np.clip((band - lo) / (hi - lo), 0.0, 1.0)
    else:
        norm = np.zeros_like(band)
    return Image.fromarray((norm * 255).astype(np.uint8))


def generate_all_previews():
    cdse_preview_dir = project_root / "data" / "raw" / "satellite" / "cdse" / "previews"
    synthetic_preview_dir = project_root / "data" / "samples" / "synthetic" / "previews"
    real_preview_dir = project_root / "data" / "raw" / "satellite" / "real" / "previews"

    cdse_preview_dir.mkdir(parents=True, exist_ok=True)
    synthetic_preview_dir.mkdir(parents=True, exist_ok=True)
    real_preview_dir.mkdir(parents=True, exist_ok=True)

    # 1. REAL CDSE Sentinel-1 Raster
    cdse_geotiff = project_root / "data" / "raw" / "satellite" / "cdse" / "S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG" / "derived" / "real_cdse_vv_vh.tif"
    if cdse_geotiff.exists():
        print(f"[CDSE] Rendering previews from: {cdse_geotiff}")
        for channel in ["vv", "vh", "vv_vh"]:
            try:
                png_bytes, meta = generate_sar_preview_image(str(cdse_geotiff), channel=channel, max_dimension=1024)
                out_path = cdse_preview_dir / f"cdse_{channel}.png"
                with open(out_path, "wb") as f:
                    f.write(png_bytes)
                print(f"  -> Generated {out_path.name} ({len(png_bytes):,} bytes)")
            except Exception as e:
                print(f"  -> Error for {channel}: {e}")

    # 2. Synthetic Demo Scenarios (001, 002, 003, 004)
    demo_mapping = {
        "demo-scene-001": project_root / "data" / "samples" / "synthetic" / "synth_512_001_VV.tif",
        "demo-scene-002": project_root / "data" / "samples" / "synthetic" / "synth_512_002_VV.tif",
        "demo-scene-003": project_root / "data" / "samples" / "synthetic" / "synth_512_003_VV.tif",
        "demo-scene-004": project_root / "data" / "samples" / "synthetic" / "synth_512_004_VV.tif",
    }
    for scene_id, tif_path in demo_mapping.items():
        if tif_path.exists():
            print(f"[{scene_id}] Rendering synthetic preview from: {tif_path}")
            try:
                img = render_robust_band(tif_path, band_idx=1)
                out_path = synthetic_preview_dir / f"{scene_id}_vv.png"
                img.save(out_path, format="PNG", optimize=True)
                print(f"  -> Generated {out_path.name} ({out_path.stat().st_size:,} bytes)")
            except Exception as e:
                print(f"  -> Error for {scene_id}: {e}")

            # Mask preview
            mask_png = tif_path.parent / tif_path.name.replace("_VV.tif", "_mask.png")
            if mask_png.exists():
                out_mask = synthetic_preview_dir / f"{scene_id}_mask.png"
                with open(mask_png, "rb") as mf, open(out_mask, "wb") as of:
                    of.write(mf.read())
                print(f"  -> Linked mask {out_mask.name}")

    # 3. Benchmark Scenes (Part I Oil 00000)
    real_00000_tif = project_root / "data" / "raw" / "satellite" / "real" / "part1_oil" / "images" / "00000.tif"
    if real_00000_tif.exists():
        print(f"[Benchmark 00000] Rendering from: {real_00000_tif}")
        for channel in ["vv", "vh", "vv_vh"]:
            try:
                png_bytes, meta = generate_sar_preview_image(str(real_00000_tif), channel=channel, max_dimension=1024)
                out_path = real_preview_dir / f"real_part1_oil_00000_{channel}.png"
                with open(out_path, "wb") as f:
                    f.write(png_bytes)
                print(f"  -> Generated {out_path.name} ({len(png_bytes):,} bytes)")
            except Exception as e:
                print(f"  -> Error for {channel}: {e}")

        # Ground truth mask
        try:
            gt_bytes, gt_meta = generate_sar_preview_image(str(real_00000_tif), channel="ground_truth", max_dimension=1024)
            out_gt = real_preview_dir / "real_part1_oil_00000_mask.png"
            with open(out_gt, "wb") as f:
                f.write(gt_bytes)
            print(f"  -> Generated {out_gt.name} ({len(gt_bytes):,} bytes)")
        except Exception as e:
            print(f"  -> Error for mask: {e}")

    print("\nBatch generation complete!")


if __name__ == "__main__":
    generate_all_previews()
