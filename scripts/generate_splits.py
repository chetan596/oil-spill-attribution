"""
Scene-Level Train/Val/Test Split Generator — Phase 3C
======================================================

CRITICAL: Splits are made at the SCENE level, not the tile level.
This prevents the same geographic region from appearing in both
train and test sets (data leakage).

Split strategy:
  1. If the manifest already has 'split' values on every scene → use them as-is.
  2. Otherwise: perform stratified scene-level split, stratifying on 'contains_spill'
     so that spill/clean ratios are preserved across splits.

Outputs:
  - Updated manifest with 'split' field on every scene.
  - ml/datasets/splits/splits.json (scene_id → split mapping).

Usage:
  python scripts/generate_splits.py
  python scripts/generate_splits.py --manifest data/samples/synthetic/dataset_manifest.json
  python scripts/generate_splits.py --train 0.70 --val 0.15 --test 0.15
"""

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple


def _stratified_scene_split(
    scenes: List[Dict[str, Any]],
    train_ratio: float,
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> List[Dict[str, Any]]:
    """
    Assign train/val/test split labels to scenes using stratified sampling
    on the 'contains_spill' boolean field.

    Args:
        scenes:      List of scene metadata dicts from the manifest.
        train_ratio: Fraction of scenes for training.
        val_ratio:   Fraction of scenes for validation.
        test_ratio:  Fraction of scenes for testing.
        seed:        Random seed for reproducibility.

    Returns:
        scenes list with 'split' field set on each entry.

    Raises:
        ValueError: If ratios do not sum to 1.0 (within floating-point tolerance).
    """
    total = train_ratio + val_ratio + test_ratio
    if abs(total - 1.0) > 1e-6:
        raise ValueError(
            f"train + val + test ratios must sum to 1.0, got {total:.4f}."
        )

    import random  # noqa: PLC0415
    rng = random.Random(seed)

    # Stratify on contains_spill
    spill_scenes = [s for s in scenes if s.get("contains_spill", True)]
    clean_scenes = [s for s in scenes if not s.get("contains_spill", False)]

    def assign_split(group: List[Dict[str, Any]]) -> None:
        rng.shuffle(group)
        n = len(group)
        if n >= 3:
            n_val = max(1, round(n * val_ratio)) if val_ratio > 0 else 0
            n_test = max(1, round(n * test_ratio)) if test_ratio > 0 else 0
            n_train = max(1, n - n_val - n_test)
            while n_train + n_val + n_test > n and n_train > 1:
                n_train -= 1
            while n_train + n_val + n_test > n and n_val > 1:
                n_val -= 1
            splits_assigned = ["train"] * n_train + ["val"] * n_val + ["test"] * n_test
        elif n == 2 and val_ratio > 0:
            splits_assigned = ["train", "val"]
        else:
            splits_assigned = ["train"] * n

        while len(splits_assigned) < n:
            splits_assigned.append("train")
        splits_assigned = splits_assigned[:n]
        for scene, split in zip(group, splits_assigned):
            scene["split"] = split

    assign_split(spill_scenes)
    assign_split(clean_scenes)

    return scenes


def _check_existing_splits(scenes: List[Dict[str, Any]]) -> Tuple[bool, Dict[str, int]]:
    """Check if all scenes already have a valid 'split' field."""
    valid_splits = {"train", "val", "test"}
    counts: Dict[str, int] = {"train": 0, "val": 0, "test": 0, "missing": 0}
    for scene in scenes:
        split = scene.get("split")
        if split in valid_splits:
            counts[split] += 1
        else:
            counts["missing"] += 1
    all_have_split = counts["missing"] == 0
    return all_have_split, counts


def _check_split_leakage(scenes: List[Dict[str, Any]]) -> List[str]:
    """
    Check for scene-level data leakage.
    Returns list of warning messages if the same scene_id appears in multiple splits.
    """
    from collections import defaultdict  # noqa: PLC0415
    id_to_splits: Dict[str, set] = defaultdict(set)
    for scene in scenes:
        sid = scene.get("scene_id", "<unknown>")
        split = scene.get("split")
        id_to_splits[sid].add(split)

    warnings = []
    for sid, splits in id_to_splits.items():
        if len(splits) > 1:
            warnings.append(
                f"LEAKAGE: scene_id '{sid}' appears in multiple splits: {sorted(splits)}"
            )
    return warnings


def generate_splits(
    manifest_path: str,
    output_splits_path: str,
    train_ratio: float = 0.70,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Generate or validate train/val/test scene-level splits.

    Args:
        manifest_path:      Path to dataset_manifest.json to read and update.
        output_splits_path: Path to write splits.json.
        train_ratio:        Training fraction.
        val_ratio:          Validation fraction.
        test_ratio:         Test fraction.
        seed:               Random seed.
        force:              If True, regenerate splits even if already present.

    Returns:
        dict with 'splits_path', 'split_counts', 'leakage_warnings', 'method'.
    """
    if not os.path.isfile(manifest_path):
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    scenes: List[Dict[str, Any]] = manifest.get("scenes", [])
    if not scenes:
        raise ValueError("Manifest contains no scenes.")

    # ── Check for existing official splits ──────────────────────────────────
    all_have_split, existing_counts = _check_existing_splits(scenes)

    if all_have_split and not force:
        method = "official_splits_preserved"
        print(f"  [INFO] All {len(scenes)} scenes already have 'split' values.")
        print(f"         train={existing_counts['train']}  "
              f"val={existing_counts['val']}  "
              f"test={existing_counts['test']}")
        print("  [INFO] Preserving existing splits. Use --force to regenerate.")
    else:
        if existing_counts.get("missing", 0) > 0:
            print(f"  [INFO] {existing_counts['missing']}/{len(scenes)} scenes missing 'split'.")
        method = "stratified_scene_level"
        print(f"  [INFO] Generating stratified scene-level splits "
              f"(train={train_ratio:.0%} val={val_ratio:.0%} test={test_ratio:.0%}, seed={seed})...")

        scenes = _stratified_scene_split(scenes, train_ratio, val_ratio, test_ratio, seed)

        # Recount
        _, existing_counts = _check_existing_splits(scenes)
        print(f"  [INFO] Assigned: train={existing_counts['train']}  "
              f"val={existing_counts['val']}  "
              f"test={existing_counts['test']}")

    # ── Leakage check ────────────────────────────────────────────────────────
    leakage_warnings = _check_split_leakage(scenes)
    if leakage_warnings:
        for w in leakage_warnings:
            print(f"  [FAIL] {w}")
    else:
        print("  [OK] No scene-level split leakage detected.")

    # ── Write updated manifest ────────────────────────────────────────────────
    manifest["scenes"] = scenes
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"  [OK] Updated manifest -> {manifest_path}")

    # ── Write splits.json ────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(output_splits_path), exist_ok=True)
    splits_record = {
        "manifest_path": manifest_path,
        "method": method,
        "seed": seed,
        "ratios": {"train": train_ratio, "val": val_ratio, "test": test_ratio},
        "split_counts": existing_counts,
        "leakage_warnings": leakage_warnings,
        "scene_splits": {
            scene["scene_id"]: scene.get("split") for scene in scenes
        },
        "methodology_note": (
            "Splits are scene-level. A single original acquisition (scene_id) "
            "appears in exactly one split. This prevents geographic data leakage "
            "where adjacent tiles from the same scene appear in both train and test sets."
        ),
    }
    with open(output_splits_path, "w", encoding="utf-8") as f:
        json.dump(splits_record, f, indent=2)
    print(f"  [OK] Splits written -> {output_splits_path}")

    return {
        "splits_path": output_splits_path,
        "split_counts": existing_counts,
        "leakage_warnings": leakage_warnings,
        "method": method,
    }


def main(argv: Optional[List[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        description="Generate scene-level train/val/test splits for SAR dataset."
    )
    parser.add_argument(
        "--manifest",
        default="data/samples/synthetic/dataset_manifest.json",
        help="Path to dataset_manifest.json (will be updated in-place).",
    )
    parser.add_argument(
        "--output",
        default="ml/datasets/splits/splits.json",
        help="Path to write the splits.json summary file.",
    )
    parser.add_argument("--train", type=float, default=0.70)
    parser.add_argument("--val", type=float, default=0.15)
    parser.add_argument("--test", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--force", action="store_true",
        help="Regenerate splits even if already present in manifest.",
    )
    args = parser.parse_args(argv)

    print("\n" + "=" * 60)
    print("SCENE-LEVEL SPLIT GENERATOR — Phase 3C")
    print("=" * 60)

    try:
        result = generate_splits(
            manifest_path=args.manifest,
            output_splits_path=args.output,
            train_ratio=args.train,
            val_ratio=args.val,
            test_ratio=args.test,
            seed=args.seed,
            force=args.force,
        )
    except Exception as exc:
        print(f"\n  [FAIL] ERROR: {exc}")
        sys.exit(1)

    print("\n" + "=" * 60)
    print("SPLIT GENERATION COMPLETE")
    print("=" * 60)
    if result["leakage_warnings"]:
        print("  [FAIL] LEAKAGE DETECTED — review warnings above.")
        sys.exit(1)
    else:
        print("  [OK] No leakage detected. Splits are scene-level safe.")
    print()


if __name__ == "__main__":
    main()
