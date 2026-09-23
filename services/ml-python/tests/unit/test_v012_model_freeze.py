"""
Unit tests for PART 0.12 — Model Freeze & Scientific Audit.
"""

import os
import json
import pytest
import torch

from app.models.registry import ModelRegistry
from ml.training.train_v6 import compute_file_sha256

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))


def test_v012_artifacts_completeness():
    """Verify all required Part 0.12 model freeze artifacts exist on disk."""
    freeze_dir = os.path.join(_REPO_ROOT, "ml/experiments/results/v012_model_freeze")
    required_json_files = [
        "frozen_release_manifest.json",
        "checkpoint_manifest.json",
        "dataset_manifest.json",
        "preprocessing_manifest.json",
        "evaluation_manifest.json",
        "benchmark_reference.json",
        "reproducibility_manifest.json",
        "claims_audit.json",
        "release_summary.json",
    ]
    for rf in required_json_files:
        p = os.path.join(freeze_dir, rf)
        assert os.path.exists(p), f"Missing Part 0.12 JSON artifact: {p}"

    # Master release manifest in model registry
    master_manifest = os.path.join(_REPO_ROOT, "ml/model_registry/frozen_release_manifest.json")
    assert os.path.exists(master_manifest), f"Missing master release manifest: {master_manifest}"

    # Documentation files
    audit_doc = os.path.join(_REPO_ROOT, "docs/model/PART_0_12_MODEL_FREEZE_AND_SCIENTIFIC_AUDIT.md")
    assert os.path.exists(audit_doc), f"Missing audit report markdown: {audit_doc}"

    future_doc = os.path.join(_REPO_ROOT, "docs/model/FUTURE_RESEARCH.md")
    assert os.path.exists(future_doc), f"Missing future research markdown: {future_doc}"


def test_v012_frozen_checkpoint_hashes():
    """Verify cryptographic integrity of all frozen checkpoints."""
    manifest_path = os.path.join(_REPO_ROOT, "ml/experiments/results/v012_model_freeze/checkpoint_manifest.json")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    ckpt_dir = os.path.join(_REPO_ROOT, "ml/model_registry/versions")

    # V09D
    v09d_info = manifest["V09D_RESIDUAL_LOSS"]
    v09d_path = os.path.join(ckpt_dir, os.path.basename(v09d_info["checkpoint_path"]))
    assert os.path.exists(v09d_path)
    assert compute_file_sha256(v09d_path) == v09d_info["sha256"]
    assert v09d_info["sha256"] == "ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d"
    assert v09d_info["parameter_count"] == 1114338

    # V6
    v6_info = manifest["V6_BASELINE"]
    v6_path = os.path.join(ckpt_dir, os.path.basename(v6_info["checkpoint_path"]))
    assert os.path.exists(v6_path)
    assert compute_file_sha256(v6_path) == v6_info["sha256"]
    assert v6_info["sha256"] == "bcf3d6bc988b910fa67c0c31c89cb2c861da73f0b02159c579cb28e5039920e3"
    assert v6_info["parameter_count"] == 1080802

    # V2
    v2_info = manifest["V2_HISTORICAL"]
    v2_path = os.path.join(ckpt_dir, os.path.basename(v2_info["checkpoint_path"]))
    assert os.path.exists(v2_path)
    assert compute_file_sha256(v2_path) == v2_info["sha256"]
    assert v2_info["sha256"] == "905ef8e47c1f4b12eb490b33f1726fb91714b3dfcdf5184d8dfd96ec312f0dbd"


def test_v012_frozen_dataset_hash():
    """Verify cryptographic integrity of dataset manifest."""
    manifest_path = os.path.join(_REPO_ROOT, "ml/datasets/manifest.json")
    calc_sha = compute_file_sha256(manifest_path)
    expected_sha = "9d4cf3f6755976c72bfdb1172bbc03616efeba8e15869ba893665db506dc621d"
    assert calc_sha == expected_sha

    frozen_ds_path = os.path.join(_REPO_ROOT, "ml/experiments/results/v012_model_freeze/dataset_manifest.json")
    with open(frozen_ds_path, "r", encoding="utf-8") as f:
        ds_frozen = json.load(f)

    assert ds_frozen["sha256"] == expected_sha
    assert ds_frozen["total_scenes"] == 40
    assert ds_frozen["splits"]["train"]["scene_count"] == 28
    assert ds_frozen["splits"]["validation"]["scene_count"] == 7
    assert ds_frozen["splits"]["held_out_test"]["scene_count"] == 5


def test_v012_registry_integrity_and_immutability():
    """Verify registry active baseline remains V2 and V09D is experimental candidate."""
    reg = ModelRegistry()
    active_entry = reg.get_model_entry()
    assert active_entry["model_id"] == "unet-dual-pol-sar-v2"

    v09d_entry = reg.get_model_entry("unet-dual-pol-sar-v09d-residual-loss")
    assert v09d_entry["architecture"] == "UNetResidual"
    assert v09d_entry["status"] == "experimental"

    v6_entry = reg.get_model_entry("unet-dual-pol-sar-v6")
    assert v6_entry["status"] == "experimental"


def test_v012_scientific_claims_and_guardrails():
    """Verify claims audit passed and enforces neutral scientific assertions."""
    claims_path = os.path.join(_REPO_ROOT, "ml/experiments/results/v012_model_freeze/claims_audit.json")
    with open(claims_path, "r", encoding="utf-8") as f:
        claims_data = json.load(f)

    assert claims_data["audit_status"] == "PASSED"
    assert "NONE_ACTIVE" in claims_data["audit_findings"]["production_readiness_claims"]
    assert "PRESERVED" in claims_data["audit_findings"]["vessel_attribution_legal_boundary"]


def test_v012_release_manifest_schema():
    """Verify release manifest schema and metadata consistency."""
    release_path = os.path.join(_REPO_ROOT, "ml/model_registry/frozen_release_manifest.json")
    with open(release_path, "r", encoding="utf-8") as f:
        rel = json.load(f)

    assert rel["release_id"] == "OG-SAR-ML-RESEARCH-RELEASE-V0.12"
    assert rel["release_status"] == "FROZEN_RESEARCH_RELEASE"
    assert rel["active_baseline_model_id"] == "unet-dual-pol-sar-v2"
    assert rel["research_candidate_model_id"] == "unet-dual-pol-sar-v09d-residual-loss"
    assert "NOT_PRODUCTION_READY" in rel["scientific_classification"]
    assert rel["immutable_lock"] is True
