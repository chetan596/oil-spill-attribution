import os
import sys
import json
import torch
import numpy as np
import rasterio
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('services/ml-python'))

from app.models.registry import model_registry
from app.preprocessing.sar_preprocessor import load_sar_raster
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask


def create_error_analysis_panel(
    scene_id: str,
    img_path: str,
    mask_path: str,
    model,
    threshold: float,
    case_type: str,
    output_path: str
):
    print(f"Rendering error analysis panel for {scene_id} ({case_type})...")
    # Ingest SAR GeoTIFF
    raster_tensor, meta = load_sar_raster(img_path, polarization="VV+VH")
    tiles, coords = generate_tiles(raster_tensor, tile_size=512, stride=512)

    # Model inference
    tile_preds = []
    with torch.no_grad():
        for t in tiles:
            t_tensor = torch.from_numpy(t).unsqueeze(0).float()
            probs = model.predict_probabilities(t_tensor)
            tile_preds.append(probs[0, 1].cpu().numpy())

    full_prob = reconstruct_full_mask(tile_preds, coords, meta["height"], meta["width"], 512)
    binary_pred = (full_prob >= threshold).astype(np.uint8)

    # Load GT mask
    if mask_path and os.path.isfile(mask_path):
        with rasterio.open(mask_path) as msrc:
            gt_mask = (msrc.read(1) > 0).astype(np.uint8)
    else:
        gt_mask = np.zeros((meta["height"], meta["width"]), dtype=np.uint8)

    # Downsample from 2048x2048 to 512x512 for visual panel layout
    panel_size = (384, 384)

    # 1. SAR VV
    vv_raw = raster_tensor[0]
    vv_img = Image.fromarray((np.clip(vv_raw, 0, 1) * 255).astype(np.uint8), mode='L').resize(panel_size)

    # 2. SAR VH
    if raster_tensor.shape[0] > 1:
        vh_raw = raster_tensor[1]
        vh_img = Image.fromarray((np.clip(vh_raw, 0, 1) * 255).astype(np.uint8), mode='L').resize(panel_size)
    else:
        vh_img = vv_img.copy()

    # 3. Ground Truth
    gt_rgb = np.zeros((gt_mask.shape[0], gt_mask.shape[1], 3), dtype=np.uint8)
    gt_rgb[gt_mask == 1] = [0, 255, 128]  # Green for GT
    gt_img = Image.fromarray(gt_rgb, mode='RGB').resize(panel_size)

    # 4. Probability Map (Heatmap: Jet/Magma style normalized)
    p_norm = (full_prob - full_prob.min()) / (full_prob.max() - full_prob.min() + 1e-7)
    # Simple color map: low = dark purple, mid = orange, high = bright yellow
    heat_rgb = np.zeros((full_prob.shape[0], full_prob.shape[1], 3), dtype=np.uint8)
    heat_rgb[:, :, 0] = (p_norm * 255).astype(np.uint8)
    heat_rgb[:, :, 1] = (np.clip(p_norm * 1.5 - 0.2, 0, 1) * 255).astype(np.uint8)
    heat_rgb[:, :, 2] = (np.clip(1.0 - p_norm * 1.8, 0, 1) * 255).astype(np.uint8)
    prob_img = Image.fromarray(heat_rgb, mode='RGB').resize(panel_size)

    # 5. Thresholded Prediction
    pred_rgb = np.zeros((binary_pred.shape[0], binary_pred.shape[1], 3), dtype=np.uint8)
    pred_rgb[binary_pred == 1] = [255, 50, 50]  # Red for Prediction
    pred_img = Image.fromarray(pred_rgb, mode='RGB').resize(panel_size)

    # 6. Overlay on SAR VV
    overlay_rgb = np.stack([vv_raw, vv_raw, vv_raw], axis=-1)
    overlay_rgb = (np.clip(overlay_rgb, 0, 1) * 255).astype(np.uint8)
    # Highlight GT in green
    overlay_rgb[gt_mask == 1] = [0, 255, 100]
    # Highlight Pred in red (overlap becomes yellow)
    overlap = (gt_mask == 1) & (binary_pred == 1)
    pred_only = (gt_mask == 0) & (binary_pred == 1)
    overlay_rgb[pred_only] = [255, 40, 40]
    overlay_rgb[overlap] = [255, 230, 0]
    overlay_img = Image.fromarray(overlay_rgb, mode='RGB').resize(panel_size)

    # Assemble into a wide 6-column composite
    header_h = 70
    footer_h = 40
    total_w = panel_size[0] * 6 + 70
    total_h = panel_size[1] + header_h + footer_h + 30

    composite = Image.new('RGB', (total_w, total_h), color=(18, 24, 38))
    draw = ImageDraw.Draw(composite)

    # Header title
    title = f"REAL MODEL ERROR ANALYSIS — {case_type.upper()}: {scene_id}"
    subtitle = f"Threshold: {threshold:.2f} | Max Prob: {full_prob.max():.4f} | Mean Prob: {full_prob.mean():.4f} | GT Pos Pixels: {int(np.sum(gt_mask==1)):,} | Pred Pos: {int(np.sum(binary_pred==1)):,}"
    draw.text((20, 15), title, fill=(255, 255, 255))
    draw.text((20, 40), subtitle, fill=(180, 200, 230))

    panels = [
        ("SAR VV (Normalized dB)", vv_img),
        ("SAR VH Polarization", vh_img),
        ("Ground Truth (Green)", gt_img),
        ("Probability Heatmap", prob_img),
        (f"Prediction (Th={threshold:.2f})", pred_img),
        ("Overlay (Green=GT, Red=FP, Yel=TP)", overlay_img),
    ]

    for idx, (p_title, p_img) in enumerate(panels):
        x = 10 + idx * (panel_size[0] + 10)
        y = header_h + 10
        draw.text((x + 5, y - 20), p_title, fill=(200, 220, 255))
        composite.paste(p_img, (x, y))

    # Footer note
    draw.text((20, total_h - 30), "SIH26143 Phase 3D-3 Real SAR Diagnostic Panel — Genuine UNet V1 Output on Real Sentinel-1 Imagery", fill=(120, 150, 180))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    composite.save(output_path)
    print(f"Saved: {output_path}")


def main():
    model, entry = model_registry.load_model(model_id="unet-dual-pol-sar-v1", device="cpu", allow_untrained=False)
    model.eval()

    cases = [
        {
            "case_type": "Partial Oil Detection",
            "scene_id": "real_part3_test_00062",
            "img_path": "data/raw/satellite/real/part3_test/images/00062.tif",
            "mask_path": "data/raw/satellite/real/part3_test/masks/00062.tif",
            "threshold": 0.36,
            "filename": "error_analysis_1_partial_oil_detection_00062.png"
        },
        {
            "case_type": "Complete Oil Miss (at Default 0.50 Threshold)",
            "scene_id": "real_part3_test_00064",
            "img_path": "data/raw/satellite/real/part3_test/images/00064.tif",
            "mask_path": "data/raw/satellite/real/part3_test/masks/00064.tif",
            "threshold": 0.50,
            "filename": "error_analysis_2_complete_oil_miss_00064.png"
        },
        {
            "case_type": "Clean Sea Surface (No Oil)",
            "scene_id": "real_part3_test_00060",
            "img_path": "data/raw/satellite/real/part3_test/images/00060.tif",
            "mask_path": "data/raw/satellite/real/part3_test/masks/00060.tif",
            "threshold": 0.50,
            "filename": "error_analysis_3_clean_sea_00060.png"
        },
        {
            "case_type": "Look-Alike Challenge Scene",
            "scene_id": "real_part2_lookalike_00000",
            "img_path": "data/raw/satellite/real/part2_lookalike/images/00000.tif",
            "mask_path": "data/raw/satellite/real/part2_lookalike/masks/00000.tif",
            "threshold": 0.50,
            "filename": "error_analysis_4_lookalike_challenge_00000.png"
        }
    ]

    out_dir = "ml/experiments/results/error_analysis"
    for c in cases:
        out_path = os.path.join(out_dir, c["filename"])
        create_error_analysis_panel(
            scene_id=c["scene_id"],
            img_path=c["img_path"],
            mask_path=c["mask_path"],
            model=model,
            threshold=c["threshold"],
            case_type=c["case_type"],
            output_path=out_path
        )


if __name__ == "__main__":
    main()
