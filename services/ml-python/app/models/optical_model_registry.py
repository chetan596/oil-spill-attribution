"""
Optical Model Registry & Input Descriptors (Phase 12).
Defines immutable model registration, cryptographic SHA-256 validation,
descriptor contracts, and fail-closed model loading for Ocean Guard AI.
"""

import os
import hashlib
from enum import Enum
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field
import numpy as np
import torch
import torch.nn as nn
import sys

_repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)


def compute_file_sha256(filepath: str) -> str:
    """Compute cryptographic SHA-256 digest of a file on disk."""
    if not os.path.exists(filepath):
        return ""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


class SourceType(str, Enum):
    """Supported optical data source types."""
    SENTINEL_2 = "SENTINEL_2"
    DRONE = "DRONE"
    AERIAL_RGB = "AERIAL_RGB"
    RGB_SATELLITE = "RGB_SATELLITE"
    UNKNOWN = "UNKNOWN"


@dataclass
class OpticalInputDescriptor:
    """Normalized descriptor of optical input imagery for deterministic routing."""
    source_type: SourceType = SourceType.UNKNOWN
    sensor: Optional[str] = None
    platform: Optional[str] = None
    bands: List[str] = field(default_factory=list)
    channel_count: int = 3
    spatial_resolution_m: Optional[float] = None
    crs: Optional[str] = None
    transform: Optional[Tuple[float, ...]] = None
    width: int = 0
    height: int = 0
    dtype: str = "uint8"
    acquisition_id: Optional[str] = None
    band_paths: Dict[str, str] = field(default_factory=dict)
    user_selected_type: Optional[str] = None
    metadata_trusted: bool = False
    source_type_origin: str = "UNKNOWN"
    input_format: str = "RGB_RASTER"  # RGB_RASTER, TIFF_RASTER, GEOTIFF_RASTER, UNSUPPORTED
    band_structure: str = "RGB"        # RGB, GRAYSCALE_OR_MASK, SAR_VV_VH, TWO_CHANNEL_UNCLASSIFIED, SENTINEL2_B4_B3_B2_B8_B11_B12, OTHER
    color_interpretation: str = "RGB"  # RGB, GRAYSCALE, DUAL_CHANNEL, MULTISPECTRAL, UNKNOWN
    modality: str = "UNKNOWN"          # SAR_DUAL_POL, TWO_CHANNEL_UNCLASSIFIED, OPTICAL, SENTINEL_2, GRAYSCALE_OR_MASK, UNKNOWN
    polarizations: List[str] = field(default_factory=list)
    polarization_status: str = "NOT_ESTABLISHED"  # ESTABLISHED, NOT_ESTABLISHED

    @property
    def is_single_channel_unsupported(self) -> bool:
        return self.channel_count == 1

    @property
    def is_dual_channel_unsupported(self) -> bool:
        if self.modality == "SAR_DUAL_POL" and self.polarization_status == "ESTABLISHED":
            return False
        return self.channel_count == 2 or self.source_type_origin == "DUAL_CHANNEL_UNSUPPORTED"

    @property
    def is_sar_dual_pol(self) -> bool:
        return self.modality == "SAR_DUAL_POL" and self.polarization_status == "ESTABLISHED"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sourceType": self.source_type.value,
            "sourceTypeOrigin": self.source_type_origin,
            "sensor": self.sensor,
            "platform": self.platform,
            "bands": self.bands,
            "channelCount": self.channel_count,
            "spatialResolution": self.spatial_resolution_m,
            "crs": self.crs,
            "transform": list(self.transform) if self.transform else None,
            "width": self.width,
            "height": self.height,
            "dtype": self.dtype,
            "acquisitionId": self.acquisition_id,
            "userSelectedType": self.user_selected_type,
            "metadataTrusted": self.metadata_trusted,
            "isSingleChannelUnsupported": self.is_single_channel_unsupported,
            "isDualChannelUnsupported": self.is_dual_channel_unsupported,
            "inputFormat": self.input_format,
            "bandStructure": self.band_structure,
            "colorInterpretation": self.color_interpretation,
            "modality": self.modality,
            "polarizations": self.polarizations,
            "polarizationStatus": self.polarization_status,
            "geolocationStatus": "ESTABLISHED" if self.crs and self.crs != "NOT_AVAILABLE" and self.transform else "NOT_ESTABLISHED",
        }


class ModelVerificationError(Exception):
    """Raised when model checkpoint is missing, corrupted, or fails SHA-256 verification (FAIL-CLOSED)."""
    pass


class AmbiguousModalityError(Exception):
    """Raised when optical image modality/source cannot be determined deterministically."""
    pass


class UnsupportedInputError(Exception):
    """Raised when input image format or band combination is unsupported."""
    pass


class ModelInputMismatchError(Exception):
    """Raised when requested model input contract does not match actual input raster structure."""
    pass


@dataclass(frozen=True)
class OpticalModelSpec:
    """Immutable model specification in the registry."""
    model_id: str
    name: str
    version: str
    domain: str
    in_channels: int
    input_bands: List[str]
    checkpoint_rel_path: str
    expected_sha256: str
    target_size: Tuple[int, int]
    preprocessing_version: str
    norm_means: List[float]
    norm_stds: List[float]
    default_threshold: float
    reported_benchmark: Dict[str, Any]
    container_formats: Tuple[str, ...] = ("PNG", "JPEG", "TIFF", "GEOTIFF")
    band_structure: str = "RGB"
    supported_source_types: Tuple[str, ...] = ()
    input_dtypes: Tuple[str, ...] = ("uint8",)
    production: bool = True
    modality: str = "OPTICAL"
    expected_polarizations: Tuple[str, ...] = ()
    task: str = "OIL_SPILL_SEGMENTATION"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.model_id,
            "modelId": self.model_id,
            "name": self.name,
            "version": self.version,
            "domain": self.domain,
            "modality": self.modality,
            "channels": self.in_channels,
            "inputChannels": self.in_channels,
            "inputBands": self.input_bands,
            "expectedPolarizations": list(self.expected_polarizations),
            "containerFormats": list(self.container_formats),
            "bandStructure": self.band_structure,
            "sourceTypes": list(self.supported_source_types),
            "inputDtypes": list(self.input_dtypes),
            "production": self.production,
            "defaultThreshold": self.default_threshold,
            "expectedSha256": self.expected_sha256,
            "reportedBenchmark": self.reported_benchmark,
            "task": self.task,
        }


    def resolve_checkpoint_path(self) -> str:
        candidates = [
            os.path.join(_repo_root, self.checkpoint_rel_path),
            os.path.abspath(self.checkpoint_rel_path),
            os.path.join(os.path.dirname(__file__), "../../../../", self.checkpoint_rel_path),
        ]
        for c in candidates:
            norm_c = os.path.normpath(c)
            if os.path.exists(norm_c) and os.path.isfile(norm_c):
                return norm_c
        raise FileNotFoundError(f"Checkpoint for '{self.model_id}' not found at: {self.checkpoint_rel_path}")

    def verify_integrity(self) -> str:
        ckpt_path = self.resolve_checkpoint_path()
        actual_sha = compute_file_sha256(ckpt_path)
        if actual_sha != self.expected_sha256:
            raise ModelVerificationError(
                f"[FAIL-CLOSED] Cryptographic SHA-256 verification failed for model '{self.model_id}'!\n"
                f"  Expected: {self.expected_sha256}\n"
                f"  Computed: {actual_sha}\n"
                f"  Path: {ckpt_path}"
            )
        return ckpt_path


# =============================================================================
# OPTICAL MODEL REGISTRY DEFINITIONS
# =============================================================================

MODEL_A_SENTINEL2_MS = OpticalModelSpec(
    model_id="mados-resnet34-rgbnir-swir-v1",
    name="MADOS Sentinel-2 Multi-Spectral ResNet-34 U-Net",
    version="1.0.0",
    domain="SENTINEL_2_MULTISPECTRAL",
    in_channels=6,
    input_bands=["B4", "B3", "B2", "B8", "B11", "B12"],
    checkpoint_rel_path="ml/training/runs/mados_rgbnir_swir_resnet34/checkpoints/best_val_iou.pt",
    expected_sha256="856ea016b8f750a40af942ee2e59f5919d2f04fbc510d01d2c772ecbdb3ee983",
    target_size=(512, 512),
    preprocessing_version="sentinel2-ms-v1",
    norm_means=[0.036934, 0.046210, 0.053790, 0.038064, 0.028343, 0.020602],
    norm_stds=[0.035496, 0.034394, 0.032938, 0.057896, 0.042911, 0.029753],
    default_threshold=0.50,
    reported_benchmark={
        "benchmark_dataset": "MADOS Locked Benchmark (361 positive scenes)",
        "iou": 0.4273,
        "f1": 0.5987,
        "precision": 0.6062,
        "recall": 0.5915,
        "positive_sample_recall": 0.8006,
        "clean_ocean_false_alarm_rate": 0.0231,
        "tiny_sheen_iou": 0.3188,
        "note": "Reference benchmark metadata only; not to be used as runtime confidence.",
    },
    container_formats=("TIFF", "GEOTIFF"),
    band_structure="SENTINEL2_B4_B3_B2_B8_B11_B12",
    supported_source_types=("SENTINEL_2",),
    input_dtypes=("uint8", "uint16", "float32"),
    production=True,
)

MODEL_B_DRONE_RGB = OpticalModelSpec(
    model_id="kerf-resnet34-focaldice-v1",
    name="KERF Drone/Aerial RGB ResNet-34 U-Net",
    version="1.0.0",
    domain="DRONE_AERIAL_RGB",
    in_channels=3,
    input_bands=["R", "G", "B"],
    checkpoint_rel_path="ml/training/runs/resnet34_balanced_focaldice_pilot/checkpoints/best_val_iou.pt",
    expected_sha256="d1ae45d3eaf995a221da3d273c177eb13c850b193cd6690a1b6bc47b0baf5264",
    target_size=(512, 512),
    preprocessing_version="kerf-rgb-v1",
    norm_means=[0.485, 0.456, 0.406],
    norm_stds=[0.229, 0.224, 0.225],
    default_threshold=0.50,
    reported_benchmark={
        "benchmark_dataset": "KERF Locked Benchmark (134 scenes)",
        "iou": 0.8268,
        "note": "Reference benchmark metadata only; not to be used as runtime confidence.",
    },
    container_formats=("PNG", "JPEG"),
    band_structure="RGB",
    supported_source_types=("DRONE", "AERIAL_RGB"),
    input_dtypes=("uint8",),
    production=True,
)

MODEL_C_SATELLITE_RGB = OpticalModelSpec(
    model_id="mados-resnet34-rgb-v1",
    name="MADOS Sentinel-2 RGB Satellite Fallback ResNet-34 U-Net",
    version="1.0.0",
    domain="RGB_SATELLITE",
    in_channels=3,
    input_bands=["B4", "B3", "B2"],
    checkpoint_rel_path="ml/training/runs/phase11_rgb_control/checkpoints/best_val_iou.pt",
    expected_sha256="a4c32de7177bc42c2f0298427ce8bef4a2bf8d4a35e25c3450a67eb16f8e099a",
    target_size=(512, 512),
    preprocessing_version="mados-rgb-v1",
    norm_means=[0.036934, 0.046210, 0.053790],
    norm_stds=[0.035496, 0.034394, 0.032938],
    default_threshold=0.50,
    reported_benchmark={
        "benchmark_dataset": "MADOS Locked Benchmark (361 positive scenes)",
        "iou": 0.3554,
        "f1": 0.5245,
        "precision": 0.5651,
        "recall": 0.4893,
        "positive_sample_recall": 0.7313,
        "clean_ocean_false_alarm_rate": 0.0511,
        "tiny_sheen_iou": 0.2843,
        "note": "Reference benchmark metadata only; not to be used as runtime confidence.",
    },
    container_formats=("PNG", "JPEG"),
    band_structure="RGB",
    supported_source_types=("RGB_SATELLITE", "SATELLITE_RGB"),
    input_dtypes=("uint8",),
    production=True,
    modality="OPTICAL",
    expected_polarizations=(),
    task="OIL_SPILL_SEGMENTATION",
)

MODEL_D_SAR_DUAL_POL = OpticalModelSpec(
    model_id="unet-dual-pol-sar-v09d-residual-loss",
    name="Dual-Pol SAR Oil Spill Segmentation",
    version="v0.9d",
    domain="MICROWAVE_SAR",
    in_channels=2,
    input_bands=["VV", "VH"],
    checkpoint_rel_path="ml/model_registry/versions/unet_dual_pol_sar_v09d_residual_loss.pth",
    expected_sha256="ab22ffa2fb1c3be99ff2bb99353db76ed4934bd00210f7bce21df74506ce827d",
    target_size=(512, 512),
    preprocessing_version="sentinel1_sigma0_db_v1",
    norm_means=[-20.0, -30.0],
    norm_stds=[15.0, 15.0],
    default_threshold=0.50,
    reported_benchmark={
        "benchmark_dataset": "OG-SAR-ML-RESEARCH-RELEASE-V0.12 (Held-out benchmark)",
        "heldOutRecall": 0.015054,
        "heldOutIoU": 0.011823,
        "heldOutDice": 0.023370,
        "heldOutPrecision": 0.052205,
        "heldOutOverallFpr": 0.002701,
        "heldOutCleanOceanFpr": 0.000397,
        "validationIoU": 0.152376,
        "validationRecall": 0.363318,
    },
    container_formats=("TIFF", "GEOTIFF"),
    band_structure="SAR_VV_VH",
    supported_source_types=("SAR_DUAL_POL", "SENTINEL1_DUAL_POL", "SENTINEL_1", "REAL_CDSE"),
    input_dtypes=("float32", "uint16", "uint8"),
    production=True,
    modality="SAR_DUAL_POL",
    expected_polarizations=("VV", "VH"),
    task="OIL_SPILL_SEGMENTATION",
)

OPTICAL_REGISTRY: Dict[str, OpticalModelSpec] = {
    MODEL_A_SENTINEL2_MS.model_id: MODEL_A_SENTINEL2_MS,
    MODEL_B_DRONE_RGB.model_id: MODEL_B_DRONE_RGB,
    MODEL_C_SATELLITE_RGB.model_id: MODEL_C_SATELLITE_RGB,
    MODEL_D_SAR_DUAL_POL.model_id: MODEL_D_SAR_DUAL_POL,
}


def get_compatible_models(descriptor: OpticalInputDescriptor) -> List[OpticalModelSpec]:
    """
    Format-first compatibility matrix:
    Inspect container, channel count, and band structure.
    Return only production models whose input contract strictly accommodates the raster.
    """
    # 1. 1-Channel Grayscale or Mask -> NO COMPATIBLE PRODUCTION MODEL (Preview only)
    if descriptor.channel_count == 1:
        return []

    # 2. 2-Channel Dual-Channel:
    # Compatible with Dual-Pol SAR model ONLY if modality is SAR_DUAL_POL and VV+VH established!
    if descriptor.channel_count == 2:
        is_sar_dual_pol = (
            descriptor.modality == "SAR_DUAL_POL"
            or (descriptor.polarization_status == "ESTABLISHED" and set(p.upper() for p in descriptor.polarizations) == {"VV", "VH"})
        )
        if is_sar_dual_pol and descriptor.input_format in ("TIFF_RASTER", "GEOTIFF_RASTER"):
            return [MODEL_D_SAR_DUAL_POL]
        # Unclassified 2-channel raster: no model auto-assigned until source/polarization declared
        return []

    # Format resolution: RGB_RASTER vs TIFF_RASTER vs GEOTIFF_RASTER
    fmt = descriptor.input_format
    if fmt == "UNSUPPORTED":
        return []

    # 3. 6-Band Sentinel-2 Multispectral
    has_6_s2_bands = (
        descriptor.channel_count == 6
        or (descriptor.band_paths and all(b in [k.upper() for k in descriptor.band_paths.keys()] for b in ["B4", "B3", "B2", "B8", "B11", "B12"]))
        or (descriptor.source_type == SourceType.SENTINEL_2 and set(b.upper() for b in descriptor.bands) >= {"B4", "B3", "B2", "B8", "B11", "B12"})
    )
    if has_6_s2_bands:
        # Sentinel-2 model requires TIFF / GEOTIFF container
        if fmt in ("TIFF_RASTER", "GEOTIFF_RASTER") or bool(descriptor.band_paths):
            return [MODEL_A_SENTINEL2_MS]
        return []

    # 4. 3-Channel RGB
    if descriptor.channel_count == 3:
        # Filter models by container format
        compatible_rgb = []
        for spec in (MODEL_B_DRONE_RGB, MODEL_C_SATELLITE_RGB):
            if fmt == "RGB_RASTER" and any(c in spec.container_formats for c in ("PNG", "JPEG")):
                compatible_rgb.append(spec)
            elif fmt in ("TIFF_RASTER", "GEOTIFF_RASTER") and any(c in spec.container_formats for c in ("TIFF", "GEOTIFF")):
                compatible_rgb.append(spec)

        if not compatible_rgb:
            return []

        # If user explicitly requested DRONE vs SATELLITE, order accordingly
        if descriptor.source_type == SourceType.DRONE or (descriptor.user_selected_type or "").upper() in ("DRONE", "UAV", "AERIAL_RGB"):
            return [s for s in [MODEL_B_DRONE_RGB, MODEL_C_SATELLITE_RGB] if s in compatible_rgb]
        elif descriptor.source_type == SourceType.RGB_SATELLITE or (descriptor.user_selected_type or "").upper() in ("RGB_SATELLITE", "SATELLITE_RGB", "SATELLITE"):
            return [s for s in [MODEL_C_SATELLITE_RGB, MODEL_B_DRONE_RGB] if s in compatible_rgb]
        return compatible_rgb

    return []


def validate_model_compatibility(model_id: str, descriptor: OpticalInputDescriptor) -> OpticalModelSpec:
    """
    Strict backend verification guard (Section 16 & Phase 16).
    Verifies that requested model strictly accommodates the actual input descriptor.
    Raises ModelInputMismatchError (HTTP 400) if incompatible.
    """
    if model_id not in OPTICAL_REGISTRY:
        raise ModelInputMismatchError(f"Model '{model_id}' is not a registered model.")

    spec = OPTICAL_REGISTRY[model_id]

    # 1. SAR Dual-Pol Model Validation
    if spec.modality == "SAR_DUAL_POL":
        if descriptor.channel_count != 2:
            raise ModelInputMismatchError(
                f"Selected model '{spec.model_id}' requires 2-channel SAR (VV+VH) input, but uploaded raster contains {descriptor.channel_count} channels."
            )
        is_sar = (
            descriptor.modality == "SAR_DUAL_POL"
            or (descriptor.polarization_status == "ESTABLISHED" and set(p.upper() for p in descriptor.polarizations) == {"VV", "VH"})
        )
        if not is_sar:
            raise ModelInputMismatchError(
                f"Selected model '{spec.model_id}' requires established VV+VH dual-polarization SAR input, but uploaded 2-channel raster has not established VV/VH polarizations."
            )
        if descriptor.input_format not in ("TIFF_RASTER", "GEOTIFF_RASTER"):
            raise ModelInputMismatchError(
                f"Selected model '{spec.model_id}' requires TIFF/GEOTIFF container, but uploaded raster has format '{descriptor.input_format}'."
            )
        return spec

    # 2. Optical Model Validation (Models require optical input, strictly reject SAR / 2-channel)
    if descriptor.channel_count == 1:
        raise ModelInputMismatchError(
            f"Selected model requires {spec.in_channels}-channel input, but uploaded TIFF contains 1 channel."
        )

    if descriptor.channel_count == 2 or descriptor.modality == "SAR_DUAL_POL":
        raise ModelInputMismatchError(
            f"Selected model requires {spec.in_channels}-channel input, but uploaded TIFF contains 2 channels."
        )

    # 3. Check channel count match
    if spec.in_channels != descriptor.channel_count:
        raise ModelInputMismatchError(
            f"Selected model requires {spec.in_channels}-channel input, but uploaded file contains {descriptor.channel_count} channels."
        )

    # 4. Check container format match
    fmt = descriptor.input_format
    if fmt in ("TIFF_RASTER", "GEOTIFF_RASTER"):
        if not any(c in spec.container_formats for c in ("TIFF", "GEOTIFF")):
            raise ModelInputMismatchError(
                f"Selected model '{spec.model_id}' requires standard RGB image (PNG/JPEG), but uploaded raster is a TIFF container."
            )
    elif fmt == "RGB_RASTER":
        if not any(c in spec.container_formats for c in ("PNG", "JPEG")):
            raise ModelInputMismatchError(
                f"Selected model '{spec.model_id}' requires TIFF/multispectral container, but uploaded file is standard RGB image."
            )

    # 5. If 6-channel Sentinel-2 model selected, ensure raster actually has Sentinel-2 bands
    if spec.in_channels == 6:
        has_6_s2_bands = (
            descriptor.channel_count == 6
            or (descriptor.band_paths and all(b in [k.upper() for k in descriptor.band_paths.keys()] for b in ["B4", "B3", "B2", "B8", "B11", "B12"]))
        )
        if not has_6_s2_bands:
            raise ModelInputMismatchError(
                f"Selected model '{spec.name}' requires 6-band Sentinel-2 multispectral input (B4, B3, B2, B8, B11, B12), but input lacks required bands."
            )

    # 6. Check source type compatibility if source type is specified
    if descriptor.source_type != SourceType.UNKNOWN:
        valid_sources = set(spec.supported_source_types)
        if "RGB_SATELLITE" in valid_sources:
            valid_sources.add("SATELLITE_RGB")
        if "SATELLITE_RGB" in valid_sources:
            valid_sources.add("RGB_SATELLITE")
        if "DRONE" in valid_sources:
            valid_sources.add("AERIAL_RGB")
        if "AERIAL_RGB" in valid_sources:
            valid_sources.add("DRONE")
        if descriptor.source_type.value not in valid_sources:
            raise ModelInputMismatchError(
                f"Selected model '{spec.model_id}' is not compatible with source type '{descriptor.source_type.value}'. Supported sources: {list(spec.supported_source_types)}"
            )

    return spec



# =============================================================================
# MODEL REGISTRY MANAGER (Lazy Loading & Caching)
# =============================================================================

class OpticalModelRegistry:
    """
    Thread-safe registry manager that lazily loads, verifies (FAIL-CLOSED),
    and caches optical deep learning models.
    """

    def __init__(self, device: Optional[torch.device] = None):
        self.device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._loaded_models: Dict[str, nn.Module] = {}

    def get_spec(self, model_id: str) -> OpticalModelSpec:
        if model_id not in OPTICAL_REGISTRY:
            raise KeyError(f"Model ID '{model_id}' not found in optical registry. Available: {list(OPTICAL_REGISTRY.keys())}")
        return OPTICAL_REGISTRY[model_id]

    def list_models(self) -> List[Dict[str, Any]]:
        return [
            {
                "model_id": spec.model_id,
                "name": spec.name,
                "version": spec.version,
                "domain": spec.domain,
                "in_channels": spec.in_channels,
                "input_bands": spec.input_bands,
                "expected_sha256": spec.expected_sha256,
                "preprocessing_version": spec.preprocessing_version,
                "reported_benchmark": spec.reported_benchmark,
            }
            for spec in OPTICAL_REGISTRY.values()
        ]

    def load_model(self, model_id: str, force_reload: bool = False) -> Tuple[nn.Module, OpticalModelSpec]:
        """
        Lazily load model checkpoint with mandatory cryptographic verification.
        FAIL-CLOSED if SHA-256 does not match.
        """
        spec = self.get_spec(model_id)
        cache_key = f"{model_id}:{spec.expected_sha256}:{spec.in_channels}"
        if not force_reload and cache_key in self._loaded_models:
            return self._loaded_models[cache_key], spec

        # 1. Cryptographic integrity verification (FAIL-CLOSED)
        ckpt_path = spec.verify_integrity()

        if spec.model_id == "unet-dual-pol-sar-v09d-residual-loss":
            from app.inference.sar_dual_pol_inference_engine import load_verified_sar_model
            model = load_verified_sar_model(self.device)
            self._loaded_models[cache_key] = model
            return model, spec

        # 2. Instantiate architecture
        # Import ResNet-34 UNet dynamically
        from ml.benchmark.adapter import _ResNet34UNetModel


        class _DynamicResNet34UNet(_ResNet34UNetModel):
            def __init__(self, in_channels: int = 3, num_classes: int = 4):
                super().__init__(num_classes=num_classes)
                self.in_channels = in_channels
                if in_channels != 3:
                    old_conv = self.encoder.conv1
                    self.encoder.conv1 = nn.Conv2d(
                        in_channels,
                        old_conv.out_channels,
                        kernel_size=old_conv.kernel_size,
                        stride=old_conv.stride,
                        padding=old_conv.padding,
                        bias=old_conv.bias is not None,
                    )

        model = _DynamicResNet34UNet(in_channels=spec.in_channels, num_classes=4)

        # 3. Load checkpoint state dict
        ckpt_data = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        sd = ckpt_data["model_state_dict"] if isinstance(ckpt_data, dict) and "model_state_dict" in ckpt_data else ckpt_data
        model.load_state_dict(sd, strict=True)
        model.to(self.device)
        model.eval()

        self._loaded_models[cache_key] = model
        return model, spec

    def unload_model(self, model_id: str):
        keys_to_del = [k for k in self._loaded_models if k.startswith(f"{model_id}:")]
        for k in keys_to_del:
            del self._loaded_models[k]
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def unload_all(self):
        self._loaded_models.clear()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


optical_registry = OpticalModelRegistry()
