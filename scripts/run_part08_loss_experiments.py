"""
Execution Script for PART 0.8 — Controlled Loss-Function Experiments.
=====================================================================

Runs 4 controlled loss experiments:
1. V8_A_BASELINE_LOSS: CombinedLoss (Weighted CE 5.0 + Soft Dice)
2. V8_B_FOCAL_DICE: FocalDiceLoss (alpha=0.25, gamma=2.0 + Soft Dice)
3. V8_C_FOCAL_TVERSKY: FocalTverskyLoss (alpha=0.7, beta=0.3, gamma=0.75)
4. V8_D_HIGH_FG_WEIGHT: CombinedLoss (Weighted CE 10.0 + Soft Dice)

Guarantees identical:
- Architecture: UNet(2, 2, 16, bilinear=True)
- Preprocessing: sentinel1_sigma0_db_v1
- Dataset: 28 train, 7 val, 5 locked test
- Hardware & AMP: cuda:0, FP16
- Seed: 42
- Early stopping: patience=7
"""

import os
import sys
import json
import time
import yaml
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import rasterio
import torch

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from app.models.unet.architecture import UNet
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.normalization import normalize_sar_band
from ml.training.loss_experiment_runner import ControlledLossTrainer
from ml.training.train_v6 import compute_file_sha256
from ml.evaluation.metrics import compute_fpr
from ml.evaluation.confusion_matrix import generate_confusion_matrix, calculate_confusion_metrics


def generate_experiment_svg_curves(history: list, title: str, out_svg_path: str):
    """Generate pure Python SVG curves for a single experiment."""
    svg_panels = [
        ("Training & Validation Loss", [
            ("Train Loss", [h["train_loss"] for h in history], "#1e40af", "solid"),
            ("Val Loss", [h["val_loss"] for h in history], "#dc2626", "dashed"),
        ]),
        ("Validation Dice / F1", [
            ("Val Dice", [h["val_dice"] for h in history], "#16a34a", "solid"),
        ]),
        ("Validation IoU", [
            ("Val IoU", [h["val_iou"] for h in history], "#9333ea", "solid"),
        ]),
        ("Validation Precision", [
            ("Val Precision", [h["val_precision"] for h in history], "#ea580c", "solid"),
        ]),
        ("Validation Recall", [
            ("Val Recall", [h["val_recall"] for h in history], "#0284c7", "solid"),
        ]),
        ("Validation False Positive Rate (FPR)", [
            ("Val FPR", [h["val_fpr"] for h in history], "#b91c1c", "solid"),
        ]),
    ]

    svg_width, svg_height = 1200, 780
    margin_x, margin_y = 60, 70
    panel_w, panel_h = 340, 280
    gap_x, gap_y = 50, 60

    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_width} {svg_height}" width="{svg_width}" height="{svg_height}" style="background:#0f172a; font-family:sans-serif;">',
        f'<text x="{svg_width//2}" y="36" text-anchor="middle" fill="#f8fafc" font-size="20" font-weight="bold">{title}</text>',
        f'<text x="{svg_width//2}" y="56" text-anchor="middle" fill="#94a3b8" font-size="12">Training history over {len(history)} epochs | Seed: 42 | Preprocessing: sentinel1_sigma0_db_v1</text>',
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


def generate_comparison_svg(all_results: Dict[str, Any], out_svg_path: str):
    """Generate multi-experiment overlay comparison SVG."""
    svg_width, svg_height = 1200, 600
    svg_lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {svg_width} {svg_height}" width="{svg_width}" height="{svg_height}" style="background:#0f172a; font-family:sans-serif;">',
        f'<text x="{svg_width//2}" y="36" text-anchor="middle" fill="#f8fafc" font-size="20" font-weight="bold">Part 0.8 Controlled Loss-Function Experiments — Validation Comparison</text>',
        f'<text x="{svg_width//2}" y="56" text-anchor="middle" fill="#94a3b8" font-size="12">Validation Dice and Loss trajectories across 4 loss objectives on UNet Dual-Pol SAR</text>',
    ]

    colors = {
        "V8_A_BASELINE_LOSS": "#3b82f6",     # blue
        "V8_B_FOCAL_DICE": "#10b981",        # green
        "V8_C_FOCAL_TVERSKY": "#f59e0b",     # amber
        "V8_D_HIGH_FG_WEIGHT": "#ec4899",    # pink
    }

    panels = [
        ("Validation Dice / F1 Score", "val_dice", 60, 80, 500, 440, 0.0, 0.15),
        ("Validation Loss", "val_loss", 620, 80, 500, 440, 0.0, 3.0),
    ]

    for title, metric_key, px, py, pw, ph, def_min, def_max in panels:
        svg_lines.append(f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>')
        svg_lines.append(f'<text x="{px + pw//2}" y="{py + 28}" text-anchor="middle" fill="#e2e8f0" font-size="15" font-weight="600">{title}</text>')

        plot_x = px + 50
        plot_y = py + 50
        plot_w = pw - 80
        plot_h = ph - 100

        svg_lines.append(f'<rect x="{plot_x}" y="{plot_y}" width="{plot_w}" height="{plot_h}" fill="#0f172a" stroke="#475569" stroke-width="1"/>')
        for g in range(1, 5):
            gy = plot_y + int(plot_h * g / 5)
            svg_lines.append(f'<line x1="{plot_x}" y1="{gy}" x2="{plot_x + plot_w}" y2="{gy}" stroke="#334155" stroke-dasharray="3,3"/>')

        all_series = []
        max_ep = 1
        for exp_id, res in all_results.items():
            hist = res.get("history", [])
            vals = [h[metric_key] for h in hist]
            if len(hist) > max_ep:
                max_ep = len(hist)
            all_series.append((exp_id, vals))

        max_v = max([v for _, vals in all_series for v in vals if v is not None] + [def_max])
        min_v = 0.0
        range_v = max_v - min_v if max_v > min_v else 1.0

        for exp_id, vals in all_series:
            color = colors.get(exp_id, "#cbd5e1")
            points = []
            for ep_i, v in enumerate(vals):
                x_pos = plot_x if max_ep == 1 else plot_x + int(plot_w * ep_i / (max_ep - 1))
                y_pos = plot_y + plot_h - int(plot_h * (v - min_v) / range_v)
                points.append(f"{x_pos},{y_pos}")
            svg_lines.append(f'<polyline points="{" ".join(points)}" fill="none" stroke="{color}" stroke-width="2.5"/>')

        svg_lines.append(f'<text x="{plot_x - 6}" y="{plot_y + 12}" text-anchor="end" fill="#94a3b8" font-size="11">{max_v:.2f}</text>')
        svg_lines.append(f'<text x="{plot_x - 6}" y="{plot_y + plot_h}" text-anchor="end" fill="#94a3b8" font-size="11">{min_v:.2f}</text>')
        svg_lines.append(f'<text x="{plot_x}" y="{plot_y + plot_h + 18}" text-anchor="middle" fill="#94a3b8" font-size="11">1</text>')
        svg_lines.append(f'<text x="{plot_x + plot_w}" y="{plot_y + plot_h + 18}" text-anchor="middle" fill="#94a3b8" font-size="11">{max_ep}</text>')

        # Legend
        leg_x = plot_x + 10
        for s_i, (exp_id, _) in enumerate(all_series):
            ly = plot_y + 16 + s_i * 16
            color = colors.get(exp_id, "#cbd5e1")
            svg_lines.append(f'<line x1="{leg_x}" y1="{ly-3}" x2="{leg_x+18}" y2="{ly-3}" stroke="{color}" stroke-width="2.5"/>')
            svg_lines.append(f'<text x="{leg_x+24}" y="{ly}" fill="#e2e8f0" font-size="11">{exp_id}</text>')

    svg_lines.append('</svg>')
    with open(out_svg_path, "w", encoding="utf-8") as f:
        f.write("\n".join(svg_lines))


def evaluate_full_scene_validation(
    checkpoint_rel_path: str,
    manifest_path: str,
    device: torch.device,
) -> Dict[str, Any]:
    """Evaluate full-scene validation performance across 6 thresholds."""
    with open(manifest_path, "r", encoding="utf-8") as f:
        m_data = json.load(f)

    val_scenes = [s for s in m_data["scenes"] if s["split"] == "val"]
    model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    ckpt_full_path = os.path.join(_REPO_ROOT, checkpoint_rel_path)
    raw_ckpt = torch.load(ckpt_full_path, map_location="cpu", weights_only=False)
    model.load_state_dict(raw_ckpt["model_state_dict"])
    model.to(device)
    model.eval()

    thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]
    scene_records = []

    for s in val_scenes:
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
        with torch.no_grad():
            for tile in tiles:
                tile_t = torch.from_numpy(tile).unsqueeze(0).to(device)
                logits = model(tile_t)
                probs = torch.softmax(logits, dim=1)[:, 1, :, :]
                tile_preds.append(probs[0].cpu().numpy())

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
            m = calculate_confusion_metrics(cm)
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

        micro_m = calculate_confusion_metrics(cm_all)
        clean_fpr = compute_fpr(cm_clean["fp"], cm_clean["tn"]) if (cm_clean["fp"] + cm_clean["tn"]) > 0 else 0.0
        look_fpr = compute_fpr(cm_look["fp"], cm_look["tn"]) if (cm_look["fp"] + cm_look["tn"]) > 0 else 0.0
        oil_iou = calculate_confusion_metrics(cm_oil)["iou"] if (cm_oil["tp"] + cm_oil["fp"] + cm_oil["fn"]) > 0 else 0.0
        oil_dice = calculate_confusion_metrics(cm_oil)["dice"] if (cm_oil["tp"] + cm_oil["fp"] + cm_oil["fn"]) > 0 else 0.0

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
    print("STARTING PART 0.8 — CONTROLLED LOSS-FUNCTION EXPERIMENTS")
    print("=" * 80)

    out_dir = os.path.join(_REPO_ROOT, "ml", "experiments", "results", "v08_loss_experiments")
    os.makedirs(out_dir, exist_ok=True)
    plots_dir = os.path.join(out_dir, "plots")
    os.makedirs(plots_dir, exist_ok=True)

    manifest_path = os.path.join(_REPO_ROOT, "ml", "datasets", "manifest.json")
    v6_ckpt_path = os.path.join(_REPO_ROOT, "ml", "model_registry", "versions", "unet_dual_pol_sar_v6.pth")

    # 1. STEP 1: Freeze V6 Baseline Snapshot
    print("\n[1/6] Freezing V6 Baseline Snapshot...")
    v6_sha = compute_file_sha256(v6_ckpt_path)
    manifest_sha = compute_file_sha256(manifest_path)

    with open(manifest_path, "r", encoding="utf-8") as f:
        m_data = json.load(f)

    train_scenes = [s for s in m_data["scenes"] if s["split"] == "train"]
    val_scenes = [s for s in m_data["scenes"] if s["split"] == "val"]
    test_scenes = [s for s in m_data["scenes"] if s["split"] == "test"]

    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "v6_checkpoint": {
            "path": "ml/model_registry/versions/unet_dual_pol_sar_v6.pth",
            "sha256": v6_sha,
            "status": "EXPERIMENTAL_FROZEN_BASELINE",
        },
        "dataset_manifest": {
            "path": "ml/datasets/manifest.json",
            "sha256": manifest_sha,
            "total_scenes": len(m_data["scenes"]),
            "train_scenes": len(train_scenes),
            "val_scenes": len(val_scenes),
            "held_out_test_scenes": len(test_scenes),
            "held_out_status": "STRICTLY_LOCKED (Quarantined)",
        },
        "hardware_environment": {
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None",
            "torch_version": str(torch.__version__),
            "cuda_version": str(torch.version.cuda) if torch.cuda.is_available() else "None",
        },
        "fixed_experimental_invariants": {
            "architecture": "UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)",
            "preprocessing": "sentinel1_sigma0_db_v1",
            "tile_size": 512,
            "batch_size": 2,
            "amp": "FP16 GradScaler",
            "optimizer": "AdamW (lr=1e-4, wd=1e-4)",
            "seed": 42,
            "epoch_budget": 30,
            "early_stopping_patience": 7,
        }
    }

    with open(os.path.join(out_dir, "baseline_snapshot.json"), "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)

    # Define Experiment Specifications
    experiments = [
        {
            "id": "V8_A_BASELINE_LOSS",
            "model_id": "unet-dual-pol-sar-v8a",
            "checkpoint_filename": "unet_dual_pol_sar_v8a.pth",
            "loss_type": "CombinedLoss",
            "loss_params": {
                "ce_weight": 1.0,
                "dice_weight": 1.0,
                "foreground_weight": 5.0,
            },
            "description": "Exact V6 baseline reproduction loss: Combined 1.0*Weighted_CE(fg=5.0) + 1.0*SoftDice.",
            "json_filename": "v8_a_baseline_loss.json",
        },
        {
            "id": "V8_B_FOCAL_DICE",
            "model_id": "unet-dual-pol-sar-v8b",
            "checkpoint_filename": "unet_dual_pol_sar_v8b.pth",
            "loss_type": "FocalDiceLoss",
            "loss_params": {
                "alpha": 0.25,
                "gamma": 2.0,
                "dice_weight": 1.0,
            },
            "description": "Focal Loss (alpha=0.25, gamma=2.0) + 1.0*SoftDice to suppress easy ocean background gradients.",
            "json_filename": "v8_b_focal_dice.json",
        },
        {
            "id": "V8_C_FOCAL_TVERSKY",
            "model_id": "unet-dual-pol-sar-v8c",
            "checkpoint_filename": "unet_dual_pol_sar_v8c.pth",
            "loss_type": "FocalTverskyLoss",
            "loss_params": {
                "alpha": 0.7,
                "beta": 0.3,
                "gamma": 0.75,
            },
            "description": "Focal-Tversky Loss with alpha=0.7 (heavy FP look-alike penalty), beta=0.3 (FN penalty), gamma=0.75.",
            "json_filename": "v8_c_focal_tversky.json",
        },
        {
            "id": "V8_D_HIGH_FG_WEIGHT",
            "model_id": "unet-dual-pol-sar-v8d",
            "checkpoint_filename": "unet_dual_pol_sar_v8d.pth",
            "loss_type": "CombinedLoss",
            "loss_params": {
                "ce_weight": 1.0,
                "dice_weight": 1.0,
                "foreground_weight": 10.0,
            },
            "description": "High foreground penalty loss: Combined 1.0*Weighted_CE(fg=10.0) + 1.0*SoftDice for extreme 1:125 imbalance.",
            "json_filename": "v8_d_high_fg_weight.json",
        },
    ]

    all_exp_results = {}

    # Run each experiment
    for idx, exp_spec in enumerate(experiments, 1):
        print(f"\n[{idx+1}/6] Running Experiment {exp_spec['id']} ({exp_spec['loss_type']})...")

        trainer = ControlledLossTrainer(
            experiment_id=exp_spec["id"],
            loss_type=exp_spec["loss_type"],
            loss_params=exp_spec["loss_params"],
            model_id=exp_spec["model_id"],
            checkpoint_filename=exp_spec["checkpoint_filename"],
            config={
                "seed": 42,
                "batch_size": 2,
                "epochs": 30,
                "early_stopping_patience": 7,
                "learning_rate": 1e-4,
                "use_amp": True,
            },
            repo_root=_REPO_ROOT,
        )

        preflight = trainer.preflight_check()
        train_res = trainer.train()

        # Step 10: Check reproducibility if V8_A
        if exp_spec["id"] == "V8_A_BASELINE_LOSS":
            print(f"[Reproducibility Check] V8_A Best Val Dice = {train_res['best_validation_dice']:.4f} at epoch {train_res['best_epoch']}.")
            print(f"[Reproducibility Check] V6 Reference Val Dice was 0.0979 at epoch 16.")

        # Full scene validation evaluation
        print(f"[{exp_spec['id']}] Evaluating best checkpoint on 7 full validation scenes...")
        val_eval = evaluate_full_scene_validation(
            checkpoint_rel_path=train_res["best_checkpoint"]["path"],
            manifest_path=manifest_path,
            device=trainer.device,
        )

        # Plot training curves
        curve_svg_path = os.path.join(plots_dir, f"{exp_spec['id'].lower()}_curves.svg")
        generate_experiment_svg_curves(
            history=train_res["history"],
            title=f"{exp_spec['id']} Training Diagnostics ({exp_spec['loss_type']})",
            out_svg_path=curve_svg_path,
        )

        exp_record = {
            "experiment_id": exp_spec["id"],
            "model_id": exp_spec["model_id"],
            "status": "EXPERIMENTAL",
            "loss_name": exp_spec["loss_type"],
            "loss_parameters": exp_spec["loss_params"],
            "description": exp_spec["description"],
            "architecture": "UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)",
            "preprocessing": "sentinel1_sigma0_db_v1",
            "dataset_manifest_hash": manifest_sha,
            "seed": 42,
            "optimizer": "AdamW (lr=1e-4, wd=1e-4)",
            "total_epochs_trained": train_res["total_epochs_trained"],
            "best_epoch": train_res["best_epoch"],
            "best_validation_dice_patch": train_res["best_validation_dice"],
            "total_training_duration_seconds": train_res["total_training_duration_seconds"],
            "checkpoint": train_res["best_checkpoint"],
            "last_checkpoint": train_res["last_checkpoint"],
            "validation_evaluation": {
                "validation_scenes_count": len(val_scenes),
                "held_out_test_status": "STRICTLY_LOCKED",
                "threshold_aggregates": val_eval["threshold_aggregates"],
                "scene_breakdowns": val_eval["scenes"],
            },
            "history": train_res["history"],
        }

        # Save individual experiment JSON
        with open(os.path.join(out_dir, exp_spec["json_filename"]), "w", encoding="utf-8") as f:
            json.dump(exp_record, f, indent=2)

        all_exp_results[exp_spec["id"]] = exp_record

    # Multi-experiment overlay plot
    overlay_svg_path = os.path.join(plots_dir, "loss_comparison_curves.svg")
    generate_comparison_svg(all_exp_results, overlay_svg_path)
    print(f"\nOverlay comparison SVG saved to: {overlay_svg_path}")

    # Build summary comparison table
    summary_table_th50 = []
    for exp_spec in experiments:
        rec = all_exp_results[exp_spec["id"]]
        th50_m = rec["validation_evaluation"]["threshold_aggregates"][4]  # index 4 is threshold 0.50
        summary_table_th50.append({
            "experiment_id": exp_spec["id"],
            "model_id": exp_spec["model_id"],
            "loss_name": exp_spec["loss_type"],
            "loss_parameters": exp_spec["loss_params"],
            "checkpoint_sha256": rec["checkpoint"]["sha256"],
            "best_epoch": rec["best_epoch"],
            "total_epochs": rec["total_epochs_trained"],
            "duration_seconds": rec["total_training_duration_seconds"],
            "threshold_0_50": {
                "micro_iou": th50_m["micro_pixel_aggregate"]["iou"],
                "micro_dice": th50_m["micro_pixel_aggregate"]["dice"],
                "micro_precision": th50_m["micro_pixel_aggregate"]["precision"],
                "micro_recall": th50_m["micro_pixel_aggregate"]["recall"],
                "overall_fpr": th50_m["micro_pixel_aggregate"]["fpr"],
                "clean_ocean_fpr": th50_m["category_breakdown"]["clean_ocean_fpr"],
                "look_alike_fpr": th50_m["category_breakdown"]["look_alike_fpr"],
                "oil_scenes_iou": th50_m["category_breakdown"]["oil_scenes_iou"],
                "oil_scenes_dice": th50_m["category_breakdown"]["oil_scenes_dice"],
            }
        })

    loss_summary = {
        "phase": "PART_0_8",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "objective": "Controlled evaluation of 4 loss functions on UNet dual-pol SAR",
        "held_out_test_status": "STRICTLY_LOCKED (Part III quarantined)",
        "summary_table_threshold_0_50": summary_table_th50,
        "experiments": {exp_id: {
            "model_id": res["model_id"],
            "checkpoint": res["checkpoint"],
            "best_epoch": res["best_epoch"],
            "total_epochs": res["total_epochs_trained"],
            "threshold_sweep": res["validation_evaluation"]["threshold_aggregates"],
        } for exp_id, res in all_exp_results.items()}
    }

    with open(os.path.join(out_dir, "loss_experiment_summary.json"), "w", encoding="utf-8") as f:
        json.dump(loss_summary, f, indent=2)

    # 6. Update Model Registry
    print("\n[6/6] Updating Model Registry with V8A, V8B, V8C, V8D models as EXPERIMENTAL...")
    registry_file = os.path.join(_REPO_ROOT, "ml", "model_registry", "registry.json")
    with open(registry_file, "r", encoding="utf-8") as f:
        reg_data = json.load(f)

    models_list = reg_data.get("models", [])

    for exp_spec in experiments:
        rec = all_exp_results[exp_spec["id"]]
        th50_m = rec["validation_evaluation"]["threshold_aggregates"][4]

        reg_entry = {
            "model_id": exp_spec["model_id"],
            "architecture": "UNet",
            "framework": "PyTorch",
            "in_channels": 2,
            "num_classes": 2,
            "classes": ["Clean Sea Surface", "Potential Oil Spill"],
            "input_shape": [2, 512, 512],
            "checkpoint_path": rec["checkpoint"]["path"],
            "training_dataset": "sentinel1_oil_spill_verified_real_subset_28_train",
            "status": "experimental",
            "metrics": {
                "val_dice_at_0_50": th50_m["micro_pixel_aggregate"]["dice"],
                "val_iou_at_0_50": th50_m["micro_pixel_aggregate"]["iou"],
                "val_recall_at_0_50": th50_m["micro_pixel_aggregate"]["recall"],
                "val_precision_at_0_50": th50_m["micro_pixel_aggregate"]["precision"],
                "clean_ocean_fpr_at_0_50": th50_m["category_breakdown"]["clean_ocean_fpr"],
                "look_alike_fpr_at_0_50": th50_m["category_breakdown"]["look_alike_fpr"],
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "description": exp_spec["description"],
            "hyperparameters": {
                "experiment_id": exp_spec["id"],
                "epochs": rec["total_epochs_trained"],
                "best_epoch": rec["best_epoch"],
                "batch_size": 2,
                "learning_rate": 0.0001,
                "base_channels": 16,
                "optimizer": "AdamW",
                "loss": exp_spec["loss_type"],
                "loss_params": exp_spec["loss_params"],
                "tile_size": 512,
                "polarization": "VV+VH",
                "seed": 42,
                "preprocessing": "sentinel1_sigma0_db_v1",
            }
        }

        existing_idx = [i for i, m in enumerate(models_list) if m.get("model_id") == exp_spec["model_id"]]
        if existing_idx:
            models_list[existing_idx[0]] = reg_entry
        else:
            models_list.append(reg_entry)

    reg_data["models"] = models_list
    with open(registry_file, "w", encoding="utf-8") as f:
        json.dump(reg_data, f, indent=2)

    print("\n" + "=" * 80)
    print("PART 0.8 LOSS EXPERIMENTS COMPLETED SUCCESSFULLY!")
    print("Summary at Threshold 0.50:")
    for s in summary_table_th50:
        print(f"  - {s['experiment_id']:<22} | Dice: {s['threshold_0_50']['micro_dice']:.4f} | IoU: {s['threshold_0_50']['micro_iou']:.4f} | Recall: {s['threshold_0_50']['micro_recall']:.4f} | LookAlike FPR: {s['threshold_0_50']['look_alike_fpr']:.4f}")
    print("=" * 80)


if __name__ == "__main__":
    main()
