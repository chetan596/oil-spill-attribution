from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict, AliasChoices


class DetectionRequest(BaseModel):
    scene_id: str = Field(..., description="Unique satellite scene identifier (e.g. demo-scene-001)")
    image_path: Optional[str] = Field(None, description="Path to SAR GeoTIFF on disk")
    threshold: float = Field(0.5, ge=0.0, le=1.0, description="Decision threshold for probability binarization")
    polarization: str = Field("VV", description="Polarization channel: 'VV', 'VH', or 'dual'")
    model_id: Optional[str] = Field(None, description="Optional explicit model ID (e.g. unet-dual-pol-sar-v09d-residual-loss)")


class DetectionResponse(BaseModel):
    scene_id: str
    detection_status: str = Field(..., description="'detected', 'no_slick', 'model_unavailable', 'georeferencing_missing', or 'error'")
    confidence: Optional[float] = Field(None, description="Mean prediction confidence score (0.0 to 1.0)")
    slick_polygons: List[Dict[str, Any]] = Field(default_factory=list, description="GeoJSON Polygon features in EPSG:4326")
    total_area_km2: Optional[float] = Field(None, description="Total contaminated surface area in km²")
    estimated_age_hours: Optional[float] = Field(None, description="Estimated hours between discharge and satellite capture")
    model_version: str = Field(..., description="Model identifier from registry")
    georeferencing_status: str = Field(..., description="'valid' or 'missing'")
    processing_metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata regarding preprocessing, tiling, or fallback")


class V09DInferenceRequest(BaseModel):
    image_path: str = Field(..., description="Path to Sentinel-1 SAR GeoTIFF or raster on disk")
    scene_id: Optional[str] = Field(None, description="Optional scene identifier")
    threshold: float = Field(0.50, ge=0.0, le=1.0, description="Operating threshold (default pre-registered: 0.50)")
    source_type: str = Field("REAL_CDSE", description="Source classification: 'REAL_CDSE', 'UPLOADED_REAL_SAR', or 'DEMO'")
    output_dir: Optional[str] = Field(None, description="Optional directory to save visual PNG artifacts")
    generate_artifacts: bool = Field(False, description="Whether to render original, mask, overlay, and probability map PNGs")


class V09DInferenceResponse(BaseModel):
    status: str = "SUCCESS"
    detection_status: str
    model: Dict[str, Any]
    input: Dict[str, Any]
    inference: Dict[str, Any]
    prediction: Dict[str, Any]
    geospatial: Dict[str, Any]
    geoJson: Optional[Dict[str, Any]] = None
    scientificGuardrails: Optional[Dict[str, Any]] = None
    artifacts: Dict[str, Any] = Field(default_factory=dict)
    limitations: List[str] = Field(default_factory=list)


class ManualAnalysisRequest(BaseModel):
    image_path: str = Field(..., description="Path to uploaded image on disk")
    original_filename: Optional[str] = Field("uploaded_image", description="Original filename")
    output_dir: Optional[str] = Field(None, description="Directory to store generated visual artifacts")
    threshold: float = Field(0.50, ge=0.0, le=1.0, description="Decision threshold for probability binarization")
    polarization: str = Field("VV", description="Polarization channel: 'VV', 'VH', or 'dual'")
    model_id: Optional[str] = Field("unet-dual-pol-sar-v09d-residual-loss", description="Model ID to execute")


class ManualAnalysisResponse(BaseModel):
    analysis_type: str = "MANUAL_IMAGE"
    status: str = Field(..., description="'COMPLETED', 'FAILED', 'NOT_SUPPORTED', 'INSUFFICIENT_DATA'")
    input: Dict[str, Any] = Field(default_factory=dict)
    compatibility: Dict[str, Any] = Field(default_factory=dict)
    detection: Dict[str, Any] = Field(default_factory=dict)
    segmentation: Dict[str, Any] = Field(default_factory=dict)
    severity: Dict[str, Any] = Field(default_factory=dict)
    oil_type: Dict[str, Any] = Field(default_factory=dict)
    authenticity: Dict[str, Any] = Field(default_factory=dict)
    quality: Dict[str, Any] = Field(default_factory=dict)
    look_alike: Dict[str, Any] = Field(default_factory=dict)
    artifacts: Dict[str, Any] = Field(default_factory=dict)
    regions: List[Dict[str, Any]] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None


class RgbClassificationRequest(BaseModel):
    image_path: str = Field(..., description="Path to RGB image file (JPG, JPEG, PNG) on disk")
    threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="Optional custom decision threshold (defaults to 0.80)")


class RgbClassificationResponse(BaseModel):
    status: str = Field(..., description="'OIL_SPILL_DETECTED' or 'NO_OIL_SPILL_DETECTED'")
    oil_spill_detected: bool = Field(..., description="True if probability >= threshold")
    model_probability: float = Field(..., description="Estimated model probability (0.0 to 1.0)")
    decision_threshold: float = Field(..., description="Operating threshold used for decision")
    probability_label: str = Field("MODEL_PROBABILITY", description="Label explaining probability nature")
    modality: str = Field("OPTICAL_RGB", description="Input modality: OPTICAL_RGB")
    location: str = Field("NOT_ESTABLISHED", description="Location status for optical image")
    input_metadata: Dict[str, Any] = Field(default_factory=dict)
    model_info: Dict[str, Any] = Field(default_factory=dict)
    inference_time_ms: float = Field(..., description="Execution time in milliseconds")


class ManualOpticalInferRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    image_path: Optional[str] = Field(None, description="Path to optical image file (JPG, JPEG, PNG, Optical TIFF) on disk")
    output_dir: Optional[str] = Field(None, description="Directory to store generated visual artifacts")
    prefix: Optional[str] = Field("manual", description="Artifact filename prefix")
    source_type: Optional[str] = Field(None, validation_alias=AliasChoices("source_type", "sourceType"), description="Optional acquisition source type: 'SENTINEL_2', 'DRONE', 'AERIAL_RGB', 'RGB_SATELLITE'")
    sensor: Optional[str] = Field(None, description="Optional sensor identifier (e.g. 'MSI', 'Aerial Camera')")
    bands: Optional[List[str]] = Field(None, description="Optional list of band names")
    band_paths: Optional[Dict[str, str]] = Field(None, description="Optional dict of multi-band paths e.g. {'B4': '...', 'B3': '...', 'B2': '...', 'B8': '...', 'B11': '...', 'B12': '...'}")
    spatial_resolution_m: Optional[float] = Field(None, description="Optional ground sampling distance (GSD) in meters")
    threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="Optional custom decision threshold")
    model_id: Optional[str] = Field(None, validation_alias=AliasChoices("model_id", "modelId"), description="Explicit requested model ID to validate and run")


class ManualOpticalInferResponse(BaseModel):
    status: str = "COMPLETED"
    model: Optional[Dict[str, Any]] = Field(default_factory=dict)
    model_lineage: Optional[Dict[str, Any]] = None
    output_fingerprint: Optional[Dict[str, Any]] = None
    classification: Optional[Dict[str, Any]] = Field(default_factory=dict)
    segmentation: Optional[Dict[str, Any]] = Field(default_factory=dict)
    input_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    artifacts: Optional[Dict[str, Any]] = Field(default_factory=dict)
    geospatial: Optional[Dict[str, Any]] = Field(default_factory=dict)
    timing_ms: Optional[Dict[str, Any]] = None
    inference_time_ms: Optional[float] = 0.0
    modelId: Optional[str] = None
    modality: Optional[str] = None
    inputChannels: Optional[int] = None
    polarizations: Optional[List[str]] = None
    polarizationStatus: Optional[str] = None
    inferenceStatus: Optional[str] = None
    detectionStatus: Optional[str] = None
    oilType: Optional[str] = "NOT_ESTABLISHED"
    probabilityStats: Optional[Dict[str, Any]] = None
    maskStats: Optional[Dict[str, Any]] = None
    oilSpillCoveragePercent: Optional[float] = None
    positivePixels: Optional[int] = None
    totalPixels: Optional[int] = None
    estimatedAreaM2: Optional[float] = None
    estimatedAreaKm2: Optional[float] = None
    connectedComponents: Optional[int] = None
    largestComponent: Optional[Dict[str, Any]] = None
    geometry: Optional[Dict[str, Any]] = None
    centroid: Optional[Dict[str, Any]] = None
    footprint: Optional[Dict[str, Any]] = None
    geospatialStatus: Optional[str] = None
    provenance: Optional[Dict[str, Any]] = None



class OperationalOpticalInferRequest(BaseModel):
    image_path: Optional[str] = Field(None, description="Path to optical image file on disk")
    band_paths: Optional[Dict[str, str]] = Field(None, description="Dict of Sentinel-2 band paths (B4, B3, B2, B8, B11, B12)")
    source_type: Optional[str] = Field(None, description="'SENTINEL_2', 'DRONE', 'AERIAL_RGB', 'RGB_SATELLITE', or 'UNKNOWN'")
    sensor: Optional[str] = Field(None, description="Sensor name")
    platform: Optional[str] = Field(None, description="Platform name")
    spatial_resolution_m: Optional[float] = Field(None, description="GSD in meters")
    threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="Operating threshold")
    output_dir: Optional[str] = Field(None, description="Directory to save visual PNG artifacts")
    prefix: Optional[str] = Field("optical", description="Artifact prefix")
    model_id: Optional[str] = Field(None, description="Explicit requested model ID to validate and run")


class OperationalOpticalInferResponse(BaseModel):
    status: str = "COMPLETED"
    model: Dict[str, Any]
    model_lineage: Optional[Dict[str, Any]] = None
    output_fingerprint: Optional[Dict[str, Any]] = None
    classification: Dict[str, Any]
    segmentation: Dict[str, Any]
    input_metadata: Dict[str, Any] = Field(default_factory=dict)
    artifacts: Dict[str, Any] = Field(default_factory=dict)
    geospatial: Dict[str, Any] = Field(default_factory=dict)
    timing_ms: Dict[str, Any] = Field(default_factory=dict)
    inference_time_ms: float


class ManualOpticalCompareRequest(BaseModel):
    image_path: str = Field(..., description="Path to optical RGB image file on disk")
    threshold: Optional[float] = Field(0.50, ge=0.0, le=1.0, description="Decision threshold for comparison")
    output_dir: Optional[str] = Field(None, description="Directory to store visual artifacts")


class ManualOpticalCompareResponse(BaseModel):
    status: str = "COMPLETED"
    image_path: str
    threshold_used: float
    model_a_drone: Dict[str, Any]
    model_b_satellite_rgb: Dict[str, Any]
    comparison: Dict[str, Any]
    diagnostic_note: str
    execution_time_ms: float


class TiffInspectRequest(BaseModel):
    image_path: str = Field(..., description="Path to TIFF/GeoTIFF raster file on disk")
    output_dir: Optional[str] = Field(None, description="Directory to store generated PNG visual previews")
    prefix: Optional[str] = Field("tiff", description="Filename prefix for preview artifacts")
    max_dimension: Optional[int] = Field(1024, ge=256, le=4096, description="Max pixel dimension for preview rendering")
    source_type: Optional[str] = Field(None, description="Optional trusted source declaration, e.g. 'SENTINEL1_DUAL_POL'")
    explicit_polarizations: Optional[List[str]] = Field(None, description="Optional explicit polarizations, e.g. ['VV', 'VH']")


class TiffInspectResponse(BaseModel):
    status: str = "COMPLETED"
    metadata: Dict[str, Any]
    previewGenerated: bool = True
    previewFormat: str = "PNG"
    previewPath: Optional[str] = None
    channel1PreviewPath: Optional[str] = None
    channel2PreviewPath: Optional[str] = None
    previewComposition: Optional[str] = None
    previewSource: str = "ORIGINAL_TIFF"
    previewPurpose: str = "VISUALIZATION_ONLY"
    inferenceSource: str = "ORIGINAL_TIFF"
    artifacts: Dict[str, Any] = Field(default_factory=dict)
    previewNormalization: Dict[str, Any] = Field(default_factory=dict)
    preview: Dict[str, Any] = Field(default_factory=dict)
    displayStats: Dict[str, Any] = Field(default_factory=dict)


class SarDualPolInferRequest(BaseModel):
    image_path: str = Field(..., description="Path to dual-pol SAR TIFF file on disk")
    output_dir: Optional[str] = Field(None, description="Directory to store visual artifacts")
    prefix: Optional[str] = Field("sar_dual_pol", description="Artifact filename prefix")
    source_type: Optional[str] = Field(None, description="Optional trusted source type declaration, e.g. 'SENTINEL1_DUAL_POL'")
    polarizations: Optional[List[str]] = Field(None, description="Optional explicit polarizations, e.g. ['VV', 'VH']")
    threshold: Optional[float] = Field(0.50, ge=0.0, le=1.0, description="Decision threshold (default: 0.50)")
    model_id: Optional[str] = Field(None, description="Requested model ID (must be unet-dual-pol-sar-v09d-residual-loss)")


class SarDualPolInferResponse(BaseModel):
    status: str = "COMPLETED"
    modelId: str
    modality: str
    inputChannels: int
    polarizations: List[str]
    polarizationStatus: str
    inferenceStatus: str
    detectionStatus: str
    oilType: str = "NOT_ESTABLISHED"
    probabilityStats: Dict[str, Any]
    maskStats: Dict[str, Any]
    oilSpillCoveragePercent: float
    estimatedAreaM2: float
    estimatedAreaKm2: float
    connectedComponents: int
    largestComponent: Dict[str, Any]
    geometry: Optional[Dict[str, Any]] = None
    centroid: Optional[Dict[str, Any]] = None
    footprint: Optional[Dict[str, Any]] = None
    artifacts: Dict[str, Any] = Field(default_factory=dict)
    geospatialStatus: str
    provenance: Dict[str, Any] = Field(default_factory=dict)
    executionTimeMs: float
    model: Optional[Dict[str, Any]] = None
    classification: Optional[Dict[str, Any]] = None
    segmentation: Optional[Dict[str, Any]] = None
    geospatial: Optional[Dict[str, Any]] = None




