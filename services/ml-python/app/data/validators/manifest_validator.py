"""
Dataset Manifest Validator — Phase 3C
======================================

Validates a dataset_manifest.json file against the required schema and
verifies that all referenced files actually exist on disk.

Usage:
    from app.data.validators.manifest_validator import validate_manifest
    report = validate_manifest("data/samples/synthetic/dataset_manifest.json")
"""

import json
import os
from typing import Any, Dict, List, Tuple

# ---------------------------------------------------------------------------
# Status codes
# ---------------------------------------------------------------------------
PASS = "PASS"
WARN = "WARN"
FAIL = "FAIL"


class ManifestValidationError(Exception):
    """Raised when the manifest cannot be parsed at all."""
    pass


def _check(
    results: List[Dict[str, Any]],
    field: str,
    condition: bool,
    level: str,
    message: str,
    scene_id: str = "GLOBAL",
) -> None:
    results.append({
        "scene_id": scene_id,
        "field": field,
        "status": PASS if condition else level,
        "message": message if not condition else "OK",
    })


# ---------------------------------------------------------------------------
# Top-level manifest structure checks
# ---------------------------------------------------------------------------
REQUIRED_TOP_LEVEL_FIELDS = ["dataset_id", "source", "total_scenes", "scenes"]
REQUIRED_SCENE_FIELDS = [
    "scene_id", "source", "image_path", "mask_path",
    "polarization", "width", "height",
]
VALID_POLARIZATIONS = {"VV", "VH", "dual", "VV+VH", "VVVH"}
VALID_SPLITS = {None, "train", "val", "test"}


def validate_manifest(manifest_path: str) -> Dict[str, Any]:
    """
    Validate a dataset manifest JSON file.

    Args:
        manifest_path: Absolute or relative path to dataset_manifest.json.

    Returns:
        dict with keys:
            summary:    {"total": int, "passed": int, "warned": int, "failed": int}
            results:    List of per-check result dicts
            is_valid:   bool (no FAIL-level issues)
            scenes_ok:  List of scene_ids that passed all checks
            scenes_bad: List of scene_ids with FAIL-level issues
    """
    results: List[Dict[str, Any]] = []

    # ── 1. File existence ────────────────────────────────────────────────────
    if not os.path.exists(manifest_path):
        return _make_summary(results, [{
            "scene_id": "GLOBAL",
            "field": "manifest_path",
            "status": FAIL,
            "message": f"Manifest file not found: {manifest_path}",
        }])

    # ── 2. JSON parse ────────────────────────────────────────────────────────
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest: Dict[str, Any] = json.load(f)
    except json.JSONDecodeError as exc:
        return _make_summary(results, [{
            "scene_id": "GLOBAL",
            "field": "json_parse",
            "status": FAIL,
            "message": f"Manifest JSON parse error: {exc}",
        }])

    # ── 3. Top-level required fields ─────────────────────────────────────────
    for field in REQUIRED_TOP_LEVEL_FIELDS:
        _check(results, field, field in manifest, FAIL,
               f"Required top-level field '{field}' is missing.")

    if "scenes" not in manifest or not isinstance(manifest["scenes"], list):
        results.append({
            "scene_id": "GLOBAL", "field": "scenes",
            "status": FAIL, "message": "'scenes' must be a list."
        })
        return _make_summary(results)

    scenes: List[Dict[str, Any]] = manifest["scenes"]

    # ── 4. total_scenes consistency ──────────────────────────────────────────
    declared = manifest.get("total_scenes", -1)
    actual = len(scenes)
    _check(results, "total_scenes", declared == actual, WARN,
           f"total_scenes={declared} but {actual} scenes found in 'scenes' list.")

    # ── 5. Warn on synthetic data ────────────────────────────────────────────
    if manifest.get("source") == "synthetic_test":
        results.append({
            "scene_id": "GLOBAL", "field": "source",
            "status": WARN,
            "message": "Dataset source is 'synthetic_test'. "
                       "Do NOT use for model accuracy evaluation."
        })

    # ── 6. Duplicate scene IDs ───────────────────────────────────────────────
    seen_ids: set = set()
    for scene in scenes:
        sid = scene.get("scene_id", "<missing>")
        _check(results, "scene_id_unique", sid not in seen_ids, FAIL,
               f"Duplicate scene_id '{sid}' detected.", scene_id=sid)
        seen_ids.add(sid)

    # ── 7. Per-scene validation ───────────────────────────────────────────────
    for scene in scenes:
        sid = scene.get("scene_id", "<unknown>")

        # Required fields present
        for field in REQUIRED_SCENE_FIELDS:
            _check(results, field, field in scene and scene[field] is not None,
                   FAIL, f"Required scene field '{field}' is missing or null.", scene_id=sid)

        manifest_dir = os.path.dirname(os.path.abspath(manifest_path))

        # image_path exists on disk
        img_path = scene.get("image_path", "")
        img_exists = bool(img_path) and (
            os.path.isfile(img_path) or
            os.path.isfile(os.path.join(manifest_dir, img_path)) or
            os.path.isfile(os.path.join(manifest_dir, os.path.basename(img_path)))
        )
        _check(results, "image_path_exists", img_exists, FAIL,
               f"Image file not found on disk: '{img_path}'", scene_id=sid)

        # mask_path exists on disk
        mask_path = scene.get("mask_path", "")
        mask_exists = bool(mask_path) and (
            os.path.isfile(mask_path) or
            os.path.isfile(os.path.join(manifest_dir, mask_path)) or
            os.path.isfile(os.path.join(manifest_dir, os.path.basename(mask_path)))
        )
        _check(results, "mask_path_exists", mask_exists, FAIL,
               f"Mask file not found on disk: '{mask_path}'", scene_id=sid)

        # polarization
        pol = scene.get("polarization", "")
        _check(results, "polarization", str(pol).upper().replace("+", "") in {
            "VV", "VH", "DUAL", "VVVH"
        }, WARN, f"Unknown polarization '{pol}'. Expected VV, VH, or dual.", scene_id=sid)

        # Dimensions positive
        width = scene.get("width", 0)
        height = scene.get("height", 0)
        _check(results, "width_positive", isinstance(width, int) and width > 0,
               FAIL, f"width must be a positive integer, got {width!r}", scene_id=sid)
        _check(results, "height_positive", isinstance(height, int) and height > 0,
               FAIL, f"height must be a positive integer, got {height!r}", scene_id=sid)

        # CRS
        crs = scene.get("crs")
        _check(results, "crs_present", bool(crs), WARN,
               "CRS is null or missing. Geospatial projection unknown.", scene_id=sid)

        # Transform (affine coefficients)
        transform = scene.get("transform")
        _check(results, "transform_present",
               isinstance(transform, list) and len(transform) in (6, 9),
               WARN, f"transform must be a list of 6 or 9 affine coefficients, got {transform!r}",
               scene_id=sid)

        # Split value
        split = scene.get("split")
        _check(results, "split_valid", split in VALID_SPLITS, WARN,
               f"split='{split}' is not one of {sorted(str(s) for s in VALID_SPLITS)}",
               scene_id=sid)

    return _make_summary(results)


def _make_summary(
    results: List[Dict[str, Any]],
    extra: List[Dict[str, Any]] = None
) -> Dict[str, Any]:
    all_results = results + (extra or [])
    statuses = [r["status"] for r in all_results]
    failed_scenes = {
        r["scene_id"] for r in all_results if r["status"] == FAIL and r["scene_id"] != "GLOBAL"
    }
    ok_scenes = {
        r["scene_id"] for r in all_results if r["scene_id"] != "GLOBAL"
    } - failed_scenes

    return {
        "summary": {
            "total_checks": len(all_results),
            "passed": statuses.count(PASS),
            "warned": statuses.count(WARN),
            "failed": statuses.count(FAIL),
        },
        "results": all_results,
        "is_valid": FAIL not in statuses,
        "scenes_ok": sorted(ok_scenes),
        "scenes_bad": sorted(failed_scenes),
    }


def print_report(report: Dict[str, Any]) -> None:
    """Pretty-print a validation report to stdout."""
    s = report["summary"]
    print(f"\n{'='*60}")
    print("MANIFEST VALIDATION REPORT")
    print(f"{'='*60}")
    print(f"  Total checks : {s['total_checks']}")
    print(f"  Passed       : {s['passed']}")
    print(f"  Warnings     : {s['warned']}")
    print(f"  Failed       : {s['failed']}")
    print(f"  Overall      : {'PASS' if report['is_valid'] else 'FAIL'}")
    print(f"{'='*60}")

    for r in report["results"]:
        if r["status"] != PASS:
            icon = "[WARN]" if r["status"] == WARN else "[FAIL]"
            print(f"  {icon} [{r['scene_id']}] {r['field']}: {r['message']}")

    if report["scenes_bad"]:
        print(f"\n  [FAIL] Failing scenes: {report['scenes_bad']}")
    else:
        print(f"\n  [OK] All scenes passed: {len(report['scenes_ok'])}")
    print()


if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else "data/samples/synthetic/dataset_manifest.json"
    rpt = validate_manifest(path)
    print_report(rpt)
    sys.exit(0 if rpt["is_valid"] else 1)
