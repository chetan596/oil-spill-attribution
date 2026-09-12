"""
Raster & Mask Validator — Phase 3C
====================================

Validates individual SAR GeoTIFF rasters and their corresponding
binary or multi-class ground-truth mask files.

Checks performed:
  - File exists and is readable by rasterio
  - Band count, dtype
  - CRS presence
  - Affine transform presence
  - Bounds sanity (lon/lat ranges for EPSG:4326 data)
  - NaN / Inf / zero-fill ratio
  - Mask file existence and dimensional alignment with image
  - Mask class values within expected range

Returns structured PASS / WARN / FAIL per-scene reports.

Usage:
    from app.data.validators.raster_validator import validate_raster_scene
    report = validate_raster_scene(
        image_path="data/samples/synthetic/synth_512_001_VV.tif",
        mask_path="data/samples/synthetic/synth_512_001_mask.png",
    )
"""

import os
from typing import Any, Dict, List, Optional

import numpy as np

try:
    import rasterio
    from rasterio.crs import CRS
except ImportError:
    raise ImportError("rasterio is required. Install with: pip install rasterio>=1.3.9")

PASS = "PASS"
WARN = "WARN"
FAIL = "FAIL"

# Thresholds
MAX_NAN_RATIO = 0.20      # >20% NaN/Inf → WARN
MAX_ZERO_FILL_RATIO = 0.95  # >95% zeros → WARN (likely empty/nodata scene)
MIN_WIDTH = 32
MIN_HEIGHT = 32


def _record(
    results: List[Dict[str, Any]],
    check_name: str,
    condition: bool,
    level: str,
    fail_msg: str,
    pass_msg: str = "OK",
) -> None:
    results.append({
        "check": check_name,
        "status": PASS if condition else level,
        "message": pass_msg if condition else fail_msg,
    })


def validate_raster_scene(
    image_path: str,
    mask_path: Optional[str] = None,
    expected_polarization: str = "VV",
    max_classes: int = 10,
) -> Dict[str, Any]:
    """
    Validate a SAR GeoTIFF scene and its ground-truth mask.

    Args:
        image_path:            Path to the GeoTIFF raster.
        mask_path:             Path to the mask file (PNG or .npy). If None, mask checks are skipped.
        expected_polarization: "VV" (1 band) or "dual"/"VV+VH" (2 bands). Used for band count check.
        max_classes:           Maximum allowed integer class value in the mask.

    Returns:
        dict with keys:
            scene_id: str
            image_path: str
            mask_path: str or None
            results: List of check dicts [{check, status, message}]
            summary: {total, passed, warned, failed}
            is_valid: bool
            image_metadata: dict (if raster is readable)
    """
    results: List[Dict[str, Any]] = []
    image_metadata: Dict[str, Any] = {}

    scene_id = os.path.splitext(os.path.basename(image_path))[0]

    # ── IMAGE CHECKS ──────────────────────────────────────────────────────────

    # 1. File exists
    img_exists = os.path.isfile(image_path)
    _record(results, "image_exists", img_exists, FAIL,
            f"Image file not found: '{image_path}'")
    if not img_exists:
        return _build_output(scene_id, image_path, mask_path, results, image_metadata)

    # 2. Readable by rasterio
    try:
        with rasterio.open(image_path) as src:
            width: int = src.width
            height: int = src.height
            band_count: int = src.count
            dtype: str = str(src.dtypes[0])
            crs: Optional[CRS] = src.crs
            transform = src.transform
            bounds = src.bounds
            nodata = src.nodata
            res = src.res

            # Read band 1 for statistical analysis
            band_data: np.ndarray = src.read(1).astype(np.float64)

        _record(results, "image_readable", True, FAIL, "Rasterio could not open file.")

        image_metadata = {
            "width": width,
            "height": height,
            "band_count": band_count,
            "dtype": dtype,
            "crs": crs.to_string() if crs else None,
            "is_geographic": crs.is_geographic if crs else None,
            "transform": list(transform) if transform else None,
            "bounds": {
                "left": bounds.left, "bottom": bounds.bottom,
                "right": bounds.right, "top": bounds.top,
            },
            "resolution": list(res),
            "nodata": nodata,
        }

    except Exception as exc:
        _record(results, "image_readable", False, FAIL, f"Rasterio error: {exc}")
        return _build_output(scene_id, image_path, mask_path, results, image_metadata)

    # 3. Minimum dimensions
    _record(results, "image_min_width", width >= MIN_WIDTH, FAIL,
            f"Image width {width}px is below minimum {MIN_WIDTH}px.")
    _record(results, "image_min_height", height >= MIN_HEIGHT, FAIL,
            f"Image height {height}px is below minimum {MIN_HEIGHT}px.")

    # 4. Band count vs polarization
    pol_upper = expected_polarization.upper().replace("+", "").replace(" ", "")
    if pol_upper in ("DUAL", "VVVH"):
        expected_bands = 2
    else:
        expected_bands = 1
    _record(results, "band_count", band_count >= expected_bands, WARN,
            f"Expected ≥{expected_bands} band(s) for polarization '{expected_polarization}', "
            f"but found {band_count}.")

    # 5. Data type sanity
    acceptable_dtypes = {"float32", "float64", "uint16", "int16", "uint8"}
    _record(results, "dtype_acceptable", dtype in acceptable_dtypes, WARN,
            f"Dtype '{dtype}' is unusual. Expected one of {acceptable_dtypes}.")

    # 6. CRS present
    _record(results, "crs_present", crs is not None, WARN,
            "No CRS defined in raster. Geospatial operations will be unreliable.")

    # 7. Affine transform present (not identity-only)
    transform_is_not_identity = (transform is not None and transform != rasterio.transform.IDENTITY)
    _record(results, "affine_transform_nonidentity", transform_is_not_identity, WARN,
            "Affine transform appears to be identity (no spatial reference). "
            "This usually means the raster was not georeferenced.")

    # 8. Bounds sanity for EPSG:4326 data
    if crs is not None and crs.is_geographic:
        lon_ok = -180.0 <= bounds.left < bounds.right <= 180.0
        lat_ok = -90.0 <= bounds.bottom < bounds.top <= 90.0
        _record(results, "bounds_lon_range", lon_ok, WARN,
                f"Longitude bounds [{bounds.left:.4f}, {bounds.right:.4f}] outside [-180, 180].")
        _record(results, "bounds_lat_range", lat_ok, WARN,
                f"Latitude bounds [{bounds.bottom:.4f}, {bounds.top:.4f}] outside [-90, 90].")

    # 9. NaN / Inf ratio
    nan_count = int(np.sum(~np.isfinite(band_data)))
    total_pixels = int(band_data.size)
    nan_ratio = nan_count / total_pixels if total_pixels > 0 else 0.0
    _record(results, "nan_inf_ratio", nan_ratio <= MAX_NAN_RATIO, WARN,
            f"NaN/Inf ratio is {nan_ratio:.1%} (>{MAX_NAN_RATIO:.0%}). "
            "High fill indicates nodata or corrupt acquisition.")

    # 10. Zero fill ratio (likely nodata or empty scene)
    finite_data = band_data[np.isfinite(band_data)]
    zero_ratio = float(np.mean(finite_data == 0)) if len(finite_data) > 0 else 1.0
    _record(results, "zero_fill_ratio", zero_ratio <= MAX_ZERO_FILL_RATIO, WARN,
            f"Zero-fill ratio is {zero_ratio:.1%} (>{MAX_ZERO_FILL_RATIO:.0%}). "
            "Image may be predominantly empty/nodata.")

    # ── MASK CHECKS ────────────────────────────────────────────────────────────

    if mask_path is None:
        results.append({
            "check": "mask_check",
            "status": WARN,
            "message": "No mask_path provided. Mask validation skipped.",
        })
        return _build_output(scene_id, image_path, mask_path, results, image_metadata)

    # 11. Mask file exists
    mask_exists = os.path.isfile(mask_path)
    _record(results, "mask_exists", mask_exists, FAIL,
            f"Mask file not found: '{mask_path}'")
    if not mask_exists:
        return _build_output(scene_id, image_path, mask_path, results, image_metadata)

    # 12. Load mask
    try:
        ext = os.path.splitext(mask_path)[1].lower()
        if ext == ".npy":
            mask_arr: np.ndarray = np.load(mask_path)
        else:
            # Try PIL first, then rasterio
            try:
                from PIL import Image as PILImage  # noqa: PLC0415
                mask_arr = np.array(PILImage.open(mask_path))
            except ImportError:
                with rasterio.open(mask_path) as msrc:
                    mask_arr = msrc.read(1)

        _record(results, "mask_readable", True, FAIL, "Could not read mask file.")
    except Exception as exc:
        _record(results, "mask_readable", False, FAIL, f"Mask read error: {exc}")
        return _build_output(scene_id, image_path, mask_path, results, image_metadata)

    # 13. Mask 2D
    _record(results, "mask_2d", mask_arr.ndim == 2, FAIL,
            f"Mask must be 2D [H, W], but got shape {mask_arr.shape}.")

    if mask_arr.ndim == 2:
        mask_h, mask_w = mask_arr.shape

        # 14. Image/mask dimensional alignment
        dims_match = (mask_h == height and mask_w == width)
        _record(results, "mask_image_alignment", dims_match, FAIL,
                f"Mask dimensions ({mask_w}×{mask_h}) do not match "
                f"image dimensions ({width}×{height}).")

        # 15. Class values
        unique_classes = sorted(int(v) for v in np.unique(mask_arr))
        all_valid = all(0 <= c <= max_classes for c in unique_classes)
        _record(results, "mask_class_values", all_valid, WARN,
                f"Mask contains class values {unique_classes} outside [0, {max_classes}].")

        image_metadata["mask_unique_classes"] = unique_classes
        image_metadata["mask_shape"] = [mask_h, mask_w]

    return _build_output(scene_id, image_path, mask_path, results, image_metadata)


def _build_output(
    scene_id: str,
    image_path: str,
    mask_path: Optional[str],
    results: List[Dict[str, Any]],
    image_metadata: Dict[str, Any],
) -> Dict[str, Any]:
    statuses = [r["status"] for r in results]
    return {
        "scene_id": scene_id,
        "image_path": image_path,
        "mask_path": mask_path,
        "results": results,
        "summary": {
            "total_checks": len(results),
            "passed": statuses.count(PASS),
            "warned": statuses.count(WARN),
            "failed": statuses.count(FAIL),
        },
        "is_valid": FAIL not in statuses,
        "image_metadata": image_metadata,
    }


def validate_dataset_directory(
    manifest_path: str,
    verbose: bool = True,
) -> List[Dict[str, Any]]:
    """
    Validate every scene referenced in a dataset_manifest.json.

    Args:
        manifest_path: Path to dataset_manifest.json.
        verbose:       Print per-scene results.

    Returns:
        List of per-scene validation report dicts.
    """
    import json  # noqa: PLC0415

    if not os.path.isfile(manifest_path):
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    scenes = manifest.get("scenes", [])
    manifest_dir = os.path.dirname(os.path.abspath(manifest_path))
    reports = []

    print(f"\nValidating {len(scenes)} scene(s) from: {manifest_path}\n")
    for scene in scenes:
        img_path = scene.get("image_path", "")
        mask_path = scene.get("mask_path")

        if img_path and not os.path.isfile(img_path):
            if os.path.isfile(os.path.join(manifest_dir, img_path)):
                img_path = os.path.join(manifest_dir, img_path)
            elif os.path.isfile(os.path.join(manifest_dir, os.path.basename(img_path))):
                img_path = os.path.join(manifest_dir, os.path.basename(img_path))

        if mask_path and not os.path.isfile(mask_path):
            if os.path.isfile(os.path.join(manifest_dir, mask_path)):
                mask_path = os.path.join(manifest_dir, mask_path)
            elif os.path.isfile(os.path.join(manifest_dir, os.path.basename(mask_path))):
                mask_path = os.path.join(manifest_dir, os.path.basename(mask_path))

        report = validate_raster_scene(
            image_path=img_path,
            mask_path=mask_path,
            expected_polarization=scene.get("polarization", "VV"),
        )
        reports.append(report)

        if verbose:
            sid = report["scene_id"]
            s = report["summary"]
            status_str = "[PASS]" if report["is_valid"] else "[FAIL]"
            print(f"  {status_str}  {sid}  "
                  f"(pass={s['passed']} warn={s['warned']} fail={s['failed']})")
            for r in report["results"]:
                if r["status"] != PASS:
                    icon = "  [WARN]" if r["status"] == WARN else "  [FAIL]"
                    print(f"       {icon} {r['check']}: {r['message']}")

    passed = sum(1 for r in reports if r["is_valid"])
    print(f"\n  Summary: {passed}/{len(reports)} scenes passed raster validation.\n")
    return reports


if __name__ == "__main__":
    import sys  # noqa: PLC0415
    manifest = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "data/samples/synthetic/dataset_manifest.json"
    )
    validate_dataset_directory(manifest, verbose=True)
