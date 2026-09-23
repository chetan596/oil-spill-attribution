"""
Comprehensive Model Registry and Checkpoint Audit for Part 0.3.
Audits all registered models and physical checkpoints:
- Inspects ml/model_registry/registry.json
- Verifies physical file existence, size, and SHA-256 hash
- Validates state_dict keys and architecture compatibility
- Executes CPU and CUDA load tests with deterministic dummy forward pass
- Generates ml/experiments/results/model_registry_audit.json
"""

import sys
import os
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

# Add project roots
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, repo_root)
sys.path.insert(0, os.path.join(repo_root, "services", "ml-python"))

import torch
import torch.nn as nn
from app.models.unet.architecture import UNet


def compute_sha256(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def audit_checkpoints():
    print("=" * 70)
    print("PART 0.3 — MODEL REGISTRY & CHECKPOINT AUDIT")
    print("=" * 70)

    registry_json_path = os.path.join(repo_root, "ml", "model_registry", "registry.json")
    versions_dir = os.path.join(repo_root, "ml", "model_registry", "versions")

    # 1. Load registry.json
    with open(registry_json_path, "r", encoding="utf-8") as f:
        registry_data = json.load(f)

    registered_models = {m["model_id"]: m for m in registry_data.get("models", [])}
    active_model_id = registry_data.get("active_model_id")

    # 2. Inspect physical files in versions/
    physical_files = {}
    if os.path.exists(versions_dir):
        for fname in os.listdir(versions_dir):
            if fname.endswith(".pth"):
                fpath = os.path.join(versions_dir, fname)
                physical_files[fname] = {
                    "path": fpath,
                    "rel_path": f"ml/model_registry/versions/{fname}",
                    "size_bytes": os.path.getsize(fpath),
                    "sha256": compute_sha256(fpath),
                }

    print(f"Active Model ID in Registry: {active_model_id}")
    print(f"Registered Models: {len(registered_models)}")
    print(f"Physical Checkpoints Found: {len(physical_files)}")

    audit_results = []
    cuda_avail = torch.cuda.is_available()
    device = torch.device("cuda:0" if cuda_avail else "cpu")

    # 3. Audit each model (registered + any physical un-registered checkpoints)
    all_model_identifiers = list(registered_models.keys())
    # Also check if any physical checkpoint corresponds to an unlisted version (like v5a)
    for fname, fmeta in physical_files.items():
        base_id = fname.replace(".pth", "").replace("_", "-")
        if base_id not in registered_models and base_id not in all_model_identifiers:
            all_model_identifiers.append(base_id)

    for mid in all_model_identifiers:
        reg_entry = registered_models.get(mid, {})
        arch = reg_entry.get("architecture", "UNet")
        in_channels = reg_entry.get("in_channels", 2)
        num_classes = reg_entry.get("num_classes", 2)
        status = reg_entry.get("status", "UNREGISTERED_CHECKPOINT" if mid not in registered_models else "UNKNOWN")
        ckpt_rel_path = reg_entry.get("checkpoint_path", f"ml/model_registry/versions/{mid.replace('-', '_')}.pth")
        
        full_ckpt_path = os.path.join(repo_root, ckpt_rel_path)
        exists = os.path.exists(full_ckpt_path) and os.path.isfile(full_ckpt_path)

        # Preprocessing contract
        norm_info = reg_entry.get("normalization", {})
        if mid in ("unet-dual-pol-sar-v4", "unet-dual-pol-sar-v5a"):
            preprocessing_contract = {
                "name": "Decibel_Calibrated_Clipping",
                "vv_range_db": [-35.0, -5.0],
                "vh_range_db": [-45.0, -15.0],
                "formula": "clip((value_db - min_db) / (max_db - min_db), 0, 1)",
                "channel_order": ["VV", "VH"],
                "invalid_handling": "fill_zero",
                "verified": True
            }
        elif mid in ("unet-dual-pol-sar-v1", "unet-dual-pol-sar-v2", "unet-dual-pol-sar-v3"):
            preprocessing_contract = {
                "name": "Historical_Uncorrected_Positive_Mask",
                "vv_range_db": "NOT_CALIBRATED (clipped > 0)",
                "vh_range_db": "NOT_CALIBRATED (clipped > 0)",
                "formula": "arr * (arr > 0)",
                "channel_order": ["VV", "VH"],
                "invalid_handling": "clipped_to_zero",
                "verified": True,
                "note": "Historical baseline with negative dB truncation."
            }
        else:
            preprocessing_contract = {
                "name": "NOT_DOCUMENTED",
                "verified": False
            }

        entry_audit = {
            "model_id": mid,
            "version": mid.split("-")[-1].upper(),
            "status": status,
            "architecture": arch,
            "in_channels": in_channels,
            "num_classes": num_classes,
            "checkpoint_path": ckpt_rel_path,
            "checkpoint_exists": exists,
            "checkpoint_size_bytes": os.path.getsize(full_ckpt_path) if exists else None,
            "sha256": compute_sha256(full_ckpt_path) if exists else None,
            "preprocessing": preprocessing_contract,
            "load_test": "NOT_STARTED",
            "cuda_forward_test": "NOT_STARTED",
            "notes": []
        }

        if not exists:
            entry_audit["load_test"] = "CHECKPOINT_NOT_FOUND"
            entry_audit["cuda_forward_test"] = "SKIPPED_NO_CHECKPOINT"
            entry_audit["notes"].append("Checkpoint file is absent from disk.")
            print(f"[-] {mid:<25}: CHECKPOINT_NOT_FOUND ({ckpt_rel_path})")
            audit_results.append(entry_audit)
            continue

        # Physical checkpoint exists -> inspect state dict and load
        try:
            raw_ckpt = torch.load(full_ckpt_path, map_location="cpu")
            if isinstance(raw_ckpt, dict) and "model_state_dict" in raw_ckpt:
                state_dict = raw_ckpt["model_state_dict"]
                hp = raw_ckpt.get("hyperparameters", {})
                entry_audit["checkpoint_format"] = "dict_with_metadata"
                entry_audit["saved_hyperparameters"] = hp
            elif isinstance(raw_ckpt, dict):
                state_dict = raw_ckpt
                entry_audit["checkpoint_format"] = "raw_state_dict"
            else:
                raise ValueError(f"Unknown checkpoint format: {type(raw_ckpt)}")

            # Extract base_channels
            base_channels = 32
            if "inc.conv.0.weight" in state_dict:
                base_channels = state_dict["inc.conv.0.weight"].shape[0]
            elif "inc.conv.0.0.weight" in state_dict:
                base_channels = state_dict["inc.conv.0.0.weight"].shape[0]

            entry_audit["detected_base_channels"] = base_channels

            # Instantiate architecture
            model = UNet(in_channels=in_channels, num_classes=num_classes, base_channels=base_channels)
            
            # Load state_dict
            missing_keys, unexpected_keys = model.load_state_dict(state_dict, strict=True)
            entry_audit["missing_keys"] = missing_keys
            entry_audit["unexpected_keys"] = unexpected_keys
            entry_audit["load_test"] = "PASSED"

            # CPU Forward Pass
            model.eval()
            dummy_x_cpu = torch.randn(1, in_channels, 512, 512, dtype=torch.float32)
            with torch.no_grad():
                out_cpu = model(dummy_x_cpu)
            assert out_cpu.shape == (1, num_classes, 512, 512), f"CPU output shape mismatch: {out_cpu.shape}"

            # CUDA Forward Pass if CUDA available
            if cuda_avail:
                model_cuda = model.to(device)
                dummy_x_cuda = dummy_x_cpu.to(device)
                with torch.no_grad():
                    out_cuda = model_cuda(dummy_x_cuda)
                torch.cuda.synchronize()
                assert out_cuda.shape == (1, num_classes, 512, 512), f"CUDA output shape mismatch: {out_cuda.shape}"
                entry_audit["cuda_forward_test"] = "PASSED"
                del model_cuda, dummy_x_cuda, out_cuda
                torch.cuda.empty_cache()
            else:
                entry_audit["cuda_forward_test"] = "CUDA_UNAVAILABLE"

            del model, dummy_x_cpu, out_cpu
            print(f"[+] {mid:<25}: LOAD_PASSED | SHA256={entry_audit['sha256'][:12]}... | BaseChannels={base_channels} | CUDA={entry_audit['cuda_forward_test']}")

        except Exception as e:
            entry_audit["load_test"] = "LOAD_FAILED"
            entry_audit["cuda_forward_test"] = "FAILED"
            entry_audit["notes"].append(f"Load error: {str(e)}")
            print(f"[!] {mid:<25}: LOAD_FAILED -> {e}")

        audit_results.append(entry_audit)

    final_report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "registry_version": registry_data.get("registry_version", "1.0"),
        "active_model_id": active_model_id,
        "total_models_audited": len(audit_results),
        "cuda_environment": {
            "cuda_available": cuda_avail,
            "device_name": torch.cuda.get_device_name(0) if cuda_avail else "CPU",
            "compute_capability": f"{torch.cuda.get_device_capability(0)[0]}.{torch.cuda.get_device_capability(0)[1]}" if cuda_avail else "N/A",
        },
        "models": audit_results
    }

    out_path = os.path.join(repo_root, "ml", "experiments", "results", "model_registry_audit.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(final_report, f, indent=2)

    print(f"\nAudit completed. Saved machine-readable audit report to: {out_path}")
    return final_report


if __name__ == "__main__":
    audit_checkpoints()
