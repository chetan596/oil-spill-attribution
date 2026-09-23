"""
Script: ml/training/train_rgb_classifier.py
Purpose: Train and evaluate the Ocean Guard AI RGB Oil vs Non-Oil Image Classifier (Part 0.14B).

Architecture: ResNet-18 (ImageNet Pretrained Transfer Learning + Custom Binary Head)
Hardware: NVIDIA GeForce RTX 5050 Laptop GPU / CUDA
Zero External ML dependencies (Pure PyTorch & NumPy metric evaluation).
"""

import os
import json
import random
import hashlib
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from PIL import Image

SEED = 42
random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
if torch.cuda.is_available():
    torch.cuda.manual_seed_all(SEED)

DATASET_DIR = "d:/PROJECTS/Collge Project/oil-spill-attribution/data/processed/rgb_oil_spill_dataset"
MANIFEST_PATH = os.path.join(DATASET_DIR, "manifest.json")
CHECKPOINT_OUT = "d:/PROJECTS/Collge Project/oil-spill-attribution/ml/model_registry/versions/rgb_oil_classifier_v1.pth"
APP_CHECKPOINT_OUT = "d:/PROJECTS/Collge Project/oil-spill-attribution/services/ml-python/app/models/rgb_oil_classifier_v1.pth"
REGISTRY_PATH = "d:/PROJECTS/Collge Project/oil-spill-attribution/ml/model_registry/registry.json"

class RGBDataset(Dataset):
    def __init__(self, samples, base_dir, transform=None):
        self.samples = samples
        self.base_dir = base_dir
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        item = self.samples[idx]
        img_path = os.path.join(self.base_dir, item["rel_path"])
        image = Image.open(img_path).convert("RGB")
        label = float(item["label"])

        if self.transform:
            image = self.transform(image)

        return image, torch.tensor(label, dtype=torch.float32)

class RgbOilClassifier(nn.Module):
    def __init__(self, pretrained=True):
        super().__init__()
        weights = models.ResNet18_Weights.DEFAULT if pretrained else None
        self.backbone = models.resnet18(weights=weights)
        num_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(0.3),
            nn.Linear(num_features, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.2),
            nn.Linear(128, 1)
        )

    def forward(self, x):
        return self.backbone(x)

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def compute_metrics(y_true, y_prob, threshold=0.5):
    y_true = np.array(y_true, dtype=int)
    y_prob = np.array(y_prob, dtype=float)
    y_pred = (y_prob >= threshold).astype(int)

    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))

    total = len(y_true)
    acc = (tp + tn) / total if total > 0 else 0.0
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    spec = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    fpr = fp / (tn + fp) if (tn + fp) > 0 else 0.0
    f1 = 2 * (prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

    # ROC-AUC via Mann-Whitney U rank statistic
    n_pos = np.sum(y_true == 1)
    n_neg = np.sum(y_true == 0)
    if n_pos > 0 and n_neg > 0:
        ranks = np.argsort(np.argsort(y_prob)) + 1
        pos_rank_sum = np.sum(ranks[y_true == 1])
        roc_auc = float((pos_rank_sum - (n_pos * (n_pos + 1)) / 2.0) / (n_pos * n_neg))
    else:
        roc_auc = 0.5

    # PR-AUC approx
    thresholds = np.linspace(0.0, 1.0, 101)
    prec_list, rec_list = [], []
    for t in thresholds:
        yp = (y_prob >= t).astype(int)
        t_tp = np.sum((y_true == 1) & (yp == 1))
        t_fp = np.sum((y_true == 0) & (yp == 1))
        t_fn = np.sum((y_true == 1) & (yp == 0))
        p = t_tp / (t_tp + t_fp) if (t_tp + t_fp) > 0 else 1.0
        r = t_tp / (t_tp + t_fn) if (t_tp + t_fn) > 0 else 0.0
        prec_list.append(p)
        rec_list.append(r)
    # Numerical trapezoid integration over recall
    sorted_pairs = sorted(zip(rec_list, prec_list), key=lambda x: x[0])
    r_arr = np.array([x[0] for x in sorted_pairs], dtype=float)
    p_arr = np.array([x[1] for x in sorted_pairs], dtype=float)
    if len(r_arr) > 1:
        pr_auc = float(np.sum((r_arr[1:] - r_arr[:-1]) * (p_arr[1:] + p_arr[:-1]) / 2.0))
    else:
        pr_auc = 0.5

    return {
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "specificity": spec,
        "false_positive_rate": fpr,
        "f1_score": f1,
        "roc_auc": roc_auc,
        "pr_auc": abs(pr_auc),
        "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp}
    }

def train_and_evaluate():
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})", flush=True)

    with open(MANIFEST_PATH, "r") as f:
        manifest = json.load(f)

    # Transforms
    train_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomVerticalFlip(p=0.5),
        transforms.RandomRotation(degrees=15),
        transforms.ColorJitter(brightness=0.1, contrast=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    val_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    train_ds = RGBDataset(manifest["splits"]["train"], DATASET_DIR, transform=train_transform)
    val_ds = RGBDataset(manifest["splits"]["val"], DATASET_DIR, transform=val_transform)
    test_ds = RGBDataset(manifest["splits"]["test"], DATASET_DIR, transform=val_transform)

    train_loader = DataLoader(train_ds, batch_size=16, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=16, shuffle=False, num_workers=0)

    model = RgbOilClassifier(pretrained=True).to(device)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=20, eta_min=1e-6)

    best_val_loss = float("inf")
    best_val_f1 = 0.0
    best_epoch = 0
    epochs = 20

    print(f"Training RgbOilClassifier for {epochs} epochs on train set (410 samples)...", flush=True)

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device).unsqueeze(1)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * images.size(0)

        train_loss /= len(train_ds)
        scheduler.step()

        # Validation
        model.eval()
        val_loss = 0.0
        val_preds_prob = []
        val_targets = []
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device).unsqueeze(1)
                outputs = model(images)
                loss = criterion(outputs, labels)
                val_loss += loss.item() * images.size(0)
                probs = torch.sigmoid(outputs).squeeze(1).cpu().numpy()
                val_preds_prob.extend(probs)
                val_targets.extend(labels.squeeze(1).cpu().numpy())

        val_loss /= len(val_ds)
        m = compute_metrics(val_targets, val_preds_prob, threshold=0.5)

        print(f"Epoch [{epoch:02d}/{epochs}] Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | Val Acc: {m['accuracy']*100:.2f}% | Val F1: {m['f1_score']:.4f}", flush=True)

        if val_loss < best_val_loss or (val_loss <= best_val_loss * 1.05 and m['f1_score'] >= best_val_f1):
            best_val_loss = val_loss
            best_val_f1 = m['f1_score']
            best_epoch = epoch
            # Save checkpoints
            os.makedirs(os.path.dirname(CHECKPOINT_OUT), exist_ok=True)
            os.makedirs(os.path.dirname(APP_CHECKPOINT_OUT), exist_ok=True)
            torch.save(model.state_dict(), CHECKPOINT_OUT)
            torch.save(model.state_dict(), APP_CHECKPOINT_OUT)

    print(f"\nBest model saved from epoch {best_epoch} (Val Loss: {best_val_loss:.4f}, Val F1: {best_val_f1:.4f})", flush=True)

    # Load best checkpoint
    model.load_state_dict(torch.load(CHECKPOINT_OUT, map_location=device))
    model.eval()

    # Threshold Optimization on Validation Set ONLY (Zero test set leakage)
    val_preds_prob = []
    val_targets = []
    with torch.no_grad():
        for images, labels in val_loader:
            images = images.to(device)
            outputs = model(images)
            probs = torch.sigmoid(outputs).squeeze(1).cpu().numpy()
            val_preds_prob.extend(probs)
            val_targets.extend(labels.numpy())

    val_targets = np.array(val_targets)
    val_preds_prob = np.array(val_preds_prob)

    best_thresh = 0.5
    best_thresh_score = -1.0
    thresh_grid = np.linspace(0.20, 0.80, 61)

    for th in thresh_grid:
        m = compute_metrics(val_targets, val_preds_prob, threshold=th)
        # Composite score balancing F1 and Specificity (penalizing false positives)
        composite_score = m["f1_score"] + 0.5 * m["specificity"]
        if composite_score > best_thresh_score:
            best_thresh_score = composite_score
            best_thresh = float(round(th, 3))

    print(f"\nSelected Decision Threshold on Validation Set: {best_thresh:.3f}", flush=True)

    val_metrics = compute_metrics(val_targets, val_preds_prob, threshold=best_thresh)
    print(f"Validation Metrics (Threshold {best_thresh}):")
    print(f"  Accuracy: {val_metrics['accuracy']*100:.2f}%")
    print(f"  Precision: {val_metrics['precision']:.4f}")
    print(f"  Recall (Oil): {val_metrics['recall']:.4f}")
    print(f"  Specificity (Non-Oil): {val_metrics['specificity']:.4f}")
    print(f"  False Positive Rate: {val_metrics['false_positive_rate']:.4f}")
    print(f"  F1 Score: {val_metrics['f1_score']:.4f}")
    print(f"  ROC-AUC: {val_metrics['roc_auc']:.4f}")
    print(f"  Confusion Matrix: {val_metrics['confusion_matrix']}", flush=True)

    # FINAL SINGLE-PASS EVALUATION ON HELD-OUT TEST SET
    print("\nExecuting Locked Evaluation on Held-Out Test Set...", flush=True)
    test_preds_prob = []
    test_targets = []
    with torch.no_grad():
        for images, labels in test_loader:
            images = images.to(device)
            outputs = model(images)
            probs = torch.sigmoid(outputs).squeeze(1).cpu().numpy()
            test_preds_prob.extend(probs)
            test_targets.extend(labels.numpy())

    test_targets = np.array(test_targets)
    test_preds_prob = np.array(test_preds_prob)
    test_metrics = compute_metrics(test_targets, test_preds_prob, threshold=best_thresh)

    cm = test_metrics["confusion_matrix"]
    print(f"\n================ HELD-OUT TEST EVALUATION ================")
    print(f"Total Held-Out Samples: {len(test_targets)} (84 Oil, 30 Non-Oil [15 Clean Ocean, 15 Lookalike])")
    print(f"Decision Threshold: {best_thresh:.3f}")
    print(f"Accuracy: {test_metrics['accuracy']*100:.2f}%")
    print(f"Precision: {test_metrics['precision']:.4f}")
    print(f"Recall (Oil): {test_metrics['recall']:.4f}")
    print(f"Specificity (Non-Oil): {test_metrics['specificity']:.4f}")
    print(f"False Positive Rate: {test_metrics['false_positive_rate']:.4f}")
    print(f"F1 Score: {test_metrics['f1_score']:.4f}")
    print(f"ROC-AUC: {test_metrics['roc_auc']:.4f}")
    print(f"PR-AUC: {test_metrics['pr_auc']:.4f}")
    print(f"Confusion Matrix:\n  [TN={cm['tn']}, FP={cm['fp']}]\n  [FN={cm['fn']}, TP={cm['tp']}]")
    print(f"==========================================================", flush=True)

    # Compute Checksum
    model_sha256 = compute_sha256(CHECKPOINT_OUT)
    print(f"Checkpoint SHA256: {model_sha256}")

    # Save Evaluation Result Report
    eval_report = {
        "model_id": "rgb-oil-classifier-resnet18-v1",
        "model_name": "Ocean Guard AI RGB Oil vs Non-Oil Classifier",
        "release": "OG-RGB-ML-RESEARCH-RELEASE-V0.14B",
        "version": "1.0.0",
        "architecture": "ResNet-18 (ImageNet Pretrained Transfer Learning + Custom Binary Head)",
        "checkpoint_file": "rgb_oil_classifier_v1.pth",
        "checkpoint_sha256": model_sha256,
        "input_modality": ["JPG", "JPEG", "PNG"],
        "input_resolution": [224, 224, 3],
        "device_trained": str(device),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None",
        "training_config": {
            "seed": SEED,
            "epochs": epochs,
            "best_epoch": best_epoch,
            "batch_size": 16,
            "lr": 1e-4,
            "optimizer": "AdamW",
            "weight_decay": 1e-4,
            "scheduler": "CosineAnnealingLR",
            "loss": "BCEWithLogitsLoss",
        },
        "dataset_summary": manifest["summary"],
        "decision_threshold": best_thresh,
        "threshold_selection_method": "Validation set composite F1 + Specificity optimization (Zero test set leakage)",
        "validation_metrics": {
            "accuracy": float(round(val_metrics["accuracy"], 4)),
            "precision": float(round(val_metrics["precision"], 4)),
            "recall": float(round(val_metrics["recall"], 4)),
            "specificity": float(round(val_metrics["specificity"], 4)),
            "false_positive_rate": float(round(val_metrics["false_positive_rate"], 4)),
            "f1_score": float(round(val_metrics["f1_score"], 4)),
            "roc_auc": float(round(val_metrics["roc_auc"], 4)),
            "confusion_matrix": val_metrics["confusion_matrix"]
        },
        "held_out_test_metrics": {
            "total_samples": len(test_targets),
            "accuracy": float(round(test_metrics["accuracy"], 4)),
            "precision": float(round(test_metrics["precision"], 4)),
            "recall": float(round(test_metrics["recall"], 4)),
            "specificity": float(round(test_metrics["specificity"], 4)),
            "false_positive_rate": float(round(test_metrics["false_positive_rate"], 4)),
            "f1_score": float(round(test_metrics["f1_score"], 4)),
            "roc_auc": float(round(test_metrics["roc_auc"], 4)),
            "pr_auc": float(round(test_metrics["pr_auc"], 4)),
            "confusion_matrix": test_metrics["confusion_matrix"]
        }
    }

    report_path = "d:/PROJECTS/Collge Project/oil-spill-attribution/ml/experiments/results/rgb_classifier_v1_evaluation_report.json"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w") as f:
        json.dump(eval_report, f, indent=2)
    print(f"Evaluation report saved to: {report_path}")

    # Register in registry.json
    if os.path.exists(REGISTRY_PATH):
        try:
            with open(REGISTRY_PATH, "r") as f:
                reg = json.load(f)
            reg["models"]["rgb-oil-classifier-resnet18-v1"] = eval_report
            with open(REGISTRY_PATH, "w") as f:
                json.dump(reg, f, indent=2)
            print(f"Model successfully registered in {REGISTRY_PATH}")
        except Exception as e:
            print(f"Failed to update registry.json: {e}")

if __name__ == "__main__":
    train_and_evaluate()
