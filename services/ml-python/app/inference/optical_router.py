"""
Deterministic Domain-Specific Optical Model Router (Phase 12).
Routes optical imagery to the validated domain model:
  1. Sentinel-2 Multi-Spectral (6 channels: B4, B3, B2, B8, B11, B12) -> mados-resnet34-rgbnir-swir-v1
  2. Drone / Aerial RGB (3 channels: R, G, B) -> kerf-resnet34-focaldice-v1
  3. RGB-Only Satellite Fallback (3 channels: B4, B3, B2) -> mados-resnet34-rgb-v1

Enforces:
  - Non-filename routing hierarchy (trusted metadata -> band metadata -> channel structure -> user selection)
  - Fail-closed cryptographic integrity verification
  - Exact model-specific preprocessing contracts (band order, SWIR resampling, normalization)
  - Full auditable decision lineage
"""

import os
import time
import math
import hashlib
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, Union
from dataclasses import dataclass

logger = logging.getLogger("optical_router")

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
import scipy.ndimage

try:
    import rasterio
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

from app.preprocessing.geospatial_bridge import mask_to_geospatial_geojson

from app.models.optical_model_registry import (
    OpticalInputDescriptor,
    SourceType,
    OpticalModelSpec,
    optical_registry,
    MODEL_A_SENTINEL2_MS,
    MODEL_B_DRONE_RGB,
    MODEL_C_SATELLITE_RGB,
    ModelVerificationError,
    AmbiguousModalityError,
    UnsupportedInputError,
    ModelInputMismatchError,
    validate_model_compatibility,
    get_compatible_models,
    compute_file_sha256,
)
from app.preprocessing.optical_preprocessor import (
    letterbox_image,
    reverse_letterbox_mask,
    LetterboxMetadata,
)

import sys
_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)


@dataclass
class RoutingDecision:
    """Auditable routing outcome."""
    model_spec: OpticalModelSpec
    routing_reason: str
    source_type: SourceType
    source_type_origin: str
    bands_used: List[str]
    preprocessing_version: str
    sensor: Optional[str]
    metadata_trusted: bool


class OpticalRouter:
    """
    Deterministic domain-specific model router.
    Evaluates input descriptors and routes to the appropriate verified optical model.
    """

    @staticmethod
    def infer_descriptor_from_file(
        image_path: str,
        user_selected_type: Optional[str] = None,
        band_paths: Optional[Dict[str, str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> OpticalInputDescriptor:
        """
        Inspect container, channels, raster metadata, and optional sidecars
        without relying solely on filename extensions.
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Input file not found at: {image_path}")

        meta = metadata or {}
        band_paths_dict = dict(band_paths or {})

        width = 0
        height = 0
        channels = 3
        dtype_str = "uint8"
        crs_str = None
        transform_tuple = None
        detected_sensor = meta.get("sensor")
        detected_platform = meta.get("platform")
        spatial_res = meta.get("spatial_resolution_m")
        bands_list = list(meta.get("bands", []))

        # 1. Multi-band dictionary input (e.g. Sentinel-2 crop folders with B4, B3, B2, B8, B11, B12)
        if band_paths_dict:
            available_bands = [b.upper() for b in band_paths_dict.keys()]
            if all(b in available_bands for b in ["B4", "B3", "B2", "B8", "B11", "B12"]):
                # Inspect B4 for dimensions
                ref_p = band_paths_dict.get("B4") or band_paths_dict.get("b4")
                full_ref = os.path.join(_repo_root, ref_p) if not os.path.isabs(ref_p) else ref_p
                if HAS_RASTERIO and os.path.exists(full_ref):
                    with rasterio.open(full_ref) as src:
                        width, height = src.width, src.height
                        dtype_str = str(src.dtypes[0])
                        crs_str = src.crs.to_string() if src.crs else None
                return OpticalInputDescriptor(
                    source_type=SourceType.SENTINEL_2,
                    sensor=detected_sensor or "MSI",
                    platform=detected_platform or "Sentinel-2",
                    bands=["B4", "B3", "B2", "B8", "B11", "B12"],
                    channel_count=6,
                    spatial_resolution_m=spatial_res or 10.0,
                    crs=crs_str,
                    width=width or 240,
                    height=height or 240,
                    dtype=dtype_str,
                    band_paths=band_paths_dict,
                    user_selected_type=user_selected_type,
                    metadata_trusted=True,
                    source_type_origin="USER_SELECTED" if user_selected_type else "TRUSTED_METADATA",
                )

        # 2. Inspect single file container (TIFF / GeoTIFF / PNG / JPEG)
        is_tiff = False
        is_geotiff = False
        is_rgb_raster = False
        try:
            with open(image_path, "rb") as f:
                header = f.read(16)
                if header.startswith(b"II*\x00") or header.startswith(b"MM\x00*"):
                    is_tiff = True
                elif header.startswith(b"\x89PNG\r\n\x1a\n") or header.startswith(b"\xff\xd8\xff"):
                    is_rgb_raster = True
        except Exception:
            pass

        if HAS_RASTERIO and is_tiff:
            try:
                with rasterio.open(image_path) as src:
                    width = src.width
                    height = src.height
                    channels = src.count
                    dtype_str = str(src.dtypes[0])
                    crs_str = src.crs.to_string() if src.crs else None
                    if src.transform:
                        transform_tuple = tuple(src.transform)[:6]
                    if src.res and src.res[0] > 0:
                        spatial_res = float(src.res[0])
                    if crs_str and crs_str != "NOT_AVAILABLE" and transform_tuple:
                        is_geotiff = True
            except Exception:
                is_tiff = False

        if width == 0 or height == 0:
            try:
                with Image.open(image_path) as img:
                    width, height = img.size
                    channels = len(img.getbands()) if hasattr(img, "getbands") else 3
                    dtype_str = "uint8"
                    if not is_tiff and img.format in ("PNG", "JPEG", "JPG"):
                        is_rgb_raster = True
            except Exception as e:
                raise UnsupportedInputError(f"Cannot decode optical image: {str(e)}")

        # Container Format Classification (Section 3)
        if is_geotiff:
            input_format = "GEOTIFF_RASTER"
        elif is_tiff:
            input_format = "TIFF_RASTER"
        elif is_rgb_raster:
            input_format = "RGB_RASTER"
        else:
            ext_lower = os.path.splitext(image_path)[1].lower()
            if ext_lower in (".tif", ".tiff"):
                input_format = "GEOTIFF_RASTER" if (crs_str and transform_tuple) else "TIFF_RASTER"
            elif ext_lower in (".jpg", ".jpeg", ".png"):
                input_format = "RGB_RASTER"
            else:
                input_format = "UNSUPPORTED"

        # Raster Band Structure Subclassification (Section 4)
        if channels == 1:
            band_structure = "GRAYSCALE_OR_MASK"
            color_interpretation = "GRAYSCALE"
        elif channels == 2:
            band_structure = "DUAL_CHANNEL_RASTER"
            color_interpretation = "DUAL_CHANNEL"
        elif channels == 6:
            band_structure = "SENTINEL2_B4_B3_B2_B8_B11_B12"
            color_interpretation = "MULTISPECTRAL"
        elif channels == 3:
            band_structure = "RGB"
            color_interpretation = "RGB"
        else:
            band_structure = "OTHER"
            color_interpretation = "UNKNOWN"

        # 3. 2-channel TIFF / Raster (e.g. SAR VV/VH or dual-channel data)
        if channels == 2:
            is_sar = False
            pols = ["Channel_1", "Channel_2"]
            pol_status = "NOT_ESTABLISHED"
            sensor_name = detected_sensor or "Dual-Channel Raster"
            origin = "TWO_CHANNEL_UNCLASSIFIED"

            user_clean = (user_selected_type or "").upper()
            if user_clean in ("SENTINEL1_DUAL_POL", "SAR_DUAL_POL", "SENTINEL-1", "SENTINEL_1"):
                is_sar = True
                pols = ["VV", "VH"]
                pol_status = "ESTABLISHED"
                sensor_name = "Sentinel-1 SAR"
                origin = "USER_SELECTED"
            else:
                try:
                    from app.preprocessing.tiff_preview import inspect_tiff_metadata
                    tiff_m = inspect_tiff_metadata(image_path, source_type=user_selected_type)
                    if tiff_m.get("modality") == "SAR_DUAL_POL" and tiff_m.get("polarizationStatus") == "ESTABLISHED":
                        is_sar = True
                        pols = tiff_m.get("polarizations", ["VV", "VH"])
                        pol_status = "ESTABLISHED"
                        sensor_name = "Sentinel-1 SAR"
                        origin = "TRUSTED_METADATA"
                except Exception:
                    pass

            return OpticalInputDescriptor(
                source_type=SourceType.UNKNOWN,
                sensor=sensor_name,
                platform=detected_platform or ("Sentinel-1" if is_sar else None),
                bands=pols,
                channel_count=2,
                spatial_resolution_m=spatial_res,
                crs=crs_str,
                transform=transform_tuple,
                width=width,
                height=height,
                dtype=dtype_str,
                band_paths=band_paths_dict,
                user_selected_type=user_selected_type,
                metadata_trusted=is_sar,
                source_type_origin=origin,
                input_format=input_format,
                band_structure="SAR_VV_VH" if is_sar else "DUAL_CHANNEL_RASTER",
                color_interpretation="SAR_DUAL_POL" if is_sar else "DUAL_CHANNEL",
                modality="SAR_DUAL_POL" if is_sar else "TWO_CHANNEL_UNCLASSIFIED",
                polarizations=pols,
                polarization_status=pol_status,
            )

        # 4. Guard: If Sentinel-2 requested for 3-channel RGB image without multispectral bands
        user_sel_clean = (user_selected_type or "").upper()
        if user_sel_clean in ("SENTINEL_2", "SENTINEL2", "S2"):
            if channels <= 3 and not (band_paths_dict and len(band_paths_dict) >= 6):
                raise AmbiguousModalityError(
                    "Selected Sentinel-2 requires multispectral bands. Uploaded file contains RGB only."
                )


        # 5. Determine SourceType and Origin from metadata and user selection
        source_type = SourceType.UNKNOWN
        metadata_trusted = False
        source_type_origin = "UNKNOWN"

        # Check explicit user selection first
        if user_sel_clean in ("SENTINEL_2", "SENTINEL2", "S2"):
            source_type = SourceType.SENTINEL_2
            metadata_trusted = True
            source_type_origin = "USER_SELECTED"
        elif user_sel_clean in ("DRONE", "UAV", "AERIAL_RGB", "DRONE_RGB"):
            source_type = SourceType.DRONE
            metadata_trusted = True
            source_type_origin = "USER_SELECTED"
        elif user_sel_clean in ("RGB_SATELLITE", "SATELLITE_RGB", "OPTICAL_RGB", "SATELLITE"):
            source_type = SourceType.RGB_SATELLITE
            metadata_trusted = True
            source_type_origin = "USER_SELECTED"

        # Check explicit metadata if not user-selected
        if source_type == SourceType.UNKNOWN:
            meta_type = (meta.get("source_type") or "").upper()
            if meta_type in ("SENTINEL_2", "SENTINEL2", "S2"):
                source_type = SourceType.SENTINEL_2
                metadata_trusted = True
                source_type_origin = "TRUSTED_METADATA"
            elif meta_type in ("DRONE", "UAV"):
                source_type = SourceType.DRONE
                metadata_trusted = True
                source_type_origin = "TRUSTED_METADATA"
            elif meta_type in ("AERIAL", "AERIAL_RGB", "AIRCRAFT"):
                source_type = SourceType.AERIAL_RGB
                metadata_trusted = True
                source_type_origin = "TRUSTED_METADATA"
            elif meta_type in ("RGB_SATELLITE", "SATELLITE_RGB"):
                source_type = SourceType.RGB_SATELLITE
                metadata_trusted = True
                source_type_origin = "TRUSTED_METADATA"

        # Heuristic evaluation if still unknown
        if source_type == SourceType.UNKNOWN:
            if channels == 6:
                source_type = SourceType.SENTINEL_2
                bands_list = ["B4", "B3", "B2", "B8", "B11", "B12"]
                source_type_origin = "INFERRED_METADATA"
            elif detected_sensor in ("MSI", "Sentinel-2 MSI"):
                source_type = SourceType.SENTINEL_2
                metadata_trusted = True
                source_type_origin = "TRUSTED_METADATA"
            elif spatial_res is not None and spatial_res <= 0.5:
                # Sub-meter GSD strongly indicates drone/aerial platform
                source_type = SourceType.DRONE
                source_type_origin = "INFERRED_METADATA"
            elif spatial_res is not None and spatial_res >= 5.0 and channels == 3:
                # >=5m GSD RGB indicates satellite platform
                source_type = SourceType.RGB_SATELLITE
                source_type_origin = "INFERRED_METADATA"

        # Determine genuine physical bands without fabricating RGB
        if bands_list:
            actual_bands = bands_list
        elif channels == 1:
            actual_bands = ["Gray"]
        elif channels == 2:
            actual_bands = ["Channel_1", "Channel_2"]
        elif channels == 6:
            actual_bands = ["B4", "B3", "B2", "B8", "B11", "B12"]
        elif channels == 3:
            actual_bands = ["R", "G", "B"]
        elif channels == 4:
            actual_bands = ["R", "G", "B", "A"]
        else:
            actual_bands = [f"Band_{i+1}" for i in range(channels)]

        return OpticalInputDescriptor(
            source_type=source_type,
            sensor=detected_sensor,
            platform=detected_platform,
            bands=actual_bands,
            channel_count=channels,
            spatial_resolution_m=spatial_res,
            crs=crs_str,
            transform=transform_tuple,
            width=width,
            height=height,
            dtype=dtype_str,
            band_paths=band_paths_dict,
            user_selected_type=user_selected_type,
            metadata_trusted=metadata_trusted,
            source_type_origin=source_type_origin,
            input_format=input_format,
            band_structure=band_structure,
            color_interpretation=color_interpretation,
        )

    infer_descriptor = infer_descriptor_from_file
    inspect_image = infer_descriptor_from_file

    def route(
        self,
        descriptor: OpticalInputDescriptor,
        requested_model_id: Optional[str] = None,
    ) -> RoutingDecision:
        """
        Deterministic routing hierarchy:
          1. Validated Sentinel-2 multispectral (6 required bands) -> mados-resnet34-rgbnir-swir-v1
          2. Sentinel-2 / Satellite RGB fallback -> mados-resnet34-rgb-v1
          3. Drone / Aerial high-resolution RGB -> kerf-resnet34-focaldice-v1
          4. Ambiguous / Unknown -> Fail safely with AmbiguousModalityError
        """
        # Section 16: If specific model requested, validate strictly against input contract FIRST
        if requested_model_id:
            if (descriptor.user_selected_type or "").upper() == "UNKNOWN" or descriptor.source_type == SourceType.UNKNOWN:
                raise AmbiguousModalityError(
                    f"[ROUTER-FAIL-SAFE] Cannot deterministically determine optical domain for input!\n"
                    f"  Detected Source Type: '{descriptor.source_type.value}'\n"
                    f"  Channels: {descriptor.channel_count}, Bands: {descriptor.bands}\n"
                    f"  Sensor: '{descriptor.sensor}', Platform: '{descriptor.platform}'\n"
                    f"  Resolution: {descriptor.spatial_resolution_m}m\n"
                    f"  Please specify trusted metadata or user acquisition type (SENTINEL_2, DRONE, AERIAL_RGB, or RGB_SATELLITE)."
                )
            spec = validate_model_compatibility(requested_model_id, descriptor)
            reason = f"Requested verified model '{spec.model_id}' validated against input contract"
            return RoutingDecision(
                model_spec=spec,
                routing_reason=reason,
                source_type=descriptor.source_type,
                source_type_origin=descriptor.source_type_origin,
                bands_used=list(spec.input_bands),
                preprocessing_version=spec.preprocessing_version,
                sensor=descriptor.sensor or spec.domain,
                metadata_trusted=descriptor.metadata_trusted,
            )

        # Guard: Reject 1-Channel Grayscale TIFF / Raster immediately with authoritative error
        if descriptor.channel_count == 1:
            raise UnsupportedInputError(
                "UNSUPPORTED INPUT: This TIFF contains 1 grayscale channel. The current optical RGB production models require a genuine 3-channel RGB image. AI inference is not executed."
            )

        # Guard: Reject 2-Channel TIFF / Raster immediately with authoritative error
        if descriptor.channel_count == 2 or descriptor.modality in ("SAR_DUAL_POL", "TWO_CHANNEL_UNCLASSIFIED"):
            raise UnsupportedInputError(
                "UNSUPPORTED INPUT: This TIFF contains 2 channels. RGB inference requires a genuine 3-channel RGB image. The original TIFF has NOT been modified."
            )

        # Guard: Reject 3-Channel RGB TIFF if no genuine TIFF RGB model is registered
        if descriptor.channel_count == 3 and descriptor.input_format in ("TIFF_RASTER", "GEOTIFF_RASTER"):
            raise UnsupportedInputError(
                "UNSUPPORTED INPUT: 3-channel RGB TIFF detected, but no genuine TIFF RGB production model is registered. Inference is unsupported for RGB TIFF. Visual preview remains available."
            )



        # Rule 1: Sentinel-2 Multi-Spectral with 6 bands
        has_6_bands = (
            descriptor.channel_count == 6
            or (descriptor.band_paths and all(b in [k.upper() for k in descriptor.band_paths.keys()] for b in ["B4", "B3", "B2", "B8", "B11", "B12"]))
            or (descriptor.source_type == SourceType.SENTINEL_2 and set(b.upper() for b in descriptor.bands) >= {"B4", "B3", "B2", "B8", "B11", "B12"})
        )

        if descriptor.source_type == SourceType.SENTINEL_2:
            if has_6_bands:
                reason = (
                    "User selected Sentinel-2 multispectral imagery with all 6 required diagnostic bands"
                    if descriptor.source_type_origin == "USER_SELECTED"
                    else "Validated Sentinel-2 multispectral metadata with all 6 diagnostic bands (B4, B3, B2, B8, B11, B12)"
                )
                return RoutingDecision(
                    model_spec=MODEL_A_SENTINEL2_MS,
                    routing_reason=reason,
                    source_type=SourceType.SENTINEL_2,
                    source_type_origin=descriptor.source_type_origin,
                    bands_used=["B4", "B3", "B2", "B8", "B11", "B12"],
                    preprocessing_version=MODEL_A_SENTINEL2_MS.preprocessing_version,
                    sensor=descriptor.sensor or "Sentinel-2 MSI",
                    metadata_trusted=descriptor.metadata_trusted,
                )
            else:
                # If explicit Sentinel-2 selected without 6 bands, fail safely
                raise AmbiguousModalityError(
                    "Selected Sentinel-2 requires multispectral bands. Uploaded file contains RGB only."
                )

        # Rule 2: Satellite RGB
        is_satellite_rgb = descriptor.source_type == SourceType.RGB_SATELLITE

        if is_satellite_rgb:
            reason = (
                "User selected Satellite RGB for RGB upload"
                if descriptor.source_type_origin == "USER_SELECTED"
                else "Validated RGB satellite imagery without multispectral SWIR bands"
            )
            return RoutingDecision(
                model_spec=MODEL_C_SATELLITE_RGB,
                routing_reason=reason,
                source_type=SourceType.RGB_SATELLITE,
                source_type_origin=descriptor.source_type_origin,
                bands_used=["B4", "B3", "B2"],
                preprocessing_version=MODEL_C_SATELLITE_RGB.preprocessing_version,
                sensor=descriptor.sensor or "Satellite RGB",
                metadata_trusted=descriptor.metadata_trusted,
            )

        # Rule 3: Drone / Aerial High-Resolution RGB
        is_drone_aerial = (
            descriptor.source_type in (SourceType.DRONE, SourceType.AERIAL_RGB)
            and descriptor.channel_count in (3, 4) # 3-channel or 4-channel with alpha
        )

        if is_drone_aerial:
            reason = (
                "User selected Drone/Aerial RGB for RGB upload"
                if descriptor.source_type_origin == "USER_SELECTED"
                else "Validated drone/aerial high-resolution optical RGB photography"
            )
            return RoutingDecision(
                model_spec=MODEL_B_DRONE_RGB,
                routing_reason=reason,
                source_type=descriptor.source_type,
                source_type_origin=descriptor.source_type_origin,
                bands_used=["R", "G", "B"],
                preprocessing_version=MODEL_B_DRONE_RGB.preprocessing_version,
                sensor=descriptor.sensor or "Optical Aerial Camera",
                metadata_trusted=descriptor.metadata_trusted,
            )

        # Rule 4: Ambiguous or Unknown Modality -> Fail Safely
        raise AmbiguousModalityError(
            f"[ROUTER-FAIL-SAFE] Cannot deterministically determine optical domain for input!\n"
            f"  Detected Source Type: '{descriptor.source_type.value}'\n"
            f"  Channels: {descriptor.channel_count}, Bands: {descriptor.bands}\n"
            f"  Sensor: '{descriptor.sensor}', Platform: '{descriptor.platform}'\n"
            f"  Resolution: {descriptor.spatial_resolution_m}m\n"
            f"  Please specify trusted metadata or user acquisition type (SENTINEL_2, DRONE, AERIAL_RGB, or RGB_SATELLITE)."
        )


# =============================================================================
# OPERATIONAL INFERENCE ENGINE
# =============================================================================

class OperationalOpticalEngine:
    """
    Production optical inference pipeline for Ocean Guard AI.
    Executes model selection via OpticalRouter, applies exact model preprocessing,
    generates visual artifacts, and produces auditable responses.
    """

    def __init__(self, device: Optional[torch.device] = None):
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.router = OpticalRouter()
        self.registry = optical_registry

    def _read_band_file(self, path: str, target_shape=(240, 240)) -> np.ndarray:
        full_p = os.path.join(_repo_root, path) if not os.path.isabs(path) else path
        if HAS_RASTERIO and full_p.lower().endswith((".tif", ".tiff")):
            with rasterio.open(full_p) as src:
                arr = src.read(1).astype(np.float32)
        else:
            with Image.open(full_p) as img:
                arr = np.array(img).astype(np.float32)

        arr = np.nan_to_num(arr, nan=0.0, posinf=0.25, neginf=0.0)

        # Resample SWIR from (120, 120) to (240, 240) using continuous bilinear interpolation
        if arr.shape != target_shape:
            pil_img = Image.fromarray(arr)
            resampled = pil_img.resize((target_shape[1], target_shape[0]), Image.Resampling.BILINEAR)
            arr = np.array(resampled, dtype=np.float32)
        return arr

    def preprocess_input(
        self,
        descriptor: OpticalInputDescriptor,
        decision: RoutingDecision,
        image_path: Optional[str] = None,
    ) -> Tuple[torch.Tensor, Image.Image, Tuple[int, int], LetterboxMetadata]:
        """
        Execute model-specific preprocessing contract.
        Returns:
          - input_tensor: Normalized (1, C, 512, 512) tensor on device
          - rgb_preview_pil: PIL RGB image for frontend artifact generation
          - orig_dims: (orig_width, orig_height)
          - letterbox_meta: LetterboxMetadata for exact reverse coordinate mapping
        """
        spec = decision.model_spec
        target_size = spec.target_size  # (512, 512)

        # CASE 1: Sentinel-2 Multi-Spectral (6-band: B4, B3, B2, B8, B11, B12)
        if spec.model_id == MODEL_A_SENTINEL2_MS.model_id:
            bp = descriptor.band_paths
            # Read all 6 bands
            b4 = self._read_band_file(bp.get("B4") or bp.get("b4") or image_path)
            b3 = self._read_band_file(bp.get("B3") or bp.get("b3") or image_path)
            b2 = self._read_band_file(bp.get("B2") or bp.get("b2") or image_path)
            b8 = self._read_band_file(bp.get("B8") or bp.get("b8") or image_path)
            b11 = self._read_band_file(bp.get("B11") or bp.get("b11") or image_path)
            b12 = self._read_band_file(bp.get("B12") or bp.get("b12") or image_path)

            orig_h, orig_w = b4.shape
            orig_dims = (orig_w, orig_h)

            stacked = np.stack([b4, b3, b2, b8, b11, b12], axis=0)  # (6, 240, 240)
            tensor_stack = torch.from_numpy(stacked).float().unsqueeze(0)  # (1, 6, 240, 240)

            # Resize to target (512, 512) using bilinear continuous interpolation
            resized = F.interpolate(tensor_stack, size=target_size, mode="bilinear", align_corners=False)

            # Per-band training normalization
            means_t = torch.tensor(spec.norm_means, dtype=torch.float32).view(1, -1, 1, 1)
            stds_t = torch.tensor(spec.norm_stds, dtype=torch.float32).view(1, -1, 1, 1)
            normed_tensor = (resized - means_t) / (stds_t + 1e-7)

            # Construct RGB visualization preview from (B4, B3, B2)
            rgb_arr = np.stack([b4, b3, b2], axis=-1)  # (240, 240, 3)
            # Robust stretch for display
            rgb_norm = np.clip(rgb_arr / (np.percentile(rgb_arr, 98) + 1e-5), 0, 1) * 255.0
            rgb_preview_pil = Image.fromarray(rgb_norm.astype(np.uint8), mode="RGB")

            letterbox_meta = LetterboxMetadata(
                original_width=orig_w,
                original_height=orig_h,
                resized_width=target_size[0],
                resized_height=target_size[1],
                target_width=target_size[0],
                target_height=target_size[1],
                scale=target_size[0] / max(orig_w, 1),
                pad_left=0,
                pad_right=0,
                pad_top=0,
                pad_bottom=0,
                pad_value=0,
            )
            return normed_tensor.to(self.device), rgb_preview_pil, orig_dims, letterbox_meta

        # CASE 2: RGB Satellite Fallback (3-band: B4, B3, B2)
        elif spec.model_id == MODEL_C_SATELLITE_RGB.model_id:
            if descriptor.band_paths and "B4" in [k.upper() for k in descriptor.band_paths]:
                bp = descriptor.band_paths
                b4 = self._read_band_file(bp.get("B4") or bp.get("b4"))
                b3 = self._read_band_file(bp.get("B3") or bp.get("b3"))
                b2 = self._read_band_file(bp.get("B2") or bp.get("b2"))
                orig_h, orig_w = b4.shape
                orig_dims = (orig_w, orig_h)
                stacked = np.stack([b4, b3, b2], axis=0)
                tensor_stack = torch.from_numpy(stacked).float().unsqueeze(0)
                resized = F.interpolate(tensor_stack, size=target_size, mode="bilinear", align_corners=False)

                means_t = torch.tensor(spec.norm_means, dtype=torch.float32).view(1, -1, 1, 1)
                stds_t = torch.tensor(spec.norm_stds, dtype=torch.float32).view(1, -1, 1, 1)
                normed_tensor = (resized - means_t) / (stds_t + 1e-7)

                rgb_arr = np.stack([b4, b3, b2], axis=-1)
                rgb_norm = np.clip(rgb_arr / (np.percentile(rgb_arr, 98) + 1e-5), 0, 1) * 255.0
                rgb_preview_pil = Image.fromarray(rgb_norm.astype(np.uint8), mode="RGB")

                letterbox_meta = LetterboxMetadata(
                    original_width=orig_w,
                    original_height=orig_h,
                    resized_width=target_size[0],
                    resized_height=target_size[1],
                    target_width=target_size[0],
                    target_height=target_size[1],
                    scale=target_size[0] / max(orig_w, 1),
                    pad_left=0,
                    pad_right=0,
                    pad_top=0,
                    pad_bottom=0,
                    pad_value=0,
                )
                return normed_tensor.to(self.device), rgb_preview_pil, orig_dims, letterbox_meta
            else:
                with Image.open(image_path) as img:
                    orig_w, orig_h = img.size
                    orig_dims = (orig_w, orig_h)
                    pil_rgb = img.convert("RGB")

                padded_img, letterbox_meta = letterbox_image(pil_rgb, target_size=target_size)
                arr = np.array(padded_img).astype(np.float32) / 255.0
                arr_t = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)

                means_t = torch.tensor(spec.norm_means, dtype=torch.float32).view(1, -1, 1, 1)
                stds_t = torch.tensor(spec.norm_stds, dtype=torch.float32).view(1, -1, 1, 1)
                normed_tensor = (arr_t - means_t) / (stds_t + 1e-7)
                return normed_tensor.to(self.device), pil_rgb, orig_dims, letterbox_meta

        # CASE 3: Drone / Aerial RGB (3-band: R, G, B with ImageNet normalization)
        elif spec.model_id == MODEL_B_DRONE_RGB.model_id:
            with Image.open(image_path) as img:
                orig_w, orig_h = img.size
                orig_dims = (orig_w, orig_h)
                pil_rgb = img.convert("RGB")

            padded_img, letterbox_meta = letterbox_image(pil_rgb, target_size=target_size)
            arr = np.array(padded_img).astype(np.float32) / 255.0
            arr_t = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)

            means_t = torch.tensor(spec.norm_means, dtype=torch.float32).view(1, -1, 1, 1)
            stds_t = torch.tensor(spec.norm_stds, dtype=torch.float32).view(1, -1, 1, 1)
            normed_tensor = (arr_t - means_t) / (stds_t + 1e-7)
            return normed_tensor.to(self.device), pil_rgb, orig_dims, letterbox_meta

        raise UnsupportedInputError(f"Unsupported model ID for preprocessing: '{spec.model_id}'")

    def generate_visual_artifacts(
        self,
        pil_image: Image.Image,
        prob_map_full: np.ndarray,
        binary_mask_full: np.ndarray,
        output_dir: str,
        prefix: str = "optical",
    ) -> Dict[str, str]:
        """Generate original image, binary mask PNG, probability heatmap, and composite annotated overlay."""
        os.makedirs(output_dir, exist_ok=True)
        w, h = pil_image.size

        # 1. Original image (or RGB preview)
        orig_path = os.path.join(output_dir, f"{prefix}_original.png")
        pil_image.save(orig_path, format="PNG")

        # 2. Binary mask PNG
        mask_uint8 = (binary_mask_full * 255).astype(np.uint8)
        mask_pil = Image.fromarray(mask_uint8, mode="L")
        mask_path = os.path.join(output_dir, f"{prefix}_mask.png")
        mask_pil.save(mask_path, format="PNG")

        # 3. Probability Heatmap PNG (Continuous Turbo/Viridis-style Colormap)
        # 0.0 -> [15, 23, 42] (navy)
        # 0.25 -> [30, 64, 175] (blue)
        # 0.50 -> [147, 51, 234] (purple threshold)
        # 0.75 -> [239, 68, 68] (red)
        # 1.00 -> [254, 240, 138] (bright yellow)
        p_clipped = np.clip(prob_map_full, 0.0, 1.0)
        heatmap = np.zeros((h, w, 3), dtype=np.uint8)

        # Vectorized piecewise color mapping
        # Segment 0: 0.0 -> 0.25
        m0 = (p_clipped <= 0.25)
        t0 = p_clipped[m0] / 0.25
        heatmap[m0, 0] = np.clip(15 + t0 * (30 - 15), 0, 255).astype(np.uint8)
        heatmap[m0, 1] = np.clip(23 + t0 * (64 - 23), 0, 255).astype(np.uint8)
        heatmap[m0, 2] = np.clip(42 + t0 * (175 - 42), 0, 255).astype(np.uint8)

        # Segment 1: 0.25 -> 0.50
        m1 = (p_clipped > 0.25) & (p_clipped <= 0.50)
        t1 = (p_clipped[m1] - 0.25) / 0.25
        heatmap[m1, 0] = np.clip(30 + t1 * (147 - 30), 0, 255).astype(np.uint8)
        heatmap[m1, 1] = np.clip(64 + t1 * (51 - 64), 0, 255).astype(np.uint8)
        heatmap[m1, 2] = np.clip(175 + t1 * (234 - 175), 0, 255).astype(np.uint8)

        # Segment 2: 0.50 -> 0.75
        m2 = (p_clipped > 0.50) & (p_clipped <= 0.75)
        t2 = (p_clipped[m2] - 0.50) / 0.25
        heatmap[m2, 0] = np.clip(147 + t2 * (239 - 147), 0, 255).astype(np.uint8)
        heatmap[m2, 1] = np.clip(51 + t2 * (68 - 51), 0, 255).astype(np.uint8)
        heatmap[m2, 2] = np.clip(234 + t2 * (68 - 234), 0, 255).astype(np.uint8)

        # Segment 3: 0.75 -> 1.00
        m3 = (p_clipped > 0.75)
        t3 = (p_clipped[m3] - 0.75) / 0.25
        heatmap[m3, 0] = np.clip(239 + t3 * (254 - 239), 0, 255).astype(np.uint8)
        heatmap[m3, 1] = np.clip(68 + t3 * (240 - 68), 0, 255).astype(np.uint8)
        heatmap[m3, 2] = np.clip(68 + t3 * (138 - 68), 0, 255).astype(np.uint8)

        prob_pil = Image.fromarray(heatmap, mode="RGB")
        prob_path = os.path.join(output_dir, f"{prefix}_probability.png")
        prob_pil.save(prob_path, format="PNG")

        # 4. Composite annotated image (#EF4444 overlay + 2px contour)
        img_rgb_arr = np.array(pil_image.convert("RGB")).astype(np.float32)
        annotated_arr = img_rgb_arr.copy()

        oil_mask_bool = (binary_mask_full == 1)
        if np.any(oil_mask_bool):
            overlay_color = np.array([239.0, 68.0, 68.0], dtype=np.float32)  # #EF4444 red/magenta
            alpha = 0.40
            annotated_arr[oil_mask_bool] = (
                annotated_arr[oil_mask_bool] * (1.0 - alpha) + overlay_color * alpha
            )
            dilated = scipy.ndimage.binary_dilation(oil_mask_bool, iterations=2)
            boundary = dilated ^ oil_mask_bool
            annotated_arr[boundary] = overlay_color

        annotated_arr = np.clip(annotated_arr, 0, 255).astype(np.uint8)
        annotated_pil = Image.fromarray(annotated_arr, mode="RGB")
        annotated_path = os.path.join(output_dir, f"{prefix}_annotated.png")
        annotated_pil.save(annotated_path, format="PNG")

        return {
            "original_image": orig_path,
            "mask_image": mask_path,
            "probability_map": prob_path,
            "annotated_image": annotated_path,
        }

    def run_inference(
        self,
        image_path: Optional[str] = None,
        descriptor: Optional[OpticalInputDescriptor] = None,
        user_selected_type: Optional[str] = None,
        band_paths: Optional[Dict[str, str]] = None,
        threshold: Optional[float] = None,
        output_dir: Optional[str] = None,
        prefix: str = "optical",
        requested_model_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute end-to-end operational optical inference:
          1. Infer descriptor from input if not provided.
          2. Route deterministically via OpticalRouter.
          3. Lazily load & cryptographically verify model checkpoint (FAIL-CLOSED).
          4. Execute model-specific preprocessing contract.
          5. Perform deep learning inference & spatial reconstruction.
          6. Compute real image-level morphological & probability statistics.
          7. Generate visual artifacts.
          8. Return auditable response document.
        """
        t_total_start = time.perf_counter()

        # 1. Descriptor inference
        if descriptor is None:
            if image_path is None and not band_paths:
                raise ValueError("Either 'image_path', 'descriptor', or 'band_paths' must be provided.")
            ref_path = image_path or list(band_paths.values())[0]
            descriptor = self.router.infer_descriptor_from_file(
                image_path=ref_path,
                user_selected_type=user_selected_type,
                band_paths=band_paths,
            )

        # 2. Deterministic Routing (with requested model validation if provided)
        t_route_start = time.perf_counter()
        decision = self.router.route(descriptor, requested_model_id=requested_model_id)
        routing_time_ms = (time.perf_counter() - t_route_start) * 1000.0

        # 3. Model Loading & Verification (FAIL-CLOSED)
        t_load_start = time.perf_counter()
        model, spec = self.registry.load_model(decision.model_spec.model_id)
        load_time_ms = (time.perf_counter() - t_load_start) * 1000.0

        # 4. Preprocessing
        t_prep_start = time.perf_counter()
        input_tensor, rgb_preview, orig_dims, letterbox_meta = self.preprocess_input(
            descriptor=descriptor,
            decision=decision,
            image_path=image_path,
        )
        prep_time_ms = (time.perf_counter() - t_prep_start) * 1000.0

        # 5. Model Inference
        orig_w, orig_h = orig_dims
        operating_threshold = threshold if threshold is not None else spec.default_threshold
        ckpt_full_path = spec.resolve_checkpoint_path()

        input_tensor_sha256 = hashlib.sha256(input_tensor.contiguous().cpu().numpy().tobytes()).hexdigest()

        logger.info(
            f"MODEL_EXECUTION_START:\n"
            f"  model_id={spec.model_id}\n"
            f"  checkpoint_path={ckpt_full_path}\n"
            f"  checkpoint_sha256={spec.expected_sha256}\n"
            f"  architecture=ResNet34_UNet\n"
            f"  input_shape={list(input_tensor.shape)}\n"
            f"  input_channels={spec.in_channels}\n"
            f"  device={str(self.device)}\n"
            f"  preprocessing_version={decision.preprocessing_version}\n"
            f"  threshold={operating_threshold}\n"
            f"  prefix={prefix}"
        )

        t_inf_start = time.perf_counter()
        with torch.no_grad():
            logits = model(input_tensor)
            if isinstance(logits, (tuple, list)):
                logits = logits[0]

            if logits.shape[1] > 1:
                # Foreground oil channel (channel 1)
                probs = F.softmax(logits, dim=1)[:, 1:2, :, :]
            else:
                probs = torch.sigmoid(logits) if logits.min() < 0 or logits.max() > 1 else logits

        inf_time_ms = (time.perf_counter() - t_inf_start) * 1000.0

        raw_out_np = logits.contiguous().cpu().numpy()
        raw_output_sha256 = hashlib.sha256(raw_out_np.tobytes()).hexdigest()
        raw_min = float(raw_out_np.min())
        raw_max = float(raw_out_np.max())
        raw_mean = float(raw_out_np.mean())
        raw_std = float(raw_out_np.std())

        probs_np = probs.contiguous().cpu().numpy()
        sig_min = float(probs_np.min())
        sig_max = float(probs_np.max())
        sig_mean = float(probs_np.mean())

        # 6. Postprocessing & Mask Reconstruction
        t_post_start = time.perf_counter()

        logger.info(
            f"MODEL_RUNTIME:\n"
            f"  model_id={spec.model_id}\n"
            f"  model_version={spec.version}\n"
            f"  checkpoint={ckpt_full_path}\n"
            f"  sha256={spec.expected_sha256}\n"
            f"  input_type={decision.source_type.value}\n"
            f"  sensor={decision.sensor}\n"
            f"  source_type={decision.source_type.value}\n"
            f"  source_type_origin={decision.source_type_origin}\n"
            f"  bands_used={decision.bands_used}\n"
            f"  preprocessing_version={decision.preprocessing_version}\n"
            f"  threshold={operating_threshold}\n"
            f"  routing_reason={decision.routing_reason}"
        )

        # Upsample / reverse letterbox back to exact original dimensions
        if (letterbox_meta.pad_left == 0 and letterbox_meta.pad_right == 0 and
            letterbox_meta.pad_top == 0 and letterbox_meta.pad_bottom == 0):
            prob_native = F.interpolate(probs, size=(orig_h, orig_w), mode="bilinear", align_corners=False)[0, 0].cpu().numpy()
        else:
            prob_512 = probs[0, 0].cpu().numpy()
            prob_native = reverse_letterbox_mask(prob_512, letterbox_meta, interpolation="bilinear")

        binary_mask = (prob_native >= operating_threshold).astype(np.uint8)
        binary_mask_sha256 = hashlib.sha256(binary_mask.tobytes()).hexdigest()

        # Morphological and statistical metrics
        fg_pixels = int(np.sum(binary_mask == 1))
        total_pixels = int(orig_w * orig_h)
        fg_fraction = float(fg_pixels / total_pixels) if total_pixels > 0 else 0.0
        oil_detected = bool(fg_pixels >= 10)

        # Probability distribution percentiles
        p_min = float(np.min(prob_native))
        p10 = float(np.percentile(prob_native, 10))
        median = float(np.percentile(prob_native, 50))
        p90 = float(np.percentile(prob_native, 90))
        p_max = float(np.max(prob_native))
        p_mean = float(np.mean(prob_native))

        # Connected component analysis & diagnostics
        labeled_mask, num_features = scipy.ndimage.label(binary_mask)
        components_list = []
        largest_comp_size = 0
        if num_features > 0:
            for i in range(1, num_features + 1):
                comp_mask = (labeled_mask == i)
                comp_area = int(np.sum(comp_mask))
                if comp_area > largest_comp_size:
                    largest_comp_size = comp_area
                ys, xs = np.where(comp_mask)
                bbox = [int(np.min(ys)), int(np.min(xs)), int(np.max(ys)), int(np.max(xs))]
                centroid = [round(float(np.mean(ys)), 2), round(float(np.mean(xs)), 2)]
                comp_mean_prob = float(np.mean(prob_native[comp_mask]))
                comp_max_prob = float(np.max(prob_native[comp_mask]))
                components_list.append({
                    "id": i,
                    "component_id": i,
                    "pixel_area": comp_area,
                    "area_pixels": comp_area,
                    "area_percentage": round(float(comp_area / max(total_pixels, 1)) * 100, 4),
                    "area_fraction": round(float(comp_area / max(total_pixels, 1)), 6),
                    "bbox": bbox,
                    "centroid": centroid,
                    "mean_probability": round(comp_mean_prob, 4),
                    "max_probability": round(comp_max_prob, 4),
                })
            components_list.sort(key=lambda c: c["pixel_area"], reverse=True)

        spill_mean_prob = float(np.mean(prob_native[binary_mask == 1])) if fg_pixels > 0 else 0.0
        post_time_ms = (time.perf_counter() - t_post_start) * 1000.0

        logger.info(
            f"MODEL_EXECUTION_END:\n"
            f"  raw_output_shape={list(logits.shape)}\n"
            f"  raw_output_min={raw_min:.6f}\n"
            f"  raw_output_max={raw_max:.6f}\n"
            f"  raw_output_mean={raw_mean:.6f}\n"
            f"  raw_output_std={raw_std:.6f}\n"
            f"  sigmoid_min={sig_min:.6f}\n"
            f"  sigmoid_max={sig_max:.6f}\n"
            f"  sigmoid_mean={sig_mean:.6f}\n"
            f"  predicted_pixels={fg_pixels}\n"
            f"  predicted_area_percent={fg_fraction * 100:.4f}%\n"
            f"  component_count={int(num_features)}"
        )
        logger.info(
            f"MODEL_FINGERPRINT:\n"
            f"  checkpoint_sha256={spec.expected_sha256}\n"
            f"  input_tensor_sha256={input_tensor_sha256}\n"
            f"  raw_output_sha256={raw_output_sha256}\n"
            f"  binary_mask_sha256={binary_mask_sha256}"
        )

        # 7. Artifact Generation & Geospatial Conversion
        t_art_start = time.perf_counter()
        artifact_paths = {}
        if output_dir:
            artifact_paths = self.generate_visual_artifacts(
                pil_image=rgb_preview,
                prob_map_full=prob_native,
                binary_mask_full=binary_mask,
                output_dir=output_dir,
                prefix=prefix,
            )

        res_list = [descriptor.spatial_resolution_m, descriptor.spatial_resolution_m] if descriptor.spatial_resolution_m else None
        geo_result = mask_to_geospatial_geojson(
            binary_mask=binary_mask,
            affine_transform=list(descriptor.transform) if descriptor.transform else None,
            crs_str=descriptor.crs,
            resolution=res_list,
            prob_map=prob_native,
            threshold=operating_threshold,
        )
        art_time_ms = (time.perf_counter() - t_art_start) * 1000.0
        total_time_ms = (time.perf_counter() - t_total_start) * 1000.0

        # 8. Auditable Result Construction
        return {
            "status": "COMPLETED",
            "model": {
                "modelId": spec.model_id,
                "modelVersion": spec.version,
                "modelName": spec.name,
                "domain": spec.domain,
                "inputType": decision.source_type.value,
                "sourceTypeOrigin": decision.source_type_origin,
                "sensor": decision.sensor,
                "bandsUsed": decision.bands_used,
                "routingReason": decision.routing_reason,
                "checkpointSha256": spec.expected_sha256,
                "preprocessingVersion": decision.preprocessing_version,
                "operatingThreshold": operating_threshold,
                "inferenceTimestamp": datetime.now().isoformat(),
            },
            "output_fingerprint": {
                "checkpoint_sha256": spec.expected_sha256,
                "input_tensor_sha256": input_tensor_sha256,
                "raw_output_sha256": raw_output_sha256,
                "binary_mask_sha256": binary_mask_sha256,
                "raw_output_stats": {
                    "min": round(raw_min, 6),
                    "max": round(raw_max, 6),
                    "mean": round(raw_mean, 6),
                    "std": round(raw_std, 6),
                },
                "probability_stats": {
                    "min": round(sig_min, 6),
                    "max": round(sig_max, 6),
                    "mean": round(sig_mean, 6),
                },
                "probability_distribution": {
                    "min": round(p_min, 6),
                    "p10": round(p10, 6),
                    "median": round(median, 6),
                    "p90": round(p90, 6),
                    "max": round(p_max, 6),
                    "mean": round(p_mean, 6),
                },
                "components": components_list,
            },
            "classification": {
                "label": "OIL_SPILL" if oil_detected else "CLEAN_OCEAN",
                "is_oil_spill": oil_detected,
                "confidence": round(spill_mean_prob if oil_detected else (1.0 - p_mean), 4),
                "probabilities": {
                    "CLEAN_OCEAN": round(1.0 - p_max, 4),
                    "LOOK_ALIKE": 0.0,
                    "OIL_SPILL": round(p_max, 4),
                },
                "probability_label": "MODEL_PROBABILITY",
            },
            "segmentation": {
                "performed": True,
                "mask_available": True,
                "mask_sha256": binary_mask_sha256,
                "oil_detected": oil_detected,
                "foreground_pixels": fg_pixels,
                "foreground_fraction": round(fg_fraction, 6),
                "confidence_threshold": operating_threshold,
                "connected_component_count": int(num_features),
                "largest_component_pixels": int(largest_comp_size),
                "mean_foreground_probability": round(spill_mean_prob, 4),
                "max_image_probability": round(p_max, 4),
                "probability_distribution": {
                    "min": round(p_min, 6),
                    "p10": round(p10, 6),
                    "median": round(median, 6),
                    "p90": round(p90, 6),
                    "max": round(p_max, 6),
                    "mean": round(p_mean, 6),
                },
                "components": components_list,
            },
            "input_metadata": descriptor.to_dict(),
            "model_lineage": {
                "inputFormat": descriptor.input_format,
                "channelCount": descriptor.channel_count,
                "bandStructure": descriptor.band_structure,
                "modelId": spec.model_id,
                "checkpointSha256": spec.expected_sha256,
                "inputContract": {
                    "containerFormats": list(spec.container_formats),
                    "channels": spec.in_channels,
                    "bands": list(spec.input_bands),
                    "inputDtypes": list(spec.input_dtypes),
                },
                "sourceType": decision.source_type.value,
                "threshold": operating_threshold,
            },
            "artifacts": artifact_paths,
            "geospatial": {
                "geolocationStatus": geo_result.get("geospatial", {}).get("geolocationStatus", "NOT_ESTABLISHED"),
                "crs": descriptor.crs or "NOT_AVAILABLE",
                "spatial_resolution_m": descriptor.spatial_resolution_m,
                "geoJson": geo_result,
                "physicalAreaM2": geo_result.get("geospatial", {}).get("physicalAreaM2"),
                "physicalAreaKm2": geo_result.get("geospatial", {}).get("physicalAreaKm2"),
                "detectedFeatureCount": geo_result.get("geospatial", {}).get("detectedFeatureCount", 0),
            },
            "timing_ms": {
                "routing_time_ms": round(routing_time_ms, 2),
                "model_load_time_ms": round(load_time_ms, 2),
                "preprocessing_time_ms": round(prep_time_ms, 2),
                "inference_time_ms": round(inf_time_ms, 2),
                "postprocessing_time_ms": round(post_time_ms, 2),
                "artifact_time_ms": round(art_time_ms, 2),
                "total_time_ms": round(total_time_ms, 2),
            },
            "inference_time_ms": round(total_time_ms, 2),
        }

    def compare_optical_models(
        self,
        image_path: str,
        threshold: Optional[float] = None,
        output_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Developer-only diagnostic tool:
        Execute both Drone RGB (kerf-resnet34-focaldice-v1) and
        Satellite RGB (mados-resnet34-rgb-v1) on the same RGB image.
        """
        t0 = time.perf_counter()
        res_a = self.run_inference(
            image_path=image_path,
            user_selected_type="DRONE",
            threshold=threshold or 0.50,
            output_dir=output_dir,
            prefix="compare_kerf",
        )
        res_b = self.run_inference(
            image_path=image_path,
            user_selected_type="RGB_SATELLITE",
            threshold=threshold or 0.50,
            output_dir=output_dir,
            prefix="compare_mados",
        )
        total_compare_ms = (time.perf_counter() - t0) * 1000.0

        mask_a_sha = res_a["output_fingerprint"]["binary_mask_sha256"]
        mask_b_sha = res_b["output_fingerprint"]["binary_mask_sha256"]
        raw_a_sha = res_a["output_fingerprint"]["raw_output_sha256"]
        raw_b_sha = res_b["output_fingerprint"]["raw_output_sha256"]

        return {
            "status": "COMPLETED",
            "image_path": image_path,
            "threshold_used": threshold or 0.50,
            "model_a_drone": {
                "model_id": res_a["model"]["modelId"],
                "checkpoint_sha256": res_a["model"]["checkpointSha256"],
                "oil_pixels": res_a["segmentation"]["foreground_pixels"],
                "oil_area_percent": round(res_a["segmentation"]["foreground_fraction"] * 100, 2),
                "components": res_a["segmentation"]["connected_component_count"],
                "mask_sha256": mask_a_sha,
                "raw_output_sha256": raw_a_sha,
                "probability_stats": res_a["output_fingerprint"]["probability_distribution"],
                "classification": res_a["classification"],
                "artifacts": res_a["artifacts"],
            },
            "model_b_satellite_rgb": {
                "model_id": res_b["model"]["modelId"],
                "checkpoint_sha256": res_b["model"]["checkpointSha256"],
                "oil_pixels": res_b["segmentation"]["foreground_pixels"],
                "oil_area_percent": round(res_b["segmentation"]["foreground_fraction"] * 100, 2),
                "components": res_b["segmentation"]["connected_component_count"],
                "mask_sha256": mask_b_sha,
                "raw_output_sha256": raw_b_sha,
                "probability_stats": res_b["output_fingerprint"]["probability_distribution"],
                "classification": res_b["classification"],
                "artifacts": res_b["artifacts"],
            },
            "comparison": {
                "masks_identical": bool(mask_a_sha == mask_b_sha),
                "raw_outputs_identical": bool(raw_a_sha == raw_b_sha),
                "pixel_difference": abs(res_a["segmentation"]["foreground_pixels"] - res_b["segmentation"]["foreground_pixels"]),
                "area_percent_difference": round(abs(res_a["segmentation"]["foreground_fraction"] - res_b["segmentation"]["foreground_fraction"]) * 100, 2),
            },
            "diagnostic_note": (
                "Side-by-side diagnostic execution only. Outputs reflect different training priors "
                "(sub-meter UAV vs 10m Sentinel-2). Does not constitute ground-truth validation."
            ),
            "execution_time_ms": round(total_compare_ms, 2),
        }


# Global operational singleton
operational_optical_engine = OperationalOpticalEngine()

