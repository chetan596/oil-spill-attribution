"""
SAR Dataset Inspector & Ingestion Orchestrator — Phase 3C
===========================================================

This script inspects `data/raw/satellite/` for real SAR data,
validates any available manifest and rasters, and prints a
structured diagnostic report.

IMPORTANT:
  - This script does NOT automatically download any dataset.
  - If no official SIH dataset is present, it prints clear manual instructions.
  - It also validates synthetic test data if present.

Usage:
  python scripts/download-dataset.py
  python scripts/download-dataset.py --manifest data/raw/satellite/dataset_manifest.json
  python scripts/download-dataset.py --synthetic   (inspect synthetic test data only)
"""

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REAL_SAR_DIR = os.path.join("data", "raw", "satellite")
SYNTHETIC_DIR = os.path.join("data", "samples", "synthetic")
REAL_MANIFEST_NAME = "dataset_manifest.json"
REAL_MANIFEST_PATH = os.path.join(REAL_SAR_DIR, REAL_MANIFEST_NAME)
SYNTH_MANIFEST_PATH = os.path.join(SYNTHETIC_DIR, REAL_MANIFEST_NAME)

SAR_EXTENSIONS = {".tif", ".tiff", ".nc", ".safe"}
MASK_EXTENSIONS = {".png", ".tif", ".tiff", ".npy"}


# ---------------------------------------------------------------------------
# Helper: scan directory for data files
# ---------------------------------------------------------------------------

def _scan_for_files(directory: str, extensions: set) -> List[str]:
    found = []
    if not os.path.isdir(directory):
        return found
    for root, _, files in os.walk(directory):
        for fname in files:
            if os.path.splitext(fname)[1].lower() in extensions:
                found.append(os.path.join(root, fname))
    return found


def _print_section(title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ---------------------------------------------------------------------------
# Validators (import if available in environment)
# ---------------------------------------------------------------------------

def _try_import_validators():
    try:
        # Add services/ml-python to sys.path if needed
        ml_service_path = os.path.join("services", "ml-python")
        if ml_service_path not in sys.path:
            sys.path.insert(0, ml_service_path)
        from app.data.validators.manifest_validator import validate_manifest, print_report  # noqa: F401,PLC0415
        from app.data.validators.raster_validator import validate_dataset_directory  # noqa: F401,PLC0415
        return validate_manifest, print_report, validate_dataset_directory
    except ImportError as exc:
        print(f"  [WARN] Could not import validators: {exc}")
        print("         Run from the repository root after installing dependencies.")
        return None, None, None


# ---------------------------------------------------------------------------
# Main inspection routine
# ---------------------------------------------------------------------------

def inspect_real_dataset(manifest_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Inspect data/raw/satellite/ for real SAR data.

    Returns a dict describing what was found.
    """
    _print_section("REAL DATASET INSPECTION")

    tif_files = _scan_for_files(REAL_SAR_DIR, SAR_EXTENSIONS)
    mask_files = _scan_for_files(REAL_SAR_DIR, MASK_EXTENSIONS)

    print(f"  Directory      : {os.path.abspath(REAL_SAR_DIR)}")
    print(f"  SAR files found: {len(tif_files)}")
    print(f"  Mask files     : {len(mask_files)}")

    if not tif_files:
        print("""
  [INFO] NO REAL SAR DATA FOUND

  Official SIH dataset not present. No external dataset was downloaded.

  To ingest the SIH26143 dataset when available:
    1. Place raw Sentinel-1 GeoTIFF files in:
         data/raw/satellite/train/
         data/raw/satellite/val/
         data/raw/satellite/test/
    2. Place ground-truth mask PNGs alongside images.
    3. Create a dataset_manifest.json in data/raw/satellite/ using
       the schema in docs/phase-3a-data-requirements.md
    4. Re-run this script to validate.

  File format expected:
    Images : GeoTIFF (.tif), SAFE products (.SAFE), or NetCDF (.nc)
    Masks  : 8-bit PNG or GeoTIFF matching image dimensions
    CRS    : EPSG:4326 (WGS84) or projected UTM

  DO NOT use this script to download Kaggle, KREST, M4D, or Zenodo
  datasets. Only the official SIH26143 benchmark dataset should be
  placed in data/raw/satellite/.
""")
        return {"real_data_found": False, "tif_count": 0, "mask_count": 0}

    print(f"\n  [OK] Found {len(tif_files)} SAR file(s):")
    for f in tif_files[:10]:
        print(f"     {f}")
    if len(tif_files) > 10:
        print(f"     ... and {len(tif_files) - 10} more")

    result: Dict[str, Any] = {
        "real_data_found": True,
        "tif_count": len(tif_files),
        "mask_count": len(mask_files),
    }

    # Try to validate manifest
    active_manifest = manifest_path or REAL_MANIFEST_PATH
    validate_manifest, print_report, validate_dataset_directory = _try_import_validators()

    if os.path.isfile(active_manifest):
        print(f"\n  Manifest found: {active_manifest}")
        if validate_manifest:
            rpt = validate_manifest(active_manifest)
            print_report(rpt)
            result["manifest_valid"] = rpt["is_valid"]

            if validate_dataset_directory and rpt["is_valid"]:
                print("\n  Running raster validation ...")
                validate_dataset_directory(active_manifest, verbose=True)
    else:
        print(f"\n  [WARN] No manifest at: {active_manifest}")
        print("      Create a dataset_manifest.json per docs/phase-3a-data-requirements.md")

    return result


def inspect_synthetic_dataset() -> Dict[str, Any]:
    """Inspect data/samples/synthetic/ for synthetic test data."""
    _print_section("SYNTHETIC TEST DATA INSPECTION")

    if not os.path.isdir(SYNTHETIC_DIR):
        print(f"  [WARN] Synthetic test directory not found: {SYNTHETIC_DIR}")
        print("      Run: python scripts/generate_synthetic_sar.py")
        return {"synthetic_found": False}

    tif_files = _scan_for_files(SYNTHETIC_DIR, SAR_EXTENSIONS)
    mask_files = _scan_for_files(SYNTHETIC_DIR, MASK_EXTENSIONS - {".tif", ".tiff"})
    print(f"  Directory      : {os.path.abspath(SYNTHETIC_DIR)}")
    print(f"  SAR files found: {len(tif_files)}")
    print(f"  Mask files     : {len(mask_files)}")

    if not tif_files:
        print("\n  [WARN] No synthetic data found.")
        print("      Run: python scripts/generate_synthetic_sar.py")
        return {"synthetic_found": False}

    result: Dict[str, Any] = {"synthetic_found": True, "tif_count": len(tif_files)}

    validate_manifest, print_report, validate_dataset_directory = _try_import_validators()

    if os.path.isfile(SYNTH_MANIFEST_PATH):
        print(f"\n  Manifest: {SYNTH_MANIFEST_PATH}")
        if validate_manifest:
            rpt = validate_manifest(SYNTH_MANIFEST_PATH)
            print_report(rpt)
            result["manifest_valid"] = rpt["is_valid"]
            if validate_dataset_directory and rpt["is_valid"]:
                validate_dataset_directory(SYNTH_MANIFEST_PATH, verbose=True)
    else:
        print("\n  [WARN] Synthetic manifest not found.")
        print("      Run: python scripts/generate_synthetic_sar.py")
        result["manifest_valid"] = False

    return result


def print_final_summary(real: Dict[str, Any], synthetic: Dict[str, Any]) -> None:
    _print_section("SUMMARY")
    print(f"  Official SIH dataset : {'FOUND' if real.get('real_data_found') else 'NOT FOUND'}")
    print(f"  Real data locally    : {'YES' if real.get('real_data_found') else 'NO'}")
    print(f"  Synthetic test data  : {'FOUND' if synthetic.get('synthetic_found') else 'NOT FOUND'}")
    print(f"  Real ML training     : NOT STARTED")
    print(f"  Real model weights   : NOT AVAILABLE")
    print()

    if not real.get("real_data_found"):
        print("  -> To proceed to Phase 3D (training), you must first")
        print("     provide the official SIH26143 Sentinel-1 SAR dataset")
        print("     in data/raw/satellite/")
    else:
        mf_ok = real.get("manifest_valid", False)
        if mf_ok:
            print("  [OK] Real dataset is present and manifest is valid.")
            print("       Run generate_splits.py then train the U-Net.")
        else:
            print("  [WARN] Real dataset present but manifest validation failed.")
            print("       Fix errors above before training.")
    print()


def main(argv: Optional[List[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        description="Inspect and validate the SAR dataset for SIH26143."
    )
    parser.add_argument(
        "--manifest",
        default=None,
        help="Explicit path to a dataset_manifest.json (real data).",
    )
    parser.add_argument(
        "--synthetic", action="store_true",
        help="Inspect synthetic test data only.",
    )
    parser.add_argument(
        "--skip-real", action="store_true",
        help="Skip real dataset inspection.",
    )
    args = parser.parse_args(argv)

    print("\n" + "=" * 60)
    print("SAR DATASET INSPECTOR — Phase 3C")
    print("=" * 60)
    print("This script does NOT download any data automatically.")
    print("=" * 60)

    real: Dict[str, Any] = {"real_data_found": False}
    synthetic: Dict[str, Any] = {"synthetic_found": False}

    if not args.synthetic and not args.skip_real:
        real = inspect_real_dataset(args.manifest)

    synthetic = inspect_synthetic_dataset()
    print_final_summary(real, synthetic)


if __name__ == "__main__":
    main()
