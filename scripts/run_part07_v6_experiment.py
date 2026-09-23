"""
Execution Script for PART 0.7 — Controlled Retraining Experiment (V6).
Handles:
1. Frozen baseline snapshot creation.
2. V6 training configuration saving.
3. Controlled training execution with early stopping on validation Dice.
4. Full-scene validation evaluation using Part 0.1 metrics.
5. Model registry update with V6 as EXPERIMENTAL.
6. Absolute locking of held-out test set.
"""

import os
import sys
import json
import time
import yaml
from datetime import datetime, timezone
import numpy as np
import rasterio
import torch

# Path setup
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from ml.evaluation.baseline_runner import BaselineEvaluationRunner, compute_file_sha256
from ml.training.train_v6 import V6Trainer, set_seed
from app.models.unet.architecture import UNet
from app.preprocessing.tiling import generate_tiles, reconstruct_full_mask
from app.preprocessing.normalization import normalize_sar_band
from ml.evaluation.metrics import (
    compute_iou,
    compute_precision,
    compute_recall,
    compute_fpr,
    compute_f1,
)
from ml.evaluation.confusion_matrix import (
    generate_confusion_matrix,
    calculate_confusion_metrics,
)


def main():
    print("=" * 75)
    print("STARTING PART 0.7 — CONTROLLED RETRAINING EXPERIMENT (V6)")
    print("=" * 75)

    out_dir = os.path.join(_REPO_ROOT, "ml", "experiments", "results", "v6_training")
    os.makedirs(out_dir, exist_ok=True)
    plots_dir = os.path.join(out_dir, "plots")
    os.makedirs(plots_dir, exist_ok=True)

    # 1. STEP 1: Freeze Current Baseline Snapshot
    print("\n[1/6] Freezing Current Baseline Snapshot...")
    v2_path = os.path.join(_REPO_ROOT, "ml", "model_registry", "versions", "unet_dual_pol_sar_v2.pth")
    v4_path = os.path.join(_REPO_ROOT, "ml", "model_registry", "versions", "unet_dual_pol_sar_v4.pth")
    manifest_path = os.path.join(_REPO_ROOT, "ml", "datasets", "manifest.json")

    baseline_snapshot = {
        "snapshot_name": "PART_0_7_EXPERIMENT_BASELINE_SNAPSHOT",
        "frozen_at": datetime.now(timezone.utc).isoformat(),
        "baseline_models": {
            "v2": {
                "checkpoint": "ml/model_registry/versions/unet_dual_pol_sar_v2.pth",
                "sha256": compute_file_sha256(v2_path),
                "role": "ACTIVE_BASELINE",
            },
            "v4": {
                "checkpoint": "ml/model_registry/versions/unet_dual_pol_sar_v4.pth",
                "sha256": compute_file_sha256(v4_path),
                "role": "EXPERIMENTAL",
            }
        },
        "dataset_manifest_sha256": compute_file_sha256(manifest_path),
        "environment": {
            "device": "cuda:0" if torch.cuda.is_available() else "cpu",
            "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
            "pytorch_version": torch.__version__,
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
        }
    }
    with open(os.path.join(out_dir, "experiment_baseline_snapshot.json"), "w", encoding="utf-8") as f:
        json.dump(baseline_snapshot, f, indent=2)

    # 2. STEP 2-10: V6 Training Config & Dataset Composition
    print("[2/6] Configuring V6 Training Parameters & Analyzing Class Composition...")
    with open(manifest_path, "r", encoding="utf-8") as f:
        m_data = json.load(f)

    train_scenes = [s for s in m_data["scenes"] if s["split"] == "train"]
    val_scenes = [s for s in m_data["scenes"] if s["split"] == "val"]
    test_scenes = [s for s in m_data["scenes"] if s["split"] == "test"]

    oil_train = [s for s in train_scenes if "oil" in s.get("category", "").lower() and "no_oil" not in s.get("category", "").lower()]
    look_train = [s for s in train_scenes if "look" in s.get("category", "").lower()]
    clean_train = [s for s in train_scenes if "no_oil" in s.get("category", "").lower() or "clean" in s.get("category", "").lower()]

    config = {
        "experiment_name": "v6_controlled_retraining",
        "model_id": "unet-dual-pol-sar-v6",
        "model_version": "V6",
        "status": "EXPERIMENTAL",
        "architecture": {
            "name": "UNet",
            "in_channels": 2,
            "num_classes": 2,
            "base_channels": 16,
            "bilinear": True,
        },
        "preprocessing": {
            "name": "sentinel1_sigma0_db_v1",
            "vv_range_db": [-35.0, -5.0],
            "vh_range_db": [-45.0, -15.0],
            "channel_order": ["VV", "VH"],
            "formula": "clip((x - min) / (max - min), 0, 1)",
        },
        "dataset": {
            "manifest_path": "ml/datasets/manifest.json",
            "train_scenes_count": len(train_scenes),
            "train_composition": {
                "oil_scenes": len(oil_train),
                "look_alike_scenes": len(look_train),
                "clean_ocean_scenes": len(clean_train),
            },
            "validation_scenes_count": len(val_scenes),
            "held_out_test_scenes_count": len(test_scenes),
            "held_out_test_lock_status": "STRICTLY_LOCKED",
        },
        "training": {
            "seed": 42,
            "batch_size": 2,
            "tile_size": 512,
            "stride": 512,
            "tiles_per_scene": 16,
            "total_train_tiles": len(train_scenes) * 16,
            "learning_rate": 1e-4,
            "weight_decay": 1e-4,
            "epochs": 30,
            "early_stopping_patience": 7,
            "loss": "Combined_CrossEntropy_SoftDice",
            "ce_weight": 1.0,
            "dice_weight": 1.0,
            "foreground_weight": 5.0,
            "use_amp": True,
            "augment": True,
        }
    }

    with open(os.path.join(out_dir, "v6_training_config.yaml"), "w", encoding="utf-8") as f:
        yaml.dump(config, f, sort_keys=False)

    # 3. STEP 11 & 22: Preflight Check & Training Execution
    print("\n[3/6] Executing Preflight Safety Check & Launching V6 Training...")
    trainer = V6Trainer(config=config["training"], repo_root=_REPO_ROOT)
    preflight = trainer.preflight_check()

    print(f"Preflight Check: PASSED (28 train / 7 val / 5 locked test scenes verified).")
    train_results = trainer.train()

    # Save training history
    with open(os.path.join(out_dir, "training_history.json"), "w", encoding="utf-8") as f:
        json.dump(train_results, f, indent=2)

    # STEP 16: Training Curves Plotting (Pure Python SVG generator)
    history = train_results.get("history", [])
    if history:
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
            f'<text x="{svg_width//2}" y="36" text-anchor="middle" fill="#f8fafc" font-size="20" font-weight="bold">V6 Controlled Retraining Diagnostics (UNet Dual-Pol SAR)</text>',
            f'<text x="{svg_width//2}" y="56" text-anchor="middle" fill="#94a3b8" font-size="12">Training history over {len(history)} epochs | Seed: 42 | Preprocessing: sentinel1_sigma0_db_v1</text>',
        ]

        for p_idx, (title, series_list) in enumerate(svg_panels):
            row = p_idx // 3
            col = p_idx % 3
            px = margin_x + col * (panel_w + gap_x)
            py = margin_y + row * (panel_h + gap_y)

            # Background panel
            svg_lines.append(f'<rect x="{px}" y="{py}" width="{panel_w}" height="{panel_h}" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>')
            svg_lines.append(f'<text x="{px + panel_w//2}" y="{py + 24}" text-anchor="middle" fill="#e2e8f0" font-size="13" font-weight="600">{title}</text>')

            plot_x = px + 45
            plot_y = py + 40
            plot_w = panel_w - 60
            plot_h = panel_h - 75

            # Grid and Axes
            svg_lines.append(f'<rect x="{plot_x}" y="{plot_y}" width="{plot_w}" height="{plot_h}" fill="#0f172a" stroke="#475569" stroke-width="1"/>')
            for g in range(1, 4):
                gy = plot_y + int(plot_h * g / 4)
                svg_lines.append(f'<line x1="{plot_x}" y1="{gy}" x2="{plot_x + plot_w}" y2="{gy}" stroke="#334155" stroke-dasharray="3,3"/>')

            # Find min and max for this panel
            all_vals = [v for _, vals, _, _ in series_list for v in vals if v is not None]
            min_v = 0.0 if min(all_vals, default=0.0) >= 0 else min(all_vals)
            max_v = max(all_vals, default=1.0)
            if max_v == min_v:
                max_v += 1.0
            range_v = max_v - min_v

            n_epochs = len(history)

            # Plot series lines
            for name, vals, color, style in series_list:
                points = []
                for ep_idx, val in enumerate(vals):
                    x_pos = plot_x if n_epochs == 1 else plot_x + int(plot_w * ep_idx / (n_epochs - 1))
                    y_pos = plot_y + plot_h - int(plot_h * (val - min_v) / range_v)
                    points.append(f"{x_pos},{y_pos}")

                dash = 'stroke-dasharray="4,4"' if style == "dashed" else ""
                svg_lines.append(f'<polyline points="{" ".join(points)}" fill="none" stroke="{color}" stroke-width="2.2" {dash}/>')

            # Y-axis labels
            svg_lines.append(f'<text x="{plot_x - 6}" y="{plot_y + 10}" text-anchor="end" fill="#94a3b8" font-size="10">{max_v:.2f}</text>')
            svg_lines.append(f'<text x="{plot_x - 6}" y="{plot_y + plot_h}" text-anchor="end" fill="#94a3b8" font-size="10">{min_v:.2f}</text>')

            # X-axis labels
            svg_lines.append(f'<text x="{plot_x}" y="{plot_y + plot_h + 16}" text-anchor="middle" fill="#94a3b8" font-size="10">1</text>')
            svg_lines.append(f'<text x="{plot_x + plot_w}" y="{plot_y + plot_h + 16}" text-anchor="middle" fill="#94a3b8" font-size="10">{n_epochs}</text>')

            # Legend
            leg_x = plot_x + 8
            for s_i, (name, _, color, style) in enumerate(series_list):
                ly = plot_y + 14 + s_i * 14
                dash = 'stroke-dasharray="3,3"' if style == "dashed" else ""
                svg_lines.append(f'<line x1="{leg_x}" y1="{ly-3}" x2="{leg_x+16}" y2="{ly-3}" stroke="{color}" stroke-width="2" {dash}/>')
                svg_lines.append(f'<text x="{leg_x+22}" y="{ly}" fill="#cbd5e1" font-size="10">{name}</text>')

        svg_lines.append('</svg>')
        svg_content = "\n".join(svg_lines)

        svg_plot_path = os.path.join(plots_dir, "v6_training_curves.svg")
        with open(svg_plot_path, "w", encoding="utf-8") as f:
            f.write(svg_content)
        print(f"Diagnostic training curves saved to: {svg_plot_path}")

    # 4. STEP 17: Full-Scene Validation Evaluation
    print("\n[4/6] Evaluating V6 Best Checkpoint on Validation Split (7 scenes)...")
    v6_ckpt_path = os.path.join(_REPO_ROOT, train_results["best_checkpoint"]["path"])

    # Load best model
    v6_model = UNet(in_channels=2, num_classes=2, base_channels=16, bilinear=True)
    raw_ckpt = torch.load(v6_ckpt_path, map_location="cpu", weights_only=False)
    v6_model.load_state_dict(raw_ckpt["model_state_dict"])
    v6_model.to(trainer.device)
    v6_model.eval()

    thresholds = [0.30, 0.35, 0.40, 0.45, 0.50, 0.60]
    val_scene_records = []

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
                tile_t = torch.from_numpy(tile).unsqueeze(0).to(trainer.device)
                logits = v6_model(tile_t)
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

        val_scene_records.append({
            "scene_id": s["scene_id"],
            "category": s.get("category", "unknown"),
            "ground_truth_pixels": int(gt_mask.sum()),
            "metrics_by_threshold": th_res,
        })

    # Compute validation aggregates across thresholds
    val_aggregates = []
    for th in thresholds:
        th_s = str(th)
        cm_all = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
        cm_clean = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
        cm_look = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
        cm_oil = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}

        for rec in val_scene_records:
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

        val_aggregates.append({
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
                "oil_scenes_iou": round(float(calculate_confusion_metrics(cm_oil)["iou"]), 6) if (cm_oil["tp"]+cm_oil["fp"]+cm_oil["fn"]) > 0 else 0.0,
            }
        })

    v6_val_report = {
        "model_id": "unet-dual-pol-sar-v6",
        "model_version": "V6",
        "status": "EXPERIMENTAL",
        "checkpoint": train_results["best_checkpoint"],
        "preprocessing": "sentinel1_sigma0_db_v1",
        "validation_scenes_count": len(val_scenes),
        "held_out_test_status": "STRICTLY_LOCKED (Part III scenes quarantined)",
        "threshold_aggregates": val_aggregates,
        "scenes": val_scene_records,
    }

    with open(os.path.join(out_dir, "v6_validation.json"), "w", encoding="utf-8") as f:
        json.dump(v6_val_report, f, indent=2)

    # 5. STEP 20: Update Model Registry with V6
    print("[5/6] Registering V6 in Model Registry as EXPERIMENTAL...")
    registry_file = os.path.join(_REPO_ROOT, "ml", "model_registry", "registry.json")
    with open(registry_file, "r", encoding="utf-8") as f:
        reg_data = json.load(f)

    # Check if V6 already in registry
    models_list = reg_data.get("models", [])
    existing_v6 = [i for i, m in enumerate(models_list) if m.get("model_id") == "unet-dual-pol-sar-v6"]

    v6_reg_entry = {
        "model_id": "unet-dual-pol-sar-v6",
        "architecture": "UNet",
        "framework": "PyTorch",
        "in_channels": 2,
        "num_classes": 2,
        "classes": ["Clean Sea Surface", "Potential Oil Spill"],
        "input_shape": [2, 512, 512],
        "checkpoint_path": "ml/model_registry/versions/unet_dual_pol_sar_v6.pth",
        "training_dataset": "sentinel1_oil_spill_verified_real_subset_28_train",
        "status": "experimental",
        "metrics": {
            "val_dice_at_0_50": val_aggregates[4]["micro_pixel_aggregate"]["dice"],
            "val_iou_at_0_50": val_aggregates[4]["micro_pixel_aggregate"]["iou"],
            "val_recall_at_0_50": val_aggregates[4]["micro_pixel_aggregate"]["recall"],
            "val_precision_at_0_50": val_aggregates[4]["micro_pixel_aggregate"]["precision"],
            "clean_ocean_fpr_at_0_50": val_aggregates[4]["category_breakdown"]["clean_ocean_fpr"],
            "look_alike_fpr_at_0_50": val_aggregates[4]["category_breakdown"]["look_alike_fpr"],
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
        "description": "Retrained U-Net baseline on 28 real Sentinel-1 SAR scenes with sentinel1_sigma0_db_v1 calibrated decibel preprocessing.",
        "hyperparameters": {
            "epochs": train_results["total_epochs_trained"],
            "best_epoch": train_results["best_epoch"],
            "batch_size": 2,
            "learning_rate": 0.0001,
            "base_channels": 16,
            "optimizer": "AdamW",
            "loss": "Combined_CrossEntropy_SoftDice",
            "tile_size": 512,
            "polarization": "VV+VH",
            "seed": 42,
            "preprocessing": "sentinel1_sigma0_db_v1",
        }
    }

    if existing_v6:
        models_list[existing_v6[0]] = v6_reg_entry
    else:
        models_list.append(v6_reg_entry)

    reg_data["models"] = models_list
    with open(registry_file, "w", encoding="utf-8") as f:
        json.dump(reg_data, f, indent=2)

    print("[6/6] Model Registry Updated.")
    print("\n" + "=" * 75)
    print("PART 0.7 V6 EXPERIMENT COMPLETED SUCCESSFULLY!")
    print(f"Best Validation Dice: {train_results['best_validation_dice']:.4f} (Epoch {train_results['best_epoch']})")
    print(f"Checkpoint SHA-256: {train_results['best_checkpoint']['sha256']}")
    print("=" * 75)


if __name__ == "__main__":
    main()
