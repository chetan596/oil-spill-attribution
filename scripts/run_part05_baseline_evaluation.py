"""
Script to execute PART 0.5 Baseline Evaluation Audit.
Generates all structured artifacts in ml/experiments/results/baseline_evaluation/
"""

import os
import sys
import json
import time
from datetime import datetime, timezone

# Ensure project path
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
if os.path.join(_REPO_ROOT, "services", "ml-python") not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, "services", "ml-python"))

from ml.evaluation.baseline_runner import BaselineEvaluationRunner


def main():
    print("=" * 70)
    print("STARTING PART 0.5 — REPRODUCIBLE BASELINE EVALUATION AUDIT")
    print("=" * 70)

    out_dir = os.path.join(_REPO_ROOT, "ml", "experiments", "results", "baseline_evaluation")
    os.makedirs(out_dir, exist_ok=True)

    runner = BaselineEvaluationRunner(
        repo_root=_REPO_ROOT,
        tile_size=512,
        stride=448,
    )

    print(f"CUDA Device: {runner.device}")
    print(f"Manifest: {runner.manifest_path} (40 scenes verified)")

    # 1. Evaluate V2
    print("\n[1/4] Evaluating V2 (unet-dual-pol-sar-v2) on Validation (7 scenes)...")
    v2_val = runner.evaluate_split("unet-dual-pol-sar-v2", split="val")
    v2_val_agg = runner.compute_aggregate(v2_val)

    with open(os.path.join(out_dir, "v2_validation.json"), "w", encoding="utf-8") as f:
        json.dump(v2_val, f, indent=2)

    print("[2/4] Evaluating V2 (unet-dual-pol-sar-v2) on Held-Out Test (5 scenes)...")
    v2_test = runner.evaluate_split("unet-dual-pol-sar-v2", split="test")
    v2_test_agg = runner.compute_aggregate(v2_test)

    with open(os.path.join(out_dir, "v2_held_out_test.json"), "w", encoding="utf-8") as f:
        json.dump(v2_test, f, indent=2)

    v2_aggregate = {
        "model_id": "unet-dual-pol-sar-v2",
        "model_version": "V2",
        "model_role": "ACTIVE_BASELINE",
        "validation_aggregate": v2_val_agg,
        "held_out_test_aggregate": v2_test_agg,
    }
    with open(os.path.join(out_dir, "v2_aggregate.json"), "w", encoding="utf-8") as f:
        json.dump(v2_aggregate, f, indent=2)

    # 2. Evaluate V4
    print("[3/4] Evaluating V4 (unet-dual-pol-sar-v4) on Validation (7 scenes)...")
    v4_val = runner.evaluate_split("unet-dual-pol-sar-v4", split="val")
    v4_val_agg = runner.compute_aggregate(v4_val)

    with open(os.path.join(out_dir, "v4_validation.json"), "w", encoding="utf-8") as f:
        json.dump(v4_val, f, indent=2)

    print("[4/4] Evaluating V4 (unet-dual-pol-sar-v4) on Held-Out Test (5 scenes)...")
    v4_test = runner.evaluate_split("unet-dual-pol-sar-v4", split="test")
    v4_test_agg = runner.compute_aggregate(v4_test)

    with open(os.path.join(out_dir, "v4_held_out_test.json"), "w", encoding="utf-8") as f:
        json.dump(v4_test, f, indent=2)

    v4_aggregate = {
        "model_id": "unet-dual-pol-sar-v4",
        "model_version": "V4",
        "model_role": "EXPERIMENTAL",
        "validation_aggregate": v4_val_agg,
        "held_out_test_aggregate": v4_test_agg,
    }
    with open(os.path.join(out_dir, "v4_aggregate.json"), "w", encoding="utf-8") as f:
        json.dump(v4_aggregate, f, indent=2)

    # 3. Threshold Sweep Summary
    threshold_sweep_data = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": BaselineEvaluationRunner.SWEEP_THRESHOLDS,
        "v2_validation": {str(item["threshold"]): item for item in v2_val_agg["threshold_aggregates"]},
        "v2_held_out_test": {str(item["threshold"]): item for item in v2_test_agg["threshold_aggregates"]},
        "v4_validation": {str(item["threshold"]): item for item in v4_val_agg["threshold_aggregates"]},
        "v4_held_out_test": {str(item["threshold"]): item for item in v4_test_agg["threshold_aggregates"]},
    }
    with open(os.path.join(out_dir, "threshold_sweep.json"), "w", encoding="utf-8") as f:
        json.dump(threshold_sweep_data, f, indent=2)

    # 4. Runtime Summary
    runtime_summary = {
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "device": str(runner.device),
        "device_name": v2_val["environment"]["device_name"],
        "pytorch_version": v2_val["environment"]["pytorch_version"],
        "cuda_version": v2_val["environment"]["cuda_version"],
        "tile_configuration": {
            "tile_size": 512,
            "stride": 448,
            "overlap_pixels": 64,
            "tiles_per_2048_scene": 25,
        },
        "runs": {
            "v2_validation": {
                "scenes": 7,
                "total_tiles": v2_val["runtime"]["total_tiles"],
                "duration_seconds": v2_val["runtime"]["total_duration_seconds"],
                "peak_cuda_vram_mb": v2_val["runtime"]["peak_cuda_vram_mb"],
            },
            "v2_held_out_test": {
                "scenes": 5,
                "total_tiles": v2_test["runtime"]["total_tiles"],
                "duration_seconds": v2_test["runtime"]["total_duration_seconds"],
                "peak_cuda_vram_mb": v2_test["runtime"]["peak_cuda_vram_mb"],
            },
            "v4_validation": {
                "scenes": 7,
                "total_tiles": v4_val["runtime"]["total_tiles"],
                "duration_seconds": v4_val["runtime"]["total_duration_seconds"],
                "peak_cuda_vram_mb": v4_val["runtime"]["peak_cuda_vram_mb"],
            },
            "v4_held_out_test": {
                "scenes": 5,
                "total_tiles": v4_test["runtime"]["total_tiles"],
                "duration_seconds": v4_test["runtime"]["total_duration_seconds"],
                "peak_cuda_vram_mb": v4_test["runtime"]["peak_cuda_vram_mb"],
            },
        },
    }
    with open(os.path.join(out_dir, "runtime_summary.json"), "w", encoding="utf-8") as f:
        json.dump(runtime_summary, f, indent=2)

    # 5. Machine-Readable Global Summary
    global_summary = {
        "audit_name": "PART 0.5 — REPRODUCIBLE BASELINE EVALUATION AUDIT",
        "status": "BASELINE_EVALUATION_COMPLETE",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "These results are empirical benchmark measurements on the available 40-scene subset and are not a production performance guarantee.",
        "dataset_scope": {
            "manifest": "ml/datasets/manifest.json",
            "total_available_scenes": 40,
            "train_scenes_isolated": 28,
            "validation_scenes_evaluated": 7,
            "held_out_test_scenes_evaluated": 5,
            "part3_test_scenes": ["real_part3_test_00060", "real_part3_test_00062", "real_part3_test_00063", "real_part3_test_00064", "real_part3_test_00080"],
            "zenodo_full_dataset_status": "NOT_DOWNLOADED (40-scene verified subset only)"
        },
        "models_evaluated": [
            {
                "model_id": "unet-dual-pol-sar-v2",
                "role": "ACTIVE_BASELINE",
                "version": "V2",
                "checkpoint": v2_val["checkpoint"],
                "preprocessing": v2_val["preprocessing"],
            },
            {
                "model_id": "unet-dual-pol-sar-v4",
                "role": "EXPERIMENTAL",
                "version": "V4",
                "checkpoint": v4_val["checkpoint"],
                "preprocessing": v4_val["preprocessing"],
            },
        ],
        "default_threshold_0_50_comparison": {
            "validation_split": {
                "v2": v2_val_agg["threshold_aggregates"][4]["micro_pixel_aggregate"],
                "v4": v4_val_agg["threshold_aggregates"][4]["micro_pixel_aggregate"],
            },
            "held_out_test_split": {
                "v2": v2_test_agg["threshold_aggregates"][4]["micro_pixel_aggregate"],
                "v4": v4_test_agg["threshold_aggregates"][4]["micro_pixel_aggregate"],
            },
        },
        "clean_ocean_fpr_at_0_50": {
            "validation": {
                "v2": v2_val_agg["threshold_aggregates"][4]["category_breakdown"]["clean_ocean"]["fpr"],
                "v4": v4_val_agg["threshold_aggregates"][4]["category_breakdown"]["clean_ocean"]["fpr"],
            },
        },
        "look_alike_fpr_at_0_50": {
            "validation": {
                "v2": v2_val_agg["threshold_aggregates"][4]["category_breakdown"]["look_alike"]["fpr"],
                "v4": v4_val_agg["threshold_aggregates"][4]["category_breakdown"]["look_alike"]["fpr"],
            },
        },
    }
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(global_summary, f, indent=2)

    print("\n" + "=" * 70)
    print("BASELINE EVALUATION COMPLETED SUCCESSFULLY!")
    print(f"Artifacts saved in: {out_dir}")
    print("=" * 70)


if __name__ == "__main__":
    main()
