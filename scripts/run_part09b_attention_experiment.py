"""
Execution Script for PART 0.9B — Controlled Attention U-Net Architecture Experiment.
===================================================================================

Objective:
Test whether adding spatial attention gates to the skip connections of the standard dual-pol Sentinel-1 U-Net
improves oil-spill segmentation and/or reduces look-alike false positives.

Experimental Variable:
- ARCHITECTURE = ATTENTION U-NET (UNetAttention)

Frozen Elements:
- Reference Baseline: unet-dual-pol-sar-v6
- Active Baseline: unet-dual-pol-sar-v2 (remains active baseline)
- Dataset: 28 Train, 7 Validation, 5 Held-out Test (Quarantined)
- Preprocessing: sentinel1_sigma0_db_v1 (VV [-35,-5] dB, VH [-45,-15] dB)
- Tile Policy: 512x512, deterministic tiling
- Loss: CombinedLoss (CE weight=1.0, Dice weight=1.0, fg_weight=5.0)
- Optimizer: AdamW (lr=1e-4, wd=1e-4, batch_size=2, AMP FP16, seed=42)
- Training: max 30 epochs, patience 7 on val Dice
"""

import os
import sys
import json
import time
import math
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import rasterio
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from app.models.unet.architecture import UNet, UNetAttention
from app.training.losses import CombinedLoss
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.normalization import normalize_sar_band
from ml.training.train_v6 import V6TileDataset, set_seed, compute_file_sha256, calculate_confusion_metrics
from ml.evaluation.metrics import compute_fpr
from ml.evaluation.confusion_matrix import generate_confusion_matrix, calculate_confusion_metrics as calc_cm_metrics


LOCKED_TEST_SCENES = {
    "real_part3_test_00060",
    "real_part3_test_00062",
    "real_part3_test_00063",
    "real_part3_test_00064",
    "real_part3_test_00080",
}


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def generate_training_curves_svg(history: list, title: str, out_svg_path: str):
    """Generate multi-panel training curves SVG."""
    svg_panels = [
        ("Training & Validation Loss", [
            ("Train Loss", [h["train_loss"] for h in history], "#3b82f6", "solid"),
            ("Val Loss", [h["val_loss"] for h in history], "#ef4444", "dashed"),
        ]),
        ("Validation Dice / F1", [
            ("Val Dice", [h["val_dice"] for h in history], "#10b981", "solid"),
        ]),
        ("Validation IoU", [
            ("Val IoU", [h["val_iou"] for h in history], "#8b5cf6", "solid"),
        ]),
        ("Validation Precision", [
            ("Val Precision", [h["val_precision"] for h in history], "#f97316", "solid"),
        ]),
        ("Validation Recall", [
            ("Val Recall", [h["val_recall"] for h in history], "#06b6d4", "solid"),
        ]),
        ("Validation FPR", [
            ("Val FPR", [h["val_fpr"] for h in history], "#e11d48", "solid"),
        ]),
    ]

    svg_width, svg_height = 1200, 780
    margin_x, margin_y = 60, 70
    panel_w, panel_h = 340, 280
    gap_x, gap_y = 50, 60

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_width} {svg_height}" width="{svg_width}" height="{svg_height}" style="background:#0f172a; font-family:sans-serif;">',
        f'<text x="{svg_width//2}" y="36" text-anchor="middle" fill="#f8fafc" font-size="20" font-weight="bold">{title}</text>',
        f'<text x="{svg_width//2}" y="56" text-anchor="middle" fill="#94a3b8" font-size="12">Training history over {len(history)} epochs | Seed: 42 | Attention U-Net</text>',
    ]

    for p_idx, (p_title, series_list) in enumerate(svg_panels):
        row = p_idx // 3
        col = p_idx % 3
        px = margin_x + col * (panel_w + gap_x)
        py = margin_y + row * (panel_h + gap_y)

        svg_lines.append(f'<rect x="{px}" y="{py}" width="{panel_w}" height="{panel_h}" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>')
        svg_lines.append(f'<text x="{px + panel_w//2}" y="{py + 24}" text-anchor="middle" fill="#e2e8f0" font-size="13" font-weight="600">{p_title}</text>')

        plot_x = px + 45
        plot_y = py + 40
        plot_w = panel_w - 60
        plot_h = panel_h - 75

        svg_lines.append(f'<rect x="{plot_x}" y="{plot_y}" width="{plot_w}" height="{plot_h}" fill="#0f172a" stroke="#475569" stroke-width="1"/>')
        for g in range(1, 4):
            gy = plot_y + int(plot_h * g / 4)
            svg_lines.append(f'<line x1="{plot_x}" y1="{gy}" x2="{plot_x + plot_w}" y2="{gy}" stroke="#334155" stroke-dasharray="3,3"/>')

        all_vals = [v for _, vals, _, _ in series_list for v in vals if v is not None]
        min_v = 0.0 if min(all_vals, default=0.0) >= 0 else min(all_vals)
        max_v = max(all_vals, default=1.0)
        if max_v == min_v:
            max_v += 1.0
        range_v = max_v - min_v
        n_epochs = len(history)

        for name, vals, color, style in series_list:
            points = []
            for ep_idx, val in enumerate(vals):
                x_pos = plot_x if n_epochs == 1 else plot_x + int(plot_w * ep_idx / (n_epochs - 1))
                y_pos = plot_y + plot_h - int(plot_h * (val - min_v) / range_v)
                points.append(f"{x_pos},{y_pos}")

            dash = 'stroke-dasharray="4,4"' if style == "dashed" else ""
            svg_lines.append(f'<polyline points="{" ".join(points)}" fill="none" stroke="{color}" stroke-width="2.2" {dash}/>')

        svg_lines.append(f'<text x="{plot_x - 6}" y="{plot_y + 10}" text-anchor="end" fill="#94a3b8" font-size="10">{max_v:.2f}</text>')
        svg_lines.append(f'<text x="{plot_x - 6}" y="{plot_y + plot_h}" text-anchor="end" fill="#94a3b8" font-size="10">{min_v:.2f}</text>')
        svg_lines.append(f'<text x="{plot_x}" y="{plot_y + plot_h + 16}" text-anchor="middle" fill="#94a3b8" font-size="10">1</text>')
        svg_lines.append(f'<text x="{plot_x + plot_w}" y="{plot_y + plot_h + 16}" text-anchor="middle" fill="#94a3b8" font-size="10">{n_epochs}</text>')

        leg_x = plot_x + 8
        for s_i, (name, _, color, style) in enumerate(series_list):
            ly = plot_y + 14 + s_i * 14
            dash = 'stroke-dasharray="3,3"' if style == "dashed" else ""
            svg_lines.append(f'<line x1="{leg_x}" y1="{ly-3}" x2="{leg_x+16}" y2="{ly-3}" stroke="{color}" stroke-width="2" {dash}/>')
            svg_lines.append(f'<text x="{leg_x+22}" y="{ly}" fill="#cbd5e1" font-size="10">{name}</text>')

    svg_lines.append('</svg>')
    with open(out_svg_path, "w", encoding="utf-8") as f:
        f.write("\n".join(svg_lines))


def generate_threshold_curves_svg(models_threshold_data: Dict[str, Any], metric_name: str, metric_label: str, out_svg_path: str):
    """Generate threshold sweep curve SVG comparing all historical models."""
    svg_width, svg_height = 800, 500
    margin_x, margin_y = 80, 80
    plot_w, plot_h = 640, 340

    colors = {
        "V6_BASELINE": "#94a3b8",
        "V8_A_BASELINE_LOSS": "#3b82f6",
        "V8_B_FOCAL_DICE": "#10b981",
        "V8_C_FOCAL_TVERSKY": "#f59e0b",
        "V8_D_HIGH_FG_WEIGHT": "#ec4899",
        "V09A_MULTISCALE": "#06b6d4",
        "V09B_ATTENTION": "#a855f7",
    }

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_width} {svg_height}" width="{svg_width}" height="{svg_height}" style="background:#0f172a; font-family:sans-serif;">',
        f'<text x="{svg_width//2}" y="36" text-anchor="middle" fill="#f8fafc" font-size="18" font-weight="bold">{metric_label} vs Detection Threshold</text>',
        f'<text x="{svg_width//2}" y="56" text-anchor="middle" fill="#94a3b8" font-size="12">Validation split (7 scenes) threshold sensitivity comparison</text>',
        f'<rect x="{margin_x}" y="{margin_y}" width="{plot_w}" height="{plot_h}" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>',
    ]

    # Grid
    for g in range(1, 5):
        gy = margin_y + int(plot_h * g / 5)
        svg_lines.append(f'<line x1="{margin_x}" y1="{gy}" x2="{margin_x + plot_w}" y2="{gy}" stroke="#334155" stroke-dasharray="3,3"/>')

    thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]
    min_th, max_th = min(thresholds), max(thresholds)

    # Collect max value across models
    all_vals = []
    for m_id, th_list in models_threshold_data.items():
        for item in th_list:
            if metric_name in item:
                all_vals.append(item[metric_name])
            elif "micro_pixel_aggregate" in item and metric_name in item["micro_pixel_aggregate"]:
                all_vals.append(item["micro_pixel_aggregate"][metric_name])
            elif "category_breakdown" in item and metric_name in item["category_breakdown"]:
                all_vals.append(item["category_breakdown"][metric_name])

    max_val = max(all_vals) if all_vals else 1.0
    if max_val <= 0.01:
        max_val = 0.05
    elif max_val <= 0.2:
        max_val = 0.2
    elif max_val <= 0.5:
        max_val = 0.5
    else:
        max_val = 1.0

    # Draw curves
    for m_id, th_list in models_threshold_data.items():
        color = colors.get(m_id, "#cbd5e1")
        points = []
        for item in sorted(th_list, key=lambda x: x["threshold"]):
            th = item["threshold"]
            if metric_name in item:
                val = item[metric_name]
            elif "micro_pixel_aggregate" in item and metric_name in item["micro_pixel_aggregate"]:
                val = item["micro_pixel_aggregate"][metric_name]
            elif "category_breakdown" in item and metric_name in item["category_breakdown"]:
                val = item["category_breakdown"][metric_name]
            else:
                val = 0.0

            x_pos = margin_x + int(plot_w * (th - min_th) / (max_th - min_th))
            y_pos = margin_y + plot_h - int(plot_h * (val / max_val))
            points.append(f"{x_pos},{y_pos}")

        is_main = m_id == "V09B_ATTENTION"
        stroke_w = 3.2 if is_main else 2.0
        svg_lines.append(f'<polyline points="{" ".join(points)}" fill="none" stroke="{color}" stroke-width="{stroke_w}"/>')
        # Dots
        for pt in points:
            px, py = map(int, pt.split(","))
            svg_lines.append(f'<circle cx="{px}" cy="{py}" r="4" fill="{color}" stroke="#0f172a" stroke-width="1"/>')

    # Y-axis labels
    for g in range(0, 6):
        gy = margin_y + plot_h - int(plot_h * g / 5)
        gval = max_val * g / 5
        svg_lines.append(f'<text x="{margin_x - 8}" y="{gy + 4}" text-anchor="end" fill="#94a3b8" font-size="11">{gval:.2f}</text>')

    # X-axis labels
    for th in thresholds:
        tx = margin_x + int(plot_w * (th - min_th) / (max_th - min_th))
        svg_lines.append(f'<text x="{tx}" y="{margin_y + plot_h + 20}" text-anchor="middle" fill="#94a3b8" font-size="11">{th:.2f}</text>')

    # Legend
    leg_x = margin_x + 15
    for s_i, (m_id, _) in enumerate(models_threshold_data.items()):
        ly = margin_y + 20 + s_i * 18
        color = colors.get(m_id, "#cbd5e1")
        svg_lines.append(f'<line x1="{leg_x}" y1="{ly-4}" x2="{leg_x+18}" y2="{ly-4}" stroke="{color}" stroke-width="2.5"/>')
        svg_lines.append(f'<text x="{leg_x+24}" y="{ly}" fill="#e2e8f0" font-size="11">{m_id}</text>')

    svg_lines.append('</svg>')
    with open(out_svg_path, "w", encoding="utf-8") as f:
        f.write("\n".join(svg_lines))


def evaluate_attention_full_scene_validation(
    model: nn.Module,
    manifest_path: str,
    device: torch.device,
    save_attention_maps_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """Evaluate full-scene validation performance across 6 thresholds."""
    with open(manifest_path, "r", encoding="utf-8") as f:
        m_data = json.load(f)

    val_scenes = [s for s in m_data["scenes"] if s["split"] == "val"]
    model.eval()

    thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]
    scene_records = []
    attention_summary = []

    if save_attention_maps_dir:
        os.makedirs(save_attention_maps_dir, exist_ok=True)

    for s in val_scenes:
        assert s["scene_id"] not in LOCKED_TEST_SCENES, f"LOCKED TEST SCENE ACCESSED: {s['scene_id']}"
        img_p = os.path.join(_REPO_ROOT, s["image_path"])
        msk_p = s.get("mask_path")

        with rasterio.open(img_p) as src:
            vv_raw = src.read(1).astype(np.float32)
            vh_raw = src.read(2).astype(np.float32) if src.count >= 2 else vv_raw.copy()

        vv_norm = normalize_sar_band(vv_raw, polarization="VV")
        vh_norm = normalize_sar_band(vh_raw, polarization="VH")
        preprocessed = np.stack([vv_norm, vh_norm], axis=0)

        if msk_p:
            with rasterio.open(os.path.join(_REPO_ROOT, msk_p)) as src_m:
                gt_mask = (src_m.read(1) > 0).astype(np.uint8)
        else:
            gt_mask = np.zeros((2048, 2048), dtype=np.uint8)

        tiles, coords = generate_tiles(preprocessed, tile_size=512, stride=448)
        tile_preds = []
        captured_att = None

        with torch.no_grad():
            for t_idx, tile in enumerate(tiles):
                tile_t = torch.from_numpy(tile).unsqueeze(0).to(device)
                if t_idx == 0 and save_attention_maps_dir:
                    logits, att_maps = model(tile_t, return_attention=True)
                    captured_att = [m[0, 0].cpu().numpy() for m in att_maps]
                else:
                    logits = model(tile_t)
                probs = torch.softmax(logits, dim=1)[:, 1, :, :]
                tile_preds.append(probs[0].cpu().numpy())

        if captured_att is not None and save_attention_maps_dir:
            att_info = {
                "scene_id": s["scene_id"],
                "category": s.get("category", "unknown"),
                "attention_gate_layers": {
                    f"gate_{i+1}": {
                        "shape": list(captured_att[i].shape),
                        "mean": float(captured_att[i].mean()),
                        "std": float(captured_att[i].std()),
                        "min": float(captured_att[i].min()),
                        "max": float(captured_att[i].max()),
                    }
                    for i in range(len(captured_att))
                }
            }
            attention_summary.append(att_info)

        full_prob = reconstruct_full_mask(
            tile_predictions=tile_preds,
            tile_coords=coords,
            full_height=2048,
            full_width=2048,
            tile_size=512,
        )

        th_res = {}
        for th in thresholds:
            cm = generate_confusion_matrix(gt_mask, full_prob, threshold=th)
            m = calc_cm_metrics(cm)
            th_res[str(th)] = {
                "threshold": th,
                "tp": cm["tp"],
                "fp": cm["fp"],
                "fn": cm["fn"],
                "tn": cm["tn"],
                "iou": float(m["iou"]),
                "dice": float(m["dice"]),
                "precision": float(m["precision"]),
                "recall": float(m["recall"]),
                "fpr": float(m["fpr"]),
            }

        scene_records.append({
            "scene_id": s["scene_id"],
            "category": s.get("category", "unknown"),
            "ground_truth_pixels": int(gt_mask.sum()),
            "metrics_by_threshold": th_res,
        })

    if save_attention_maps_dir:
        with open(os.path.join(save_attention_maps_dir, "validation_attention_summary.json"), "w", encoding="utf-8") as f:
            json.dump(attention_summary, f, indent=2)

    # Aggregates across thresholds
    threshold_aggregates = []
    for th in thresholds:
        th_s = str(th)
        cm_all = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
        cm_clean = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
        cm_look = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
        cm_oil = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

        for rec in scene_records:
            cat = rec["category"].lower()
            m = rec["metrics_by_threshold"][th_s]
            cm_all["tp"] += m["tp"]
            cm_all["fp"] += m["fp"]
            cm_all["fn"] += m["fn"]
            cm_all["tn"] += m["tn"]

            if "oil" in cat and "no_oil" not in cat:
                cm_oil["tp"] += m["tp"]
                cm_oil["fp"] += m["fp"]
                cm_oil["fn"] += m["fn"]
                cm_oil["tn"] += m["tn"]
            elif "clean" in cat or "no_oil" in cat:
                cm_clean["tp"] += m["tp"]
                cm_clean["fp"] += m["fp"]
                cm_clean["fn"] += m["fn"]
                cm_clean["tn"] += m["tn"]
            elif "look" in cat:
                cm_look["tp"] += m["tp"]
                cm_look["fp"] += m["fp"]
                cm_look["fn"] += m["fn"]
                cm_look["tn"] += m["tn"]

        micro_m = calc_cm_metrics(cm_all)
        clean_fpr = compute_fpr(cm_clean["fp"], cm_clean["tn"]) if (cm_clean["fp"] + cm_clean["tn"]) > 0 else 0.0
        look_fpr = compute_fpr(cm_look["fp"], cm_look["tn"]) if (cm_look["fp"] + cm_look["tn"]) > 0 else 0.0
        oil_iou = calc_cm_metrics(cm_oil)["iou"] if (cm_oil["tp"] + cm_oil["fp"] + cm_oil["fn"]) > 0 else 0.0
        oil_dice = calc_cm_metrics(cm_oil)["dice"] if (cm_oil["tp"] + cm_oil["fp"] + cm_oil["fn"]) > 0 else 0.0

        threshold_aggregates.append({
            "threshold": th,
            "micro_pixel_aggregate": {
                "tp": cm_all["tp"],
                "fp": cm_all["fp"],
                "fn": cm_all["fn"],
                "tn": cm_all["tn"],
                "iou": round(float(micro_m["iou"]), 6),
                "dice": round(float(micro_m["dice"]), 6),
                "precision": round(float(micro_m["precision"]), 6),
                "recall": round(float(micro_m["recall"]), 6),
                "fpr": round(float(micro_m["fpr"]), 6),
            },
            "category_breakdown": {
                "clean_ocean_fpr": round(float(clean_fpr), 6),
                "look_alike_fpr": round(float(look_fpr), 6),
                "oil_scenes_iou": round(float(oil_iou), 6),
                "oil_scenes_dice": round(float(oil_dice), 6),
            }
        })

    return {
        "threshold_aggregates": threshold_aggregates,
        "scenes": scene_records,
    }


def main():
    print("=" * 80)
    print("STARTING PART 0.9B — CONTROLLED ATTENTION U-NET ARCHITECTURE EXPERIMENT")
    print("=" * 80)

    out_dir = os.path.join(_REPO_ROOT, "ml", "experiments", "results", "v09b_attention")
    os.makedirs(out_dir, exist_ok=True)
    att_maps_dir = os.path.join(out_dir, "attention_maps")
    os.makedirs(att_maps_dir, exist_ok=True)

    manifest_path = os.path.join(_REPO_ROOT, "ml", "datasets", "manifest.json")
    v6_ckpt_path = os.path.join(_REPO_ROOT, "ml", "model_registry", "versions", "unet_dual_pol_sar_v6.pth")
    registry_path = os.path.join(_REPO_ROOT, "ml", "model_registry", "registry.json")

    # 1. Preflight Safety & Quarantine Audit
    print("\n[1/7] Performing Preflight Safety & Quarantine Audit...")
    with open(manifest_path, "r", encoding="utf-8") as f:
        m_data = json.load(f)

    scenes = m_data["scenes"]
    train_scenes = [s for s in scenes if s["split"] == "train"]
    val_scenes = [s for s in scenes if s["split"] == "val"]
    test_scenes = [s for s in scenes if s["split"] == "test"]

    assert len(train_scenes) == 28, f"Expected 28 train scenes, got {len(train_scenes)}"
    assert len(val_scenes) == 7, f"Expected 7 val scenes, got {len(val_scenes)}"
    assert len(test_scenes) == 5, f"Expected 5 test scenes, got {len(test_scenes)}"

    for ts in test_scenes:
        assert ts["scene_id"] in LOCKED_TEST_SCENES, f"Unexpected test scene: {ts['scene_id']}"
    print("  [OK] 28 Train scenes verified (448 tiles)")
    print("  [OK] 7 Validation scenes verified (112 tiles)")
    print("  [OK] 5 Part III Held-out test scenes strictly LOCKED & QUARANTINED")

    manifest_sha = compute_file_sha256(manifest_path)
    v6_sha = compute_file_sha256(v6_ckpt_path)
    print(f"  [OK] Manifest SHA-256: {manifest_sha}")
    print(f"  [OK] V6 Baseline SHA-256: {v6_sha}")

    # 2. Model Architecture & Parameter Count Audit
    print("\n[2/7] Checking Architecture & Parameter Counts...")
    v6_model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    v09b_model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)

    v6_params = count_parameters(v6_model)
    v09b_params = count_parameters(v09b_model)
    param_diff = v09b_params - v6_params
    param_pct = (param_diff / v6_params) * 100.0

    print(f"  V6 Baseline Parameters:       {v6_params:,}")
    print(f"  V09B Attention Parameters:    {v09b_params:,}")
    print(f"  Parameter Difference:         +{param_diff:,} (+{param_pct:.2f}%)")

    if v09b_params > 2.0 * v6_params:
        raise RuntimeError(f"FATAL: Model parameters ({v09b_params}) exceed 2x V6 parameters ({v6_params * 2})!")
    print("  [OK] Parameter growth is strictly controlled (< 2x limit).")

    # 3. Setup Training Configuration
    print("\n[3/7] Setting Up Frozen Training Pipeline...")
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"  Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    seed = 42
    set_seed(seed)

    # Loss: CombinedLoss (CE weight=1.0, Dice weight=1.0, fg_weight=5.0)
    class_weights = torch.tensor([1.0, 5.0], dtype=torch.float32).to(device)
    criterion = CombinedLoss(weight=1.0, dice_weight=1.0, class_weights=class_weights)

    # Model to device
    v09b_model = v09b_model.to(device)
    optimizer = optim.AdamW(v09b_model.parameters(), lr=1e-4, weight_decay=1e-4)

    use_amp = torch.cuda.is_available()
    try:
        scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    except Exception:
        scaler = torch.cuda.amp.GradScaler(enabled=use_amp)

    # Datasets
    train_dataset = V6TileDataset(manifest_path, split="train", repo_root=_REPO_ROOT)
    val_dataset = V6TileDataset(manifest_path, split="val", repo_root=_REPO_ROOT)

    train_loader = DataLoader(
        train_dataset,
        batch_size=2,
        shuffle=True,
        num_workers=0,
        pin_memory=True if device.type == "cuda" else False,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=2,
        shuffle=False,
        num_workers=0,
        pin_memory=True if device.type == "cuda" else False,
    )

    print(f"  Train tiles: {len(train_dataset)} | Val tiles: {len(val_dataset)}")
    print(f"  Loss: CombinedLoss(ce=1.0, dice=1.0, fg_weight=5.0)")
    print(f"  Optimizer: AdamW(lr=1e-4, wd=1e-4), batch_size=2, AMP={use_amp}")

    # 4. Train UNetAttention
    print("\n[4/7] Executing Training (max 30 epochs, early stopping patience=7 on val Dice)...")
    max_epochs = 30
    patience = 7
    best_val_dice = -1.0
    best_epoch = -1
    best_state_dict = None
    epochs_no_improve = 0
    history = []
    t_start = time.time()

    for epoch in range(1, max_epochs + 1):
        ep_start = time.time()
        v09b_model.train()
        train_loss_sum = 0.0
        train_batches = 0

        for imgs, masks, _ in train_loader:
            imgs = imgs.to(device, non_blocking=True)
            masks = masks.to(device, non_blocking=True)

            optimizer.zero_grad()
            if use_amp:
                with torch.amp.autocast("cuda"):
                    outputs = v09b_model(imgs)
                    loss, _ = criterion(outputs, masks)
                scaler.scale(loss).backward()
                scaler.step(optimizer)
                scaler.update()
            else:
                outputs = v09b_model(imgs)
                loss, _ = criterion(outputs, masks)
                loss.backward()
                optimizer.step()

            train_loss_sum += loss.item()
            train_batches += 1

        train_loss = train_loss_sum / max(1, train_batches)

        # Validation loop (tile-level)
        v09b_model.eval()
        val_loss_sum = 0.0
        val_batches = 0
        total_tp, total_fp, total_fn, total_tn = 0, 0, 0, 0

        with torch.no_grad():
            for imgs, masks, _ in val_loader:
                imgs = imgs.to(device, non_blocking=True)
                masks = masks.to(device, non_blocking=True)

                if use_amp:
                    with torch.amp.autocast("cuda"):
                        outputs = v09b_model(imgs)
                        loss, _ = criterion(outputs, masks)
                else:
                    outputs = v09b_model(imgs)
                    loss, _ = criterion(outputs, masks)

                val_loss_sum += loss.item()
                val_batches += 1

                probs = torch.softmax(outputs, dim=1)[:, 1, :, :]
                preds = (probs > 0.50).long()
                targets = masks.long()

                tp = ((preds == 1) & (targets == 1)).sum().item()
                fp = ((preds == 1) & (targets == 0)).sum().item()
                fn = ((preds == 0) & (targets == 1)).sum().item()
                tn = ((preds == 0) & (targets == 0)).sum().item()

                total_tp += tp
                total_fp += fp
                total_fn += fn
                total_tn += tn

        val_loss = val_loss_sum / max(1, val_batches)
        cm_tile = {"tp": total_tp, "fp": total_fp, "fn": total_fn, "tn": total_tn}
        val_metrics = calc_cm_metrics(cm_tile)

        ep_dice = float(val_metrics["dice"])
        ep_iou = float(val_metrics["iou"])
        ep_prec = float(val_metrics["precision"])
        ep_rec = float(val_metrics["recall"])
        ep_fpr = float(val_metrics["fpr"])

        history.append({
            "epoch": epoch,
            "train_loss": round(train_loss, 6),
            "val_loss": round(val_loss, 6),
            "val_dice": round(ep_dice, 6),
            "val_iou": round(ep_iou, 6),
            "val_precision": round(ep_prec, 6),
            "val_recall": round(ep_rec, 6),
            "val_fpr": round(ep_fpr, 6),
            "duration_s": round(time.time() - ep_start, 2),
        })

        print(
            f"  Epoch {epoch:02d}/{max_epochs:02d} [{time.time() - ep_start:.1f}s] - "
            f"Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | "
            f"Val Dice: {ep_dice:.4f} | IoU: {ep_iou:.4f} | Recall: {ep_rec:.4f} | Prec: {ep_prec:.4f} | FPR: {ep_fpr:.6f}"
        )

        if ep_dice > best_val_dice:
            best_val_dice = ep_dice
            best_epoch = epoch
            best_state_dict = {k: v.cpu().clone() for k, v in v09b_model.state_dict().items()}
            epochs_no_improve = 0
            print(f"    * Best checkpoint updated (Epoch {epoch}, Val Dice: {ep_dice:.4f})")
        else:
            epochs_no_improve += 1
            if epochs_no_improve >= patience:
                print(f"  Early stopping triggered at epoch {epoch} (patience={patience})")
                break

    total_train_time = time.time() - t_start
    print(f"  Training completed in {total_train_time:.1f}s. Best Epoch: {best_epoch} (Val Dice: {best_val_dice:.4f})")

    # 5. Save Checkpoint & Checkpoint Integrity Verification
    print("\n[5/7] Saving Checkpoint & Verifying Integrity...")
    checkpoint_rel_path = "ml/model_registry/versions/unet_dual_pol_sar_v09b_attention.pth"
    checkpoint_abs_path = os.path.join(_REPO_ROOT, checkpoint_rel_path)
    os.makedirs(os.path.dirname(checkpoint_abs_path), exist_ok=True)

    checkpoint_payload = {
        "model_id": "unet-dual-pol-sar-v09b-attention",
        "architecture": "UNetAttention",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "epoch": best_epoch,
        "best_val_dice": best_val_dice,
        "model_state_dict": best_state_dict,
        "optimizer_state_dict": optimizer.state_dict(),
        "hyperparameters": {
            "in_channels": 2,
            "num_classes": 2,
            "base_channels": 16,
            "bilinear": True,
            "loss": "CombinedLoss",
            "loss_params": {"ce_weight": 1.0, "dice_weight": 1.0, "foreground_weight": 5.0},
            "optimizer": "AdamW",
            "learning_rate": 1e-4,
            "weight_decay": 1e-4,
            "batch_size": 2,
            "tile_size": 512,
            "seed": 42,
            "preprocessing": "sentinel1_sigma0_db_v1",
        },
        "system_info": {
            "python_version": sys.version,
            "torch_version": torch.__version__,
            "cuda_available": torch.cuda.is_available(),
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        }
    }

    torch.save(checkpoint_payload, checkpoint_abs_path)
    ckpt_sha = compute_file_sha256(checkpoint_abs_path)
    ckpt_size = os.path.getsize(checkpoint_abs_path)
    print(f"  [OK] Checkpoint saved to: {checkpoint_rel_path}")
    print(f"  [OK] Checkpoint SHA-256:  {ckpt_sha}")
    print(f"  [OK] Checkpoint Size:     {ckpt_size:,} bytes")

    # Load and test on CPU and CUDA
    cpu_model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    raw_cpu = torch.load(checkpoint_abs_path, map_location="cpu", weights_only=False)
    incompat = cpu_model.load_state_dict(raw_cpu["model_state_dict"])
    assert len(incompat.missing_keys) == 0, f"Missing keys: {incompat.missing_keys}"
    assert len(incompat.unexpected_keys) == 0, f"Unexpected keys: {incompat.unexpected_keys}"
    print("  [OK] CPU load verification passed (missing keys=0, unexpected keys=0)")

    if torch.cuda.is_available():
        cuda_model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
        raw_cuda = torch.load(checkpoint_abs_path, map_location="cuda:0", weights_only=False)
        incompat_cuda = cuda_model.load_state_dict(raw_cuda["model_state_dict"])
        assert len(incompat_cuda.missing_keys) == 0
        assert len(incompat_cuda.unexpected_keys) == 0
        print("  [OK] CUDA load verification passed (missing keys=0, unexpected keys=0)")

    # 6. Full-Scene Validation Evaluation Across Thresholds
    print("\n[6/7] Evaluating Full-Scene Validation Across Thresholds [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]...")
    eval_model = UNetAttention(in_channels=2, num_classes=2, base_channels=16, bilinear=True).to(device)
    eval_model.load_state_dict(best_state_dict)
    eval_model.eval()

    val_eval_results = evaluate_attention_full_scene_validation(
        model=eval_model,
        manifest_path=manifest_path,
        device=device,
        save_attention_maps_dir=att_maps_dir,
    )

    # 7. Generate Artifacts, Visuals & Comparative Analysis
    print("\n[7/7] Generating Artifacts, Plots, and Registering Model...")
    
    # Load historical baselines for comparison
    v6_results_path = os.path.join(_REPO_ROOT, "ml/experiments/results/v6_training/v6_validation.json")
    v8_results_path = os.path.join(_REPO_ROOT, "ml/experiments/results/v08_loss_experiments/loss_experiment_summary.json")
    v09a_results_path = os.path.join(_REPO_ROOT, "ml/experiments/results/v09a_multiscale/threshold_sweep.json")

    with open(v6_results_path, "r", encoding="utf-8") as f:
        v6_eval_data = json.load(f)

    with open(v8_results_path, "r", encoding="utf-8") as f:
        v8_summary_data = json.load(f)

    with open(v09a_results_path, "r", encoding="utf-8") as f:
        v09a_sweep_data = json.load(f)

    # Threshold data dictionary for plots
    models_th_data = {
        "V6_BASELINE": v6_eval_data.get("threshold_aggregates", []),
        "V8_A_BASELINE_LOSS": v8_summary_data["experiments"]["V8_A_BASELINE_LOSS"]["threshold_sweep"],
        "V8_B_FOCAL_DICE": v8_summary_data["experiments"]["V8_B_FOCAL_DICE"]["threshold_sweep"],
        "V8_C_FOCAL_TVERSKY": v8_summary_data["experiments"]["V8_C_FOCAL_TVERSKY"]["threshold_sweep"],
        "V8_D_HIGH_FG_WEIGHT": v8_summary_data["experiments"]["V8_D_HIGH_FG_WEIGHT"]["threshold_sweep"],
        "V09A_MULTISCALE": v09a_sweep_data.get("threshold_aggregates", []),
        "V09B_ATTENTION": val_eval_results["threshold_aggregates"],
    }

    # Generate SVGs
    generate_training_curves_svg(
        history=history,
        title="Part 0.9B Attention U-Net Training Curves",
        out_svg_path=os.path.join(out_dir, "training_curves.svg"),
    )
    generate_threshold_curves_svg(
        models_threshold_data=models_th_data,
        metric_name="dice",
        metric_label="Validation Dice",
        out_svg_path=os.path.join(out_dir, "dice_vs_threshold.svg"),
    )
    generate_threshold_curves_svg(
        models_threshold_data=models_th_data,
        metric_name="look_alike_fpr",
        metric_label="Look-Alike False Positive Rate (FPR)",
        out_svg_path=os.path.join(out_dir, "lookalike_fpr_vs_threshold.svg"),
    )
    print("  [OK] SVGs generated (training_curves.svg, dice_vs_threshold.svg, lookalike_fpr_vs_threshold.svg)")

    # Save JSON artifacts
    # 1. experiment_config.json
    exp_config = {
        "experiment_id": "PART_0_9B_ATTENTION_ARCHITECTURE",
        "model_id": "unet-dual-pol-sar-v09b-attention",
        "status": "EXPERIMENTAL",
        "architecture": {
            "name": "UNetAttention",
            "in_channels": 2,
            "num_classes": 2,
            "base_channels": 16,
            "bilinear": True,
            "attention_mechanism": "Additive Spatial Attention Gate (Oktay et al.)",
            "attention_gates": [
                {"gate": "att1", "in_channels_x": 128, "in_channels_g": 128, "inter_channels": 64},
                {"gate": "att2", "in_channels_x": 64, "in_channels_g": 64, "inter_channels": 32},
                {"gate": "att3", "in_channels_x": 32, "in_channels_g": 32, "inter_channels": 16},
                {"gate": "att4", "in_channels_x": 16, "in_channels_g": 16, "inter_channels": 8},
            ],
        },
        "parameter_comparison": {
            "v6_parameters": v6_params,
            "v09b_parameters": v09b_params,
            "parameter_difference": param_diff,
            "percentage_increase": round(param_pct, 2),
        },
        "training": {
            "loss": "CombinedLoss",
            "loss_params": {"ce_weight": 1.0, "dice_weight": 1.0, "foreground_weight": 5.0},
            "optimizer": "AdamW",
            "learning_rate": 1e-4,
            "weight_decay": 1e-4,
            "batch_size": 2,
            "amp": use_amp,
            "max_epochs": max_epochs,
            "patience": patience,
            "seed": seed,
        },
        "preprocessing": "sentinel1_sigma0_db_v1",
        "hardware": {
            "device": str(device),
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "torch_version": torch.__version__,
        }
    }
    with open(os.path.join(out_dir, "experiment_config.json"), "w", encoding="utf-8") as f:
        json.dump(exp_config, f, indent=2)

    # 2. training_history.json
    with open(os.path.join(out_dir, "training_history.json"), "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    # 3. validation_metrics.json (at 0.50 threshold)
    th50_agg = next(item for item in val_eval_results["threshold_aggregates"] if item["threshold"] == 0.50)
    with open(os.path.join(out_dir, "validation_metrics.json"), "w", encoding="utf-8") as f:
        json.dump(th50_agg, f, indent=2)

    # 4. threshold_sweep.json
    with open(os.path.join(out_dir, "threshold_sweep.json"), "w", encoding="utf-8") as f:
        json.dump(val_eval_results, f, indent=2)

    # 5. runtime_summary.json
    runtime_summary = {
        "total_training_duration_seconds": round(total_train_time, 2),
        "total_epochs_trained": len(history),
        "best_epoch": best_epoch,
        "best_epoch_dice": round(best_val_dice, 6),
        "early_stopping_triggered": len(history) < max_epochs,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(os.path.join(out_dir, "runtime_summary.json"), "w", encoding="utf-8") as f:
        json.dump(runtime_summary, f, indent=2)

    # 6. model_summary.json
    model_summary = {
        "model_id": "unet-dual-pol-sar-v09b-attention",
        "checkpoint_path": checkpoint_rel_path,
        "checkpoint_sha256": ckpt_sha,
        "checkpoint_size_bytes": ckpt_size,
        "parameter_count": v09b_params,
        "architecture": "UNetAttention",
    }
    with open(os.path.join(out_dir, "model_summary.json"), "w", encoding="utf-8") as f:
        json.dump(model_summary, f, indent=2)

    # 7. dataset_snapshot.json
    dataset_snapshot = {
        "manifest_path": "ml/datasets/manifest.json",
        "manifest_sha256": manifest_sha,
        "total_scenes": len(scenes),
        "train_scenes": len(train_scenes),
        "val_scenes": len(val_scenes),
        "held_out_test_scenes": len(test_scenes),
        "held_out_test_status": "STRICTLY_LOCKED_QUARANTINED",
    }
    with open(os.path.join(out_dir, "dataset_snapshot.json"), "w", encoding="utf-8") as f:
        json.dump(dataset_snapshot, f, indent=2)

    # 8. integrity.json
    integrity = {
        "checkpoint_sha256": ckpt_sha,
        "manifest_sha256": manifest_sha,
        "v6_baseline_sha256": v6_sha,
        "cpu_load_verified": True,
        "cuda_load_verified": torch.cuda.is_available(),
        "missing_keys": 0,
        "unexpected_keys": 0,
        "held_out_test_accessed": False,
    }
    with open(os.path.join(out_dir, "integrity.json"), "w", encoding="utf-8") as f:
        json.dump(integrity, f, indent=2)

    print("  [OK] All JSON artifacts created in ml/experiments/results/v09b_attention/")

    # Update Registry
    with open(registry_path, "r", encoding="utf-8") as f:
        reg_data = json.load(f)

    reg_models = [m for m in reg_data.get("models", []) if m.get("model_id") != "unet-dual-pol-sar-v09b-attention"]
    reg_models.append({
        "model_id": "unet-dual-pol-sar-v09b-attention",
        "architecture": "UNetAttention",
        "framework": "PyTorch",
        "in_channels": 2,
        "num_classes": 2,
        "classes": [
            "Clean Sea Surface",
            "Potential Oil Spill"
        ],
        "input_shape": [2, 512, 512],
        "checkpoint_path": checkpoint_rel_path,
        "training_dataset": "sentinel1_oil_spill_verified_real_subset_28_train",
        "status": "experimental",
        "metrics": {
            "val_dice_at_0_50": th50_agg["micro_pixel_aggregate"]["dice"],
            "val_iou_at_0_50": th50_agg["micro_pixel_aggregate"]["iou"],
            "val_recall_at_0_50": th50_agg["micro_pixel_aggregate"]["recall"],
            "val_precision_at_0_50": th50_agg["micro_pixel_aggregate"]["precision"],
            "clean_ocean_fpr_at_0_50": th50_agg["category_breakdown"]["clean_ocean_fpr"],
            "look_alike_fpr_at_0_50": th50_agg["category_breakdown"]["look_alike_fpr"],
            "oil_scenes_iou_at_0_50": th50_agg["category_breakdown"]["oil_scenes_iou"],
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "description": "Attention U-Net with additive spatial attention gates on all skip connections for dual-pol SAR.",
        "hyperparameters": {
            "experiment_id": "PART_0_9B_ATTENTION_ARCHITECTURE",
            "epochs": len(history),
            "best_epoch": best_epoch,
            "batch_size": 2,
            "learning_rate": 0.0001,
            "base_channels": 16,
            "optimizer": "AdamW",
            "loss": "CombinedLoss",
            "loss_params": {
                "ce_weight": 1.0,
                "dice_weight": 1.0,
                "foreground_weight": 5.0
            },
            "tile_size": 512,
            "polarization": "VV+VH",
            "seed": 42,
            "preprocessing": "sentinel1_sigma0_db_v1",
            "parameters": v09b_params,
        }
    })
    reg_data["models"] = reg_models

    with open(registry_path, "w", encoding="utf-8") as f:
        json.dump(reg_data, f, indent=2)

    print("  [OK] Registry updated: unet-dual-pol-sar-v09b-attention registered as status='experimental'")

    print("\n" + "=" * 80)
    print("PART 0.9B ATTENTION EXPERIMENT COMPLETED SUCCESSFULLY!")
    print("=" * 80)
    print(f"Model ID:              unet-dual-pol-sar-v09b-attention")
    print(f"Checkpoint:            {checkpoint_rel_path}")
    print(f"SHA-256:               {ckpt_sha}")
    print(f"V6 Params:             {v6_params:,}")
    print(f"V09B Params:           {v09b_params:,} (+{param_diff:,}, +{param_pct:.2f}%)")
    print(f"Validation @ 0.50:")
    print(f"  Micro IoU:           {th50_agg['micro_pixel_aggregate']['iou']:.6f}")
    print(f"  Micro Dice:          {th50_agg['micro_pixel_aggregate']['dice']:.6f}")
    print(f"  Precision:           {th50_agg['micro_pixel_aggregate']['precision']:.6f}")
    print(f"  Recall:              {th50_agg['micro_pixel_aggregate']['recall']:.6f}")
    print(f"  Clean-ocean FPR:     {th50_agg['category_breakdown']['clean_ocean_fpr']:.6f}")
    print(f"  Look-alike FPR:      {th50_agg['category_breakdown']['look_alike_fpr']:.6f}")
    print(f"  Oil Scenes IoU:      {th50_agg['category_breakdown']['oil_scenes_iou']:.6f}")
    print("=" * 80)


if __name__ == "__main__":
    main()
