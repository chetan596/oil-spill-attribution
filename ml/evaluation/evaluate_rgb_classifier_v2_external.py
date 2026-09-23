"""
Part 0.14B.4 — Final Unbiased Real-Optical Classifier Evaluation
Evaluates the frozen ResNet-18 V2 checkpoint on the previously sealed external test set (130 images).
"""

import os
import sys
import json
import hashlib
from pathlib import Path
from typing import Dict, Any, List

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from PIL import Image

# Paths
PROJECT_ROOT = Path("d:/PROJECTS/Collge Project/oil-spill-attribution")
CHECKPOINT_PATH = PROJECT_ROOT / "services" / "ml-python" / "app" / "models" / "rgb_oil_classifier_v2" / "rgb_oil_classifier_v2.pth"
EXTERNAL_MANIFEST_PATH = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata" / "external_test_manifest.json"
RESULTS_DIR = PROJECT_ROOT / "ml" / "experiments" / "results" / "rgb_oil_classifier_v2" / "external_test"

RESULTS_DIR.mkdir(parents=True, exist_ok=True)

EXPECTED_CHECKPOINT_SHA256 = "6ccf88c8be6764384297005effedbaf047165ef20dc4148911bc66ddfc10dd84"
FROZEN_THRESHOLD = 0.30

CLASS_NAMES = ["CLEAN_OCEAN", "LOOK_ALIKE", "OIL_SPILL"]
CLASS_TO_IDX = {"CLEAN_OCEAN": 0, "LOOK_ALIKE": 1, "OIL_SPILL": 2}
IDX_TO_CLASS = {v: k for k, v in CLASS_TO_IDX.items()}

NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]

EVAL_TRANSFORMS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD),
])


class RgbOilClassifierV2(nn.Module):
    def __init__(self, num_classes: int = 3):
        super().__init__()
        self.backbone = models.resnet18(weights=None)
        num_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(num_features, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(128, num_classes)
        )

    def forward(self, x):
        return self.backbone(x)


class ExternalOpticalDataset(Dataset):
    def __init__(self, manifest_path: Path, transform=None):
        assert manifest_path.exists(), f"Manifest not found: {manifest_path}"
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)

        records = manifest_data["images"] if isinstance(manifest_data, dict) and "images" in manifest_data else manifest_data
        assert len(records) == 130, f"Expected 130 external test images, found {len(records)}"

        self.transform = transform
        self.items = []

        for r in records:
            cat = r.get("category") or r.get("label")
            if isinstance(cat, int):
                # map from int if necessary
                cat_name = "OIL_SPILL" if cat == 1 or cat == 2 else "CLEAN_OCEAN"
            else:
                cat_name = cat

            assert cat_name in CLASS_TO_IDX, f"Unknown category: {cat_name}"

            local_p = PROJECT_ROOT / r["local_path"]
            assert local_p.exists(), f"Image file not found: {local_p}"

            self.items.append({
                "image_id": r["image_id"],
                "path": str(local_p),
                "label": CLASS_TO_IDX[cat_name],
                "binary_label": 1 if cat_name == "OIL_SPILL" else 0,
                "category": cat_name,
                "source_dataset": r.get("source_dataset", "UNKNOWN"),
                "scene_id": r.get("scene_id", "UNKNOWN"),
                "event_id": r.get("event_id", "UNKNOWN"),
                "sha256": r.get("sha256", "UNKNOWN"),
                "original_filename": r.get("original_filename", "")
            })

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx):
        item = self.items[idx]
        with Image.open(item["path"]) as img:
            img_rgb = img.convert("RGB")
            tensor = self.transform(img_rgb) if self.transform else transforms.ToTensor()(img_rgb)

        return tensor, item["label"], item["binary_label"], item


def trapezoid_area(x, y):
    """Compute definite integral using the composite trapezoidal rule."""
    x = np.asarray(x)
    y = np.asarray(y)
    return float(np.sum((x[1:] - x[:-1]) * (y[1:] + y[:-1]) / 2.0))


def compute_roc_auc(y_true, y_scores):
    order = np.argsort(y_scores)[::-1]
    y_true_sorted = y_true[order]
    
    n_pos = np.sum(y_true == 1)
    n_neg = np.sum(y_true == 0)
    if n_pos == 0 or n_neg == 0:
        return 0.0

    tps = np.cumsum(y_true_sorted == 1)
    fps = np.cumsum(y_true_sorted == 0)
    
    tpr = np.concatenate([[0.0], tps / n_pos])
    fpr = np.concatenate([[0.0], fps / n_neg])
    
    return trapezoid_area(fpr, tpr)


def compute_pr_auc(y_true, y_scores):
    order = np.argsort(y_scores)[::-1]
    y_true_sorted = y_true[order]
    
    n_pos = np.sum(y_true == 1)
    if n_pos == 0:
        return 0.0

    tps = np.cumsum(y_true_sorted == 1)
    fps = np.cumsum(y_true_sorted == 0)
    
    prec = tps / (tps + fps)
    rec = tps / n_pos
    
    rec = np.concatenate([[0.0], rec, [1.0]])
    prec = np.concatenate([[1.0], prec, [0.0]])
    
    # Sort recall ascending for trapezoid integration
    sorted_indices = np.argsort(rec)
    rec_sorted = rec[sorted_indices]
    prec_sorted = prec[sorted_indices]
    
    return trapezoid_area(rec_sorted, prec_sorted)


def run_external_evaluation():
    print("=" * 80)
    print("PART 0.14B.4: SEALED EXTERNAL TEST EVALUATION")
    print("=" * 80)

    # 1. Verify Checkpoint SHA-256
    assert CHECKPOINT_PATH.exists(), f"Checkpoint not found: {CHECKPOINT_PATH}"
    with open(CHECKPOINT_PATH, "rb") as f:
        actual_sha = hashlib.sha256(f.read()).hexdigest()

    print(f"Verifying checkpoint SHA-256:")
    print(f"  Expected: {EXPECTED_CHECKPOINT_SHA256}")
    print(f"  Actual:   {actual_sha}")
    assert actual_sha == EXPECTED_CHECKPOINT_SHA256, f"Checkpoint SHA mismatch: {actual_sha}"
    print("  Status: CHECKPOINT INTEGRITY VERIFIED (MATCH)\n")

    # 2. Manifest and Hash
    with open(EXTERNAL_MANIFEST_PATH, "rb") as f:
        manifest_raw = f.read()
        manifest_sha = hashlib.sha256(manifest_raw).hexdigest()

    manifest_hash_info = {
        "manifest_path": str(EXTERNAL_MANIFEST_PATH),
        "manifest_sha256": manifest_sha,
        "evaluation_timestamp": "2026-09-20T08:53:00Z",
        "checkpoint_sha256": actual_sha,
        "threshold": FROZEN_THRESHOLD
    }
    with open(RESULTS_DIR / "external_evaluation_manifest_hash.json", "w") as f:
        json.dump(manifest_hash_info, f, indent=2)

    # 3. Load Dataset
    dataset = ExternalOpticalDataset(EXTERNAL_MANIFEST_PATH, transform=EVAL_TRANSFORMS)
    print(f"Loaded {len(dataset)} external test images:")
    counts = {"OIL_SPILL": 0, "CLEAN_OCEAN": 0, "LOOK_ALIKE": 0}
    for itm in dataset.items:
        counts[itm["category"]] += 1
    print(f"  OIL_SPILL:   {counts['OIL_SPILL']}")
    print(f"  CLEAN_OCEAN: {counts['CLEAN_OCEAN']}")
    print(f"  LOOK_ALIKE:  {counts['LOOK_ALIKE']}")

    loader = DataLoader(dataset, batch_size=32, shuffle=False, num_workers=0)

    # 4. Load Model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nUsing compute device: {device}")

    model = RgbOilClassifierV2(num_classes=3).to(device)
    checkpoint = torch.load(CHECKPOINT_PATH, map_location=device, weights_only=False)
    if "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"])
    else:
        model.load_state_dict(checkpoint)
    model.eval()

    # 5. Deterministic Inference
    all_probs = []
    all_targets_3cl = []
    all_items = []

    with torch.no_grad():
        for inputs, targets, binary_targets, items in loader:
            inputs = inputs.to(device)
            outputs = model(inputs)
            probs = torch.softmax(outputs, dim=1).cpu().numpy()
            all_probs.append(probs)
            all_targets_3cl.append(targets.numpy())
            batch_len = len(targets)
            for i in range(batch_len):
                all_items.append({k: items[k][i] for k in items})

    y_probs = np.concatenate(all_probs, axis=0) # [130, 3]
    y_true_3cl = np.concatenate(all_targets_3cl) # [130]

    # Detailed Predictions
    predictions = []
    for idx, (prob, true_label, item) in enumerate(zip(y_probs, y_true_3cl, all_items)):
        p_clean = float(prob[0])
        p_lookalike = float(prob[1])
        p_oil = float(prob[2])
        p_oil_vs_non_oil = float(p_oil / (p_clean + p_lookalike + p_oil))
        pred_3cl_idx = int(np.argmax(prob))
        pred_3cl_name = IDX_TO_CLASS[pred_3cl_idx]
        is_oil = bool(p_oil >= FROZEN_THRESHOLD)
        conf = float(np.max(prob))

        predictions.append({
            "image_id": item["image_id"],
            "source_dataset": item["source_dataset"],
            "true_label": IDX_TO_CLASS[int(true_label)],
            "clean_probability": p_clean,
            "look_alike_probability": p_lookalike,
            "oil_probability": p_oil,
            "oil_vs_non_oil_probability": p_oil_vs_non_oil,
            "predicted_class_3class": pred_3cl_name,
            "is_oil_spill": is_oil,
            "confidence": conf,
            "original_filename": item["original_filename"]
        })

    with open(RESULTS_DIR / "external_predictions.json", "w") as f:
        json.dump(predictions, f, indent=2)

    # 6. Calculate 3-Class Metrics
    N = len(y_true_3cl)
    pred_3cl_indices = np.argmax(y_probs, axis=1)
    acc_3cl = float(np.mean(pred_3cl_indices == y_true_3cl))

    cm_3cl = np.zeros((3, 3), dtype=int)
    for t, p in zip(y_true_3cl, pred_3cl_indices):
        cm_3cl[t, p] += 1

    per_class_prec, per_class_rec, per_class_f1 = [], [], []
    for c in range(3):
        tp_c = cm_3cl[c, c]
        fp_c = np.sum(cm_3cl[:, c]) - tp_c
        fn_c = np.sum(cm_3cl[c, :]) - tp_c
        p_c = float(tp_c / (tp_c + fp_c)) if (tp_c + fp_c) > 0 else 0.0
        r_c = float(tp_c / (tp_c + fn_c)) if (tp_c + fn_c) > 0 else 0.0
        f_c = float((2 * p_c * r_c) / (p_c + r_c)) if (p_c + r_c) > 0 else 0.0
        per_class_prec.append(p_c)
        per_class_rec.append(r_c)
        per_class_f1.append(f_c)

    prec_macro = float(np.mean(per_class_prec))
    rec_macro = float(np.mean(per_class_rec))
    f1_macro = float(np.mean(per_class_f1))

    class_counts = np.sum(cm_3cl, axis=1)
    prec_weighted = float(np.sum(np.array(per_class_prec) * class_counts) / N)
    rec_weighted = float(np.sum(np.array(per_class_rec) * class_counts) / N)
    f1_weighted = float(np.sum(np.array(per_class_f1) * class_counts) / N)

    # 7. Binary Oil Detection Metrics at Frozen Threshold = 0.30
    y_true_binary = (y_true_3cl == 2).astype(int)
    oil_probs = y_probs[:, 2]
    y_pred_binary = (oil_probs >= FROZEN_THRESHOLD).astype(int)

    tp = int(np.sum((y_true_binary == 1) & (y_pred_binary == 1)))
    fp = int(np.sum((y_true_binary == 0) & (y_pred_binary == 1)))
    tn = int(np.sum((y_true_binary == 0) & (y_pred_binary == 0)))
    fn = int(np.sum((y_true_binary == 1) & (y_pred_binary == 0)))

    oil_prec = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    oil_rec = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    oil_f1 = float((2 * oil_prec * oil_rec) / (oil_prec + oil_rec)) if (oil_prec + oil_rec) > 0 else 0.0
    oil_spec = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
    oil_fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    binary_acc = float((tp + tn) / N)

    clean_indices = np.where(y_true_3cl == 0)[0]
    clean_fp = int(np.sum(y_pred_binary[clean_indices] == 1))
    clean_fpr = float(clean_fp / len(clean_indices)) if len(clean_indices) > 0 else 0.0

    lookalike_indices = np.where(y_true_3cl == 1)[0]
    lookalike_fp = int(np.sum(y_pred_binary[lookalike_indices] == 1))
    lookalike_fpr = float(lookalike_fp / len(lookalike_indices)) if len(lookalike_indices) > 0 else 0.0

    roc_auc = compute_roc_auc(y_true_binary, oil_probs)
    pr_auc = compute_pr_auc(y_true_binary, oil_probs)

    # 8. Class Specific Transitions / Misclassifications (3-class matrix detail)
    clean_to_oil = int(cm_3cl[0, 2])
    lookalike_to_oil = int(cm_3cl[1, 2])
    oil_to_clean = int(cm_3cl[2, 0])
    oil_to_lookalike = int(cm_3cl[2, 1])

    # 9. Source Specific Breakdown
    source_stats = {}
    sources = set(item["source_dataset"] for item in all_items)
    for src in sorted(sources):
        src_idxs = [i for i, item in enumerate(all_items) if item["source_dataset"] == src]
        src_y_true = y_true_3cl[src_idxs]
        src_probs = y_probs[src_idxs, 2]
        src_pred_bin = y_pred_binary[src_idxs]

        src_oil_cnt = int(np.sum(src_y_true == 2))
        src_clean_cnt = int(np.sum(src_y_true == 0))
        src_lookalike_cnt = int(np.sum(src_y_true == 1))

        src_tp = int(np.sum((src_y_true == 2) & (src_pred_bin == 1)))
        src_fp = int(np.sum((src_y_true != 2) & (src_pred_bin == 1)))
        src_fn = int(np.sum((src_y_true == 2) & (src_pred_bin == 0)))
        src_tn = int(np.sum((src_y_true != 2) & (src_pred_bin == 0)))

        src_prec = float(src_tp / (src_tp + src_fp)) if (src_tp + src_fp) > 0 else 0.0
        src_rec = float(src_tp / (src_tp + src_fn)) if (src_tp + src_fn) > 0 else 0.0
        src_f1 = float((2 * src_prec * src_rec) / (src_prec + src_rec)) if (src_prec + src_rec) > 0 else 0.0

        src_clean_idxs = [i for i in src_idxs if y_true_3cl[i] == 0]
        src_clean_fp = int(np.sum(y_pred_binary[src_clean_idxs] == 1)) if len(src_clean_idxs) > 0 else 0
        src_clean_fpr = float(src_clean_fp / len(src_clean_idxs)) if len(src_clean_idxs) > 0 else 0.0

        src_look_idxs = [i for i in src_idxs if y_true_3cl[i] == 1]
        src_look_fp = int(np.sum(y_pred_binary[src_look_idxs] == 1)) if len(src_look_idxs) > 0 else 0
        src_look_fpr = float(src_look_fp / len(src_look_idxs)) if len(src_look_idxs) > 0 else 0.0

        source_stats[src] = {
            "total_images": len(src_idxs),
            "oil_count": src_oil_cnt,
            "clean_count": src_clean_cnt,
            "look_alike_count": src_lookalike_cnt,
            "oil_tp": src_tp,
            "oil_fp": src_fp,
            "oil_fn": src_fn,
            "oil_tn": src_tn,
            "oil_precision": src_prec,
            "oil_recall": src_rec,
            "oil_f1": src_f1,
            "clean_fpr": src_clean_fpr,
            "look_alike_fpr": src_look_fpr
        }

    with open(RESULTS_DIR / "external_source_breakdown.json", "w") as f:
        json.dump(source_stats, f, indent=2)

    # 10. Oil Probability Statistics
    prob_stats = {}
    for c_idx, c_name in enumerate(CLASS_NAMES):
        c_indices = np.where(y_true_3cl == c_idx)[0]
        c_oil_probs = oil_probs[c_indices]
        prob_stats[c_name] = {
            "count": len(c_indices),
            "mean_oil_probability": float(np.mean(c_oil_probs)) if len(c_indices) > 0 else 0.0,
            "median_oil_probability": float(np.median(c_oil_probs)) if len(c_indices) > 0 else 0.0,
            "min_oil_probability": float(np.min(c_oil_probs)) if len(c_indices) > 0 else 0.0,
            "max_oil_probability": float(np.max(c_oil_probs)) if len(c_indices) > 0 else 0.0,
            "std_oil_probability": float(np.std(c_oil_probs)) if len(c_indices) > 0 else 0.0
        }

    with open(RESULTS_DIR / "external_probability_statistics.json", "w") as f:
        json.dump(prob_stats, f, indent=2)

    # 11. Error Analysis (False Positives and False Negatives at threshold 0.30)
    fp_items = []
    fn_items = []
    for p in predictions:
        if p["true_label"] != "OIL_SPILL" and p["is_oil_spill"]:
            fp_items.append({
                "image_id": p["image_id"],
                "source": p["source_dataset"],
                "true_label": p["true_label"],
                "predicted_label": p["predicted_class_3class"],
                "oil_probability": p["oil_probability"],
                "reason": "REVIEW_REQUIRED"
            })
        elif p["true_label"] == "OIL_SPILL" and not p["is_oil_spill"]:
            fn_items.append({
                "image_id": p["image_id"],
                "source": p["source_dataset"],
                "true_label": p["true_label"],
                "predicted_label": p["predicted_class_3class"],
                "oil_probability": p["oil_probability"],
                "reason": "REVIEW_REQUIRED"
            })

    error_analysis = {
        "false_positive_count": len(fp_items),
        "false_negative_count": len(fn_items),
        "false_positives": fp_items,
        "false_negatives": fn_items
    }

    with open(RESULTS_DIR / "external_error_analysis.json", "w") as f:
        json.dump(error_analysis, f, indent=2)

    # 12. Confusion Matrix JSON
    confusion_matrix_data = {
        "class_labels": CLASS_NAMES,
        "matrix_3class": cm_3cl.tolist(),
        "matrix_rows": ["TRUE_" + c for c in CLASS_NAMES],
        "matrix_cols": ["PRED_" + c for c in CLASS_NAMES],
        "binary_oil_vs_non_oil": {
            "true_positive": tp,
            "false_positive": fp,
            "true_negative": tn,
            "false_negative": fn
        },
        "class_transitions": {
            "clean_to_oil": clean_to_oil,
            "lookalike_to_oil": lookalike_to_oil,
            "oil_to_clean": oil_to_clean,
            "oil_to_lookalike": oil_to_lookalike
        }
    }

    with open(RESULTS_DIR / "external_confusion_matrix.json", "w") as f:
        json.dump(confusion_matrix_data, f, indent=2)

    # 13. Comprehensive Metrics JSON
    all_metrics = {
        "total_images": N,
        "threshold": FROZEN_THRESHOLD,
        "3_class": {
            "accuracy": acc_3cl,
            "macro_precision": prec_macro,
            "macro_recall": rec_macro,
            "macro_f1": f1_macro,
            "weighted_precision": prec_weighted,
            "weighted_recall": rec_weighted,
            "weighted_f1": f1_weighted
        },
        "oil_spill": {
            "precision": oil_prec,
            "recall": oil_rec,
            "f1": oil_f1,
            "specificity": oil_spec,
            "fpr": oil_fpr,
            "tp": tp,
            "fp": fp,
            "tn": tn,
            "fn": fn
        },
        "binary_oil_vs_non_oil": {
            "accuracy": binary_acc,
            "precision": oil_prec,
            "recall": oil_rec,
            "f1": oil_f1,
            "specificity": oil_spec,
            "fpr": oil_fpr,
            "roc_auc": roc_auc,
            "pr_auc": pr_auc
        },
        "class_specific_fpr": {
            "clean_ocean_fpr": clean_fpr,
            "clean_fp_count": clean_fp,
            "clean_total": len(clean_indices),
            "look_alike_fpr": lookalike_fpr,
            "lookalike_fp_count": lookalike_fp,
            "lookalike_total": len(lookalike_indices)
        },
        "transitions": {
            "clean_to_oil": clean_to_oil,
            "lookalike_to_oil": lookalike_to_oil,
            "oil_to_clean": oil_to_clean,
            "oil_to_lookalike": oil_to_lookalike
        }
    }

    with open(RESULTS_DIR / "external_metrics.json", "w") as f:
        json.dump(all_metrics, f, indent=2)

    # Print summary report
    print("=" * 80)
    print("EXTERNAL EVALUATION RESULTS")
    print("=" * 80)
    print(f"Total Images: {N}")
    print(f"3-Class Accuracy:     {acc_3cl:.4f} ({acc_3cl*100:.2f}%)")
    print(f"Macro F1:             {f1_macro:.4f}")
    print(f"Weighted F1:          {f1_weighted:.4f}")
    print("-" * 80)
    print("OIL DETECTION PERFORMANCE (threshold = 0.30):")
    print(f"  Oil Precision:      {oil_prec:.4f} ({oil_prec*100:.2f}%) [{tp}/{tp+fp}]")
    print(f"  Oil Recall:         {oil_rec:.4f} ({oil_rec*100:.2f}%) [{tp}/{tp+fn}]")
    print(f"  Oil F1-Score:       {oil_f1:.4f}")
    print(f"  Oil Specificity:    {oil_spec:.4f} ({oil_spec*100:.2f}%) [{tn}/{tn+fp}]")
    print(f"  Oil FPR:            {oil_fpr:.4f} ({oil_fpr*100:.2f}%)")
    print(f"  Clean FPR:          {clean_fpr:.4f} ({clean_fpr*100:.2f}%) [{clean_fp}/{len(clean_indices)}]")
    print(f"  Look-Alike FPR:     {lookalike_fpr:.4f} ({lookalike_fpr*100:.2f}%) [{lookalike_fp}/{len(lookalike_indices)}]")
    print(f"  Binary ROC-AUC:     {roc_auc:.4f}")
    print(f"  Binary PR-AUC:      {pr_auc:.4f}")
    print("-" * 80)
    print("3x3 Confusion Matrix [Rows: True Clean, True Look-Alike, True Oil]:")
    print(f"  CLEAN_OCEAN:  Pred Clean={cm_3cl[0,0]:2d}, Pred LookAlike={cm_3cl[0,1]:2d}, Pred Oil={cm_3cl[0,2]:2d}")
    print(f"  LOOK_ALIKE:   Pred Clean={cm_3cl[1,0]:2d}, Pred LookAlike={cm_3cl[1,1]:2d}, Pred Oil={cm_3cl[1,2]:2d}")
    print(f"  OIL_SPILL:    Pred Clean={cm_3cl[2,0]:2d}, Pred LookAlike={cm_3cl[2,1]:2d}, Pred Oil={cm_3cl[2,2]:2d}")
    print("-" * 80)
    print("Source-Specific Breakdown:")
    for src, s in source_stats.items():
        print(f"  [{src}] (N={s['total_images']}):")
        print(f"    Oil={s['oil_count']}, Clean={s['clean_count']}, LookAlike={s['look_alike_count']}")
        print(f"    Oil Precision: {s['oil_precision']:.4f}, Recall: {s['oil_recall']:.4f}, F1: {s['oil_f1']:.4f}")
        print(f"    Clean FPR: {s['clean_fpr']:.4f}, LookAlike FPR: {s['look_alike_fpr']:.4f}")
    print("=" * 80)
    print("External Evaluation COMPLETE. All artifacts saved.")


if __name__ == "__main__":
    run_external_evaluation()
