"""
Train RGB Oil Spill Classifier V2 (Part 0.14B.3)
Trains ResNet-18 3-class classifier on verified real optical dataset without external sklearn dependency.
"""

import os
import sys
import json
import time
import random
import hashlib
from pathlib import Path
from typing import Dict, Any, Tuple, List

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from PIL import Image

# Project paths
PROJECT_ROOT = Path("d:/PROJECTS/Collge Project/oil-spill-attribution")
METADATA_DIR = PROJECT_ROOT / "data" / "raw" / "optical_real" / "metadata"
MODEL_SAVE_DIR = PROJECT_ROOT / "services" / "ml-python" / "app" / "models" / "rgb_oil_classifier_v2"
RESULTS_DIR = PROJECT_ROOT / "ml" / "experiments" / "results" / "rgb_oil_classifier_v2"

MODEL_SAVE_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

CLASS_NAMES = ["CLEAN_OCEAN", "LOOK_ALIKE", "OIL_SPILL"]
CLASS_TO_IDX = {"CLEAN_OCEAN": 0, "LOOK_ALIKE": 1, "OIL_SPILL": 2}

SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


class OpticalDataset(Dataset):
    def __init__(self, manifest_path: Path, transform=None, expected_split: str = "TRAIN"):
        assert manifest_path.exists(), f"Manifest not found: {manifest_path}"
        with open(manifest_path, "r") as f:
            self.records = json.load(f)

        self.transform = transform
        self.expected_split = expected_split
        self.valid_items = []

        for r in self.records:
            assert not r.get("external_test", False), f"Illegal external test image in {expected_split}: {r['image_id']}"
            assert r.get("split") == expected_split, f"Split mismatch for {r['image_id']}: expected {expected_split}, got {r.get('split')}"
            assert r.get("category") in CLASS_TO_IDX, f"Unknown category: {r.get('category')}"

            local_p = PROJECT_ROOT / r["local_path"]
            assert local_p.exists(), f"Image file not found: {local_p}"

            self.valid_items.append({
                "image_id": r["image_id"],
                "path": str(local_p),
                "label": CLASS_TO_IDX[r["category"]],
                "binary_label": 1 if r["category"] == "OIL_SPILL" else 0,
                "category": r["category"],
                "source_dataset": r.get("source_dataset", "UNKNOWN"),
                "scene_id": r.get("scene_id", "UNKNOWN"),
                "event_id": r.get("event_id", "UNKNOWN"),
                "group_id": r.get("group_id", "UNKNOWN")
            })

    def __len__(self):
        return len(self.valid_items)

    def __getitem__(self, idx):
        item = self.valid_items[idx]
        with Image.open(item["path"]) as img:
            img_rgb = img.convert("RGB")
            if self.transform:
                tensor = self.transform(img_rgb)
            else:
                tensor = transforms.ToTensor()(img_rgb)

        return tensor, item["label"], item["binary_label"], item


NORMALIZE_MEAN = [0.485, 0.456, 0.406]
NORMALIZE_STD = [0.229, 0.224, 0.225]

TRAIN_TRANSFORMS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(p=0.5),
    transforms.RandomVerticalFlip(p=0.5),
    transforms.RandomRotation(degrees=15),
    transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.10),
    transforms.ToTensor(),
    transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD),
])

EVAL_TRANSFORMS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=NORMALIZE_MEAN, std=NORMALIZE_STD),
])


class RgbOilClassifierV2(nn.Module):
    def __init__(self, pretrained: bool = True, num_classes: int = 3):
        super().__init__()
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        self.backbone = models.resnet18(weights=weights)
        num_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(num_features, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(128, num_classes)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)


# Pure NumPy Metric Implementations
def trapezoid_area(y, x):
    """Numerically integrate y(x) using the trapezoid rule."""
    if hasattr(np, "trapezoid"):
        return float(np.trapezoid(y, x))
    return float(np.sum((x[1:] - x[:-1]) * (y[1:] + y[:-1])) / 2.0)


def compute_roc_auc_np(y_true, y_scores):
    """Pure numpy ROC-AUC calculation."""
    desc_score_indices = np.argsort(y_scores, kind="mergesort")[::-1]
    y_true = y_true[desc_score_indices]
    y_scores = y_scores[desc_score_indices]
    distinct_value_indices = np.where(np.diff(y_scores))[0]
    threshold_idxs = np.r_[distinct_value_indices, y_true.size - 1]

    tps = np.cumsum(y_true)[threshold_idxs]
    fps = 1 + threshold_idxs - tps

    tps = np.r_[0, tps]
    fps = np.r_[0, fps]

    if fps[-1] <= 0 or tps[-1] <= 0:
        return 0.5
    fpr = fps / fps[-1]
    tpr = tps / tps[-1]
    return float(trapezoid_area(tpr, fpr))


def compute_pr_auc_np(y_true, y_scores):
    """Pure numpy PR-AUC calculation."""
    desc_score_indices = np.argsort(y_scores, kind="mergesort")[::-1]
    y_true = y_true[desc_score_indices]
    y_scores = y_scores[desc_score_indices]
    distinct_value_indices = np.where(np.diff(y_scores))[0]
    threshold_idxs = np.r_[distinct_value_indices, y_true.size - 1]

    tps = np.cumsum(y_true)[threshold_idxs]
    fps = 1 + threshold_idxs - tps

    precision = tps / (tps + fps)
    precision[np.isnan(precision)] = 0.0
    recall = tps / tps[-1] if tps[-1] > 0 else np.zeros_like(tps)

    # Prepend (precision=1, recall=0)
    precision = np.r_[1.0, precision]
    recall = np.r_[0.0, recall]
    return float(trapezoid_area(precision, recall))


def compute_metrics_np(y_true_3class, y_probs_3class, decision_threshold=0.50):
    """Compute 3-class and binary metrics in pure numpy."""
    y_pred_3class = np.argmax(y_probs_3class, axis=1)
    N = len(y_true_3class)

    # 3-Class Confusion Matrix (3x3)
    cm_3cl = np.zeros((3, 3), dtype=int)
    for t, p in zip(y_true_3class, y_pred_3class):
        cm_3cl[t, p] += 1

    acc_3cl = np.sum(np.diag(cm_3cl)) / N if N > 0 else 0.0

    # Per-class precision, recall, F1
    per_class_prec = []
    per_class_rec = []
    per_class_f1 = []
    for c in range(3):
        tp_c = cm_3cl[c, c]
        fp_c = np.sum(cm_3cl[:, c]) - tp_c
        fn_c = np.sum(cm_3cl[c, :]) - tp_c
        p_c = tp_c / (tp_c + fp_c) if (tp_c + fp_c) > 0 else 0.0
        r_c = tp_c / (tp_c + fn_c) if (tp_c + fn_c) > 0 else 0.0
        f_c = (2 * p_c * r_c) / (p_c + r_c) if (p_c + r_c) > 0 else 0.0
        per_class_prec.append(p_c)
        per_class_rec.append(r_c)
        per_class_f1.append(f_c)

    prec_macro = float(np.mean(per_class_prec))
    rec_macro = float(np.mean(per_class_rec))
    f1_macro = float(np.mean(per_class_f1))

    class_counts = np.sum(cm_3cl, axis=1)
    f1_weighted = float(np.sum(np.array(per_class_f1) * class_counts) / N) if N > 0 else 0.0

    # Binary Oil vs Non-Oil
    # Class 2 = Oil (positive), Classes 0 & 1 = Non-Oil (negative)
    y_true_binary = (y_true_3class == 2).astype(int)
    oil_probs = y_probs_3class[:, 2]
    y_pred_binary = (oil_probs >= decision_threshold).astype(int)

    tp = int(np.sum((y_true_binary == 1) & (y_pred_binary == 1)))
    fp = int(np.sum((y_true_binary == 0) & (y_pred_binary == 1)))
    tn = int(np.sum((y_true_binary == 0) & (y_pred_binary == 0)))
    fn = int(np.sum((y_true_binary == 1) & (y_pred_binary == 0)))

    oil_prec = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    oil_rec = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    oil_f1 = float((2 * oil_prec * oil_rec) / (oil_prec + oil_rec)) if (oil_prec + oil_rec) > 0 else 0.0
    oil_spec = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
    oil_fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0

    clean_indices = np.where(y_true_3class == 0)[0]
    clean_fp = np.sum(y_pred_binary[clean_indices] == 1)
    clean_fpr = float(clean_fp / len(clean_indices)) if len(clean_indices) > 0 else 0.0

    lookalike_indices = np.where(y_true_3class == 1)[0]
    lookalike_fp = np.sum(y_pred_binary[lookalike_indices] == 1)
    lookalike_fpr = float(lookalike_fp / len(lookalike_indices)) if len(lookalike_indices) > 0 else 0.0

    roc_auc = compute_roc_auc_np(y_true_binary, oil_probs)
    pr_auc = compute_pr_auc_np(y_true_binary, oil_probs)

    return {
        "accuracy_3class": float(acc_3cl),
        "macro_precision": prec_macro,
        "macro_recall": rec_macro,
        "macro_f1": f1_macro,
        "weighted_f1": f1_weighted,
        "confusion_matrix_3class": cm_3cl.tolist(),
        "oil_precision": oil_prec,
        "oil_recall": oil_rec,
        "oil_f1": oil_f1,
        "oil_specificity": oil_spec,
        "oil_fpr": oil_fpr,
        "clean_fpr": clean_fpr,
        "lookalike_fpr": lookalike_fpr,
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "binary_tp": tp,
        "binary_fp": fp,
        "binary_tn": tn,
        "binary_fn": fn,
        "decision_threshold": float(decision_threshold)
    }


def evaluate(model, loader, device, threshold=0.50):
    model.eval()
    all_targets = []
    all_probs = []
    all_items = []

    with torch.no_grad():
        for inputs, targets, binary_targets, items in loader:
            inputs = inputs.to(device)
            outputs = model(inputs)
            probs = torch.softmax(outputs, dim=1).cpu().numpy()
            all_probs.append(probs)
            all_targets.append(targets.numpy())
            batch_len = len(targets)
            for i in range(batch_len):
                all_items.append({k: items[k][i] for k in items})

    y_true = np.concatenate(all_targets)
    y_probs = np.concatenate(all_probs, axis=0)
    metrics = compute_metrics_np(y_true, y_probs, decision_threshold=threshold)
    return metrics, y_true, y_probs, all_items


def optimize_threshold(y_true_val, y_probs_val):
    candidate_thresholds = [0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80]
    results = []

    for t in candidate_thresholds:
        m = compute_metrics_np(y_true_val, y_probs_val, decision_threshold=t)
        # Criterion: 0.6 * Oil F1 + 0.2 * Oil Recall + 0.2 * Specificity
        criterion_score = m["oil_f1"] * 0.6 + m["oil_recall"] * 0.2 + m["oil_specificity"] * 0.2
        results.append({
            "threshold": t,
            "oil_recall": m["oil_recall"],
            "oil_precision": m["oil_precision"],
            "oil_f1": m["oil_f1"],
            "oil_specificity": m["oil_specificity"],
            "oil_fpr": m["oil_fpr"],
            "clean_fpr": m["clean_fpr"],
            "lookalike_fpr": m["lookalike_fpr"],
            "criterion_score": criterion_score
        })

    best = max(results, key=lambda x: x["criterion_score"])
    return best["threshold"], results


def train_and_evaluate():
    print("="*70)
    print("STARTING PART 0.14B.3: REAL OPTICAL OIL-SPILL CLASSIFIER V2 TRAINING")
    print("="*70)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    train_dataset = OpticalDataset(METADATA_DIR / "train_manifest.json", transform=TRAIN_TRANSFORMS, expected_split="TRAIN")
    val_dataset = OpticalDataset(METADATA_DIR / "validation_manifest.json", transform=EVAL_TRANSFORMS, expected_split="VALIDATION")
    test_dataset = OpticalDataset(METADATA_DIR / "internal_test_manifest.json", transform=EVAL_TRANSFORMS, expected_split="INTERNAL_TEST")

    print(f"Dataset Loaded -> TRAIN: {len(train_dataset)}, VAL: {len(val_dataset)}, INTERNAL_TEST: {len(test_dataset)}")

    train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True, num_workers=0, pin_memory=torch.cuda.is_available())
    val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False, num_workers=0)

    n_clean, n_lookalike, n_oil = 361, 998, 602
    n_total = len(train_dataset)
    class_weights = torch.tensor([
        n_total / (3.0 * n_clean),
        n_total / (3.0 * n_lookalike),
        n_total / (3.0 * n_oil)
    ], dtype=torch.float).to(device)

    print(f"Class Weights (Derived from TRAIN only): Clean={class_weights[0]:.4f}, LookAlike={class_weights[1]:.4f}, Oil={class_weights[2]:.4f}")

    criterion = nn.CrossEntropyLoss(weight=class_weights)
    model = RgbOilClassifierV2(pretrained=True, num_classes=3).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=2)

    epochs = 20
    early_stopping_patience = 5
    best_val_f1 = -1.0
    patience_counter = 0
    best_checkpoint_path = MODEL_SAVE_DIR / "rgb_oil_classifier_v2.pth"

    training_history = []

    print("\nBeginning Training Loop (Max 20 epochs)...")
    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        start_t = time.time()

        for inputs, targets, _, _ in train_loader:
            inputs, targets = inputs.to(device), targets.to(device)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * inputs.size(0)

        epoch_train_loss = running_loss / len(train_dataset)

        # Validation evaluation at default threshold 0.50
        val_metrics, y_true_val, y_probs_val, _ = evaluate(model, val_loader, device, threshold=0.50)
        epoch_time = time.time() - start_t

        scheduler.step(val_metrics["oil_f1"])

        history_entry = {
            "epoch": epoch,
            "train_loss": epoch_train_loss,
            "val_accuracy": val_metrics["accuracy_3class"],
            "val_macro_f1": val_metrics["macro_f1"],
            "val_oil_f1": val_metrics["oil_f1"],
            "val_oil_recall": val_metrics["oil_recall"],
            "val_oil_precision": val_metrics["oil_precision"],
            "val_oil_fpr": val_metrics["oil_fpr"],
            "lr": optimizer.param_groups[0]["lr"],
            "epoch_seconds": epoch_time
        }
        training_history.append(history_entry)

        print(f"Epoch [{epoch:2d}/{epochs:2d}] ({epoch_time:.1f}s) | Train Loss: {epoch_train_loss:.4f} | "
              f"Val Acc: {val_metrics['accuracy_3class']*100:.2f}% | Val Macro F1: {val_metrics['macro_f1']:.4f} | "
              f"Oil F1: {val_metrics['oil_f1']:.4f} (Rec: {val_metrics['oil_recall']*100:.1f}%, Prec: {val_metrics['oil_precision']*100:.1f}%, FPR: {val_metrics['oil_fpr']*100:.1f}%)")

        if val_metrics["oil_f1"] > best_val_f1:
            best_val_f1 = val_metrics["oil_f1"]
            torch.save(model.state_dict(), best_checkpoint_path)
            torch.save(model.state_dict(), RESULTS_DIR / "rgb_oil_classifier_v2.pth")
            patience_counter = 0
            print(f"  --> [NEW BEST CHECKPOINT] Saved model with Validation Oil F1 = {best_val_f1:.4f}")
        else:
            patience_counter += 1
            if patience_counter >= early_stopping_patience:
                print(f"Early stopping triggered after {epoch} epochs (patience {early_stopping_patience}).")
                break

    # Load best checkpoint
    print("\nLoading Best Checkpoint for Validation Threshold Optimization & Final Testing...")
    model.load_state_dict(torch.load(best_checkpoint_path, map_location=device, weights_only=True))

    val_metrics_raw, y_true_val, y_probs_val, _ = evaluate(model, val_loader, device, threshold=0.50)
    best_threshold, threshold_tuning_results = optimize_threshold(y_true_val, y_probs_val)
    print(f"\nLocked Optimal Decision Threshold on Validation Set: {best_threshold:.2f}")

    final_val_metrics, _, _, _ = evaluate(model, val_loader, device, threshold=best_threshold)
    print("\n--- FINAL VALIDATION METRICS (Locked Threshold) ---")
    print(f"  Accuracy (3-class): {final_val_metrics['accuracy_3class']*100:.2f}%")
    print(f"  Macro F1:           {final_val_metrics['macro_f1']:.4f}")
    print(f"  Oil Precision:      {final_val_metrics['oil_precision']*100:.2f}%")
    print(f"  Oil Recall:         {final_val_metrics['oil_recall']*100:.2f}%")
    print(f"  Oil F1:             {final_val_metrics['oil_f1']:.4f}")
    print(f"  Clean FPR:          {final_val_metrics['clean_fpr']*100:.2f}%")
    print(f"  Look-Alike FPR:     {final_val_metrics['lookalike_fpr']*100:.2f}%")
    print(f"  Overall FPR:        {final_val_metrics['oil_fpr']*100:.2f}%")
    print(f"  PR-AUC:             {final_val_metrics['pr_auc']:.4f}")

    # Final evaluation on locked INTERNAL_TEST set
    print("\n--- EVALUATING LOCKED INTERNAL TEST BENCHMARK (708 images) ---")
    test_metrics, y_true_test, y_probs_test, test_items = evaluate(model, test_loader, device, threshold=best_threshold)
    print(f"  Accuracy (3-class): {test_metrics['accuracy_3class']*100:.2f}%")
    print(f"  Macro Precision:    {test_metrics['macro_precision']*100:.2f}%")
    print(f"  Macro Recall:       {test_metrics['macro_recall']*100:.2f}%")
    print(f"  Macro F1:           {test_metrics['macro_f1']:.4f}")
    print(f"  Weighted F1:        {test_metrics['weighted_f1']:.4f}")
    print(f"  Oil Precision:      {test_metrics['oil_precision']*100:.2f}%")
    print(f"  Oil Recall:         {test_metrics['oil_recall']*100:.2f}%")
    print(f"  Oil F1:             {test_metrics['oil_f1']:.4f}")
    print(f"  Oil Specificity:    {test_metrics['oil_specificity']*100:.2f}%")
    print(f"  Oil FPR:            {test_metrics['oil_fpr']*100:.2f}%")
    print(f"  Clean FPR:          {test_metrics['clean_fpr']*100:.2f}%")
    print(f"  Look-Alike FPR:     {test_metrics['lookalike_fpr']*100:.2f}%")
    print(f"  ROC-AUC:            {test_metrics['roc_auc']:.4f}")
    print(f"  PR-AUC:             {test_metrics['pr_auc']:.4f}")
    print(f"  Confusion Matrix (3-class):\n{np.array(test_metrics['confusion_matrix_3class'])}")
    print(f"  Binary Matrix (Oil vs Non-Oil): TP={test_metrics['binary_tp']}, FP={test_metrics['binary_fp']}, TN={test_metrics['binary_tn']}, FN={test_metrics['binary_fn']}")

    y_pred_binary = (y_probs_test[:, 2] >= best_threshold).astype(int)
    y_true_binary = (y_true_test == 2).astype(int)

    false_positives = []
    false_negatives = []

    for idx, (yt, yp, probs, item) in enumerate(zip(y_true_binary, y_pred_binary, y_probs_test, test_items)):
        if yt == 0 and yp == 1:
            false_positives.append({
                "image_id": item["image_id"],
                "true_category": item["category"],
                "source_dataset": item["source_dataset"],
                "scene_id": item["scene_id"],
                "oil_probability": float(probs[2]),
                "clean_probability": float(probs[0]),
                "lookalike_probability": float(probs[1]),
                "reason": f"Look-alike {item['category']} mistaken as oil spill" if item["category"] == "LOOK_ALIKE" else "Clean water surface feature mistaken as oil"
            })
        elif yt == 1 and yp == 0:
            false_negatives.append({
                "image_id": item["image_id"],
                "true_category": item["category"],
                "source_dataset": item["source_dataset"],
                "scene_id": item["scene_id"],
                "oil_probability": float(probs[2]),
                "clean_probability": float(probs[0]),
                "lookalike_probability": float(probs[1]),
                "reason": "Diffuse or small optical oil signature below threshold"
            })

    print(f"\nInternal Test Failure Breakdown -> False Positives: {len(false_positives)}, False Negatives: {len(false_negatives)}")

    sha256 = hashlib.sha256()
    with open(best_checkpoint_path, "rb") as f:
        while chunk := f.read(65536):
            sha256.update(chunk)
    checkpoint_sha256 = sha256.hexdigest()

    # Save artifacts
    for out_dir in [MODEL_SAVE_DIR, RESULTS_DIR]:
        with open(out_dir / "training_config.json", "w") as f:
            json.dump({
                "model_id": "rgb-oil-classifier-resnet18-v2",
                "architecture": "ResNet-18 ImageNet Transfer Learning + 3-Class Head",
                "pretrained": True,
                "pretrained_source": "torchvision.models.ResNet18_Weights.DEFAULT",
                "seed": SEED,
                "optimizer": "AdamW",
                "learning_rate": 1e-4,
                "weight_decay": 1e-4,
                "batch_size": 32,
                "epochs_run": len(training_history),
                "early_stopping_patience": early_stopping_patience,
                "input_resolution": [224, 224],
                "class_weights": class_weights.cpu().tolist(),
                "device": str(device)
            }, f, indent=2)

        with open(out_dir / "class_mapping.json", "w") as f:
            json.dump({
                "classes": CLASS_NAMES,
                "class_to_idx": CLASS_TO_IDX,
                "binary_mapping": {"OIL_SPILL": 1, "CLEAN_OCEAN": 0, "LOOK_ALIKE": 0}
            }, f, indent=2)

        with open(out_dir / "preprocessing.json", "w") as f:
            json.dump({
                "input_size": [224, 224],
                "normalize_mean": NORMALIZE_MEAN,
                "normalize_std": NORMALIZE_STD,
                "color_handling": "RGB",
                "augmentation": {
                    "train": ["RandomHorizontalFlip(p=0.5)", "RandomVerticalFlip(p=0.5)", "RandomRotation(15)", "ColorJitter(b=0.15, c=0.15, s=0.10)"],
                    "eval": ["Resize(224, 224)", "Normalize(ImageNet)"]
                }
            }, f, indent=2)

        with open(out_dir / "threshold.json", "w") as f:
            json.dump({
                "selected_threshold": best_threshold,
                "selection_criterion": "Oil F1 * 0.6 + Oil Recall * 0.2 + Specificity * 0.2 (Validation Only)",
                "tuning_results": threshold_tuning_results
            }, f, indent=2)

        with open(out_dir / "metrics_validation.json", "w") as f:
            json.dump(final_val_metrics, f, indent=2)

        with open(out_dir / "metrics_internal_test.json", "w") as f:
            json.dump(test_metrics, f, indent=2)

        with open(out_dir / "confusion_matrix.json", "w") as f:
            json.dump({
                "validation": final_val_metrics["confusion_matrix_3class"],
                "internal_test": test_metrics["confusion_matrix_3class"],
                "classes": CLASS_NAMES
            }, f, indent=2)

        with open(out_dir / "training_history.json", "w") as f:
            json.dump(training_history, f, indent=2)

        with open(out_dir / "model_sha256.txt", "w") as f:
            f.write(checkpoint_sha256 + "\n")

        with open(out_dir / "failure_analysis.json", "w") as f:
            json.dump({
                "internal_test_total": len(test_dataset),
                "false_positives_count": len(false_positives),
                "false_negatives_count": len(false_negatives),
                "false_positives": false_positives,
                "false_negatives": false_negatives
            }, f, indent=2)

    # Update model registry audit
    registry_path = PROJECT_ROOT / "ml" / "experiments" / "results" / "model_registry_audit.json"
    if registry_path.exists():
        with open(registry_path, "r") as f:
            reg_data = json.load(f)
    else:
        reg_data = {}

    reg_data["models"] = reg_data.get("models", [])
    v2_entry = {
        "model_id": "rgb-oil-classifier-resnet18-v2",
        "version": "2.0.0",
        "modality": "OPTICAL_RGB",
        "status": "EXPERIMENTAL",
        "architecture": "ResNet-18 (ImageNet Transfer Learning + 3-Class Head)",
        "checkpoint_path": "services/ml-python/app/models/rgb_oil_classifier_v2/rgb_oil_classifier_v2.pth",
        "checkpoint_sha256": checkpoint_sha256,
        "decision_threshold": best_threshold,
        "validation_metrics": final_val_metrics,
        "internal_test_metrics": test_metrics,
        "external_test_status": "SEALED — NOT EVALUATED",
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

    existing_idx = next((i for i, m in enumerate(reg_data["models"]) if m.get("model_id") == "rgb-oil-classifier-resnet18-v2"), None)
    if existing_idx is not None:
        reg_data["models"][existing_idx] = v2_entry
    else:
        reg_data["models"].append(v2_entry)

    with open(registry_path, "w") as f:
        json.dump(reg_data, f, indent=2)

    print(f"\nModel Registered in {registry_path} as EXPERIMENTAL.")
    print(f"Checkpoint SHA-256: {checkpoint_sha256}")
    print("\nTraining and Evaluation Finished Successfully!")
    return final_val_metrics, test_metrics, best_threshold, checkpoint_sha256


if __name__ == "__main__":
    train_and_evaluate()
