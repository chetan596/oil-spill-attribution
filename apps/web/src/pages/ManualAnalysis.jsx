import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { manualAnalysisApi } from '../api/manual-analysis.api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  INPUT_STATES,
  ANALYSIS_STATES,
  SAR_MODEL_ID,
  SENTINEL2_MODEL_ID,
  deriveInputDescriptor,
  computeDescriptorFingerprint,
} from '../utils/inputDescriptor';

export {
  INPUT_STATES,
  ANALYSIS_STATES,
  deriveInputDescriptor,
  computeDescriptorFingerprint,
};

import {
  UploadCloud,
  FileImage,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Layers,
  Scan,
  Database,
  ShieldCheck,
  Sparkles,
  Maximize2,
  Sliders,
  BarChart2,
  Activity,
  GitCompare,
  X,
  ChevronDown,
  ChevronUp,
  Compass,
  MapPin,
  Ship,
  FileText,
  Navigation,
  Globe,
  Clock,
  Check,
  Lock,
  Download,
} from 'lucide-react';
import MapView from '../components/map/MapView';
import { Polygon, Polyline, CircleMarker, Popup } from 'react-leaflet';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];

// Phase 15 Deterministic State Machine States
const UPLOAD_STATES = {
  IDLE: 'IDLE',
  VALIDATING: 'VALIDATING',
  UPLOADING: 'UPLOADING',
  PREVIEW_READY: 'PREVIEW_READY',
  READY_FOR_ANALYSIS: 'READY_FOR_ANALYSIS',
  ANALYZING: 'ANALYZING',
  ANALYSIS_COMPLETE: 'ANALYSIS_COMPLETE',
  READY_FOR_INVESTIGATION: 'READY_FOR_INVESTIGATION',
  INVESTIGATING: 'INVESTIGATING',
  INVESTIGATION_COMPLETE: 'INVESTIGATION_COMPLETE',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
};

// Deterministic Analysis Progress Stages
const ANALYZING_STAGES = [
  'Verifying raster container, metadata & cryptographic integrity...',
  'Evaluating trusted input source selection & deterministic routing...',
  'Executing calibrated U-Net ResNet-34 deep learning segmentation...',
  'Computing continuous probability distributions & connected components...',
  'Generating non-destructive visual artifacts & heatmaps...',
  'Compiling forensic audit trail and cryptographic output fingerprints...',
];

// Phase 16.1: Seven-stage SAR Dual-Polarization Inference Progress
const SAR_ANALYZING_STAGES = [
  'Validating VV + VH polarimetric channels...',
  'Loading verified production U-Net checkpoint...',
  'Processing 512×512 SAR tiles with Hann window blending...',
  'Reconstructing continuous calibrated probability map...',
  'Extracting connected oil-spill geometry and boundaries...',
  'Calculating geospatial area via EPSG:6933 equal-area projection...',
  'Preparing forensic investigation dossier...',
];

const SOURCE_OPTIONS = [
  {
    id: 'DRONE',
    title: 'Drone / Aerial RGB',
    subtitle: 'High-resolution UAV / Aerial optics',
    modelId: 'kerf-resnet34-focaldice-v1',
    description: 'High-resolution UAV RGB photography. Calibrated for surface oil sheen and thick oil features.',
    requiresMultispectral: false,
  },
  {
    id: 'RGB_SATELLITE',
    title: 'Satellite RGB',
    subtitle: 'High-altitude true-color satellite',
    modelId: 'mados-resnet34-rgb-v1',
    description: 'Medium/high-resolution true-color satellite optical imagery with broad marine coverage.',
    requiresMultispectral: false,
  },
  {
    id: 'SENTINEL_2',
    title: 'Sentinel-2 Multispectral',
    subtitle: '12-band L2A satellite raster',
    modelId: 'mados-resnet34-rgbnir-swir-v1',
    description: 'Multispectral Sentinel-2 raster containing RGB, NIR, and SWIR reflectance bands.',
    requiresMultispectral: true,
  },
  {
    id: 'SENTINEL1_DUAL_POL',
    title: 'Sentinel-1 Dual-Pol SAR',
    subtitle: '2-Channel C-Band SAR (VV + VH)',
    modelId: 'unet-dual-pol-sar-v09d-residual-loss',
    description: 'Dual-polarization Sentinel-1 radar backscatter imagery. Verified production checkpoint unet-dual-pol-sar-v09d-residual-loss.',
    requiresMultispectral: false,
    requiresSar: true,
  },
];

export default function ManualAnalysis() {
  const navigate = useNavigate();
  // State Machine
  const [uploadState, setUploadState] = useState(UPLOAD_STATES.IDLE);
  const [analyzingStageIndex, setAnalyzingStageIndex] = useState(0);
  const [selectedSourceType, setSelectedSourceType] = useState('DRONE');

  // View Switcher: 'original' | 'vv' | 'vh' | 'probability' | 'mask' | 'annotated'
  const [activeViewTab, setActiveViewTab] = useState('annotated');

  // File & Upload Data
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Uploaded File Metadata & Results
  const [fileMetadata, setFileMetadata] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analystTimestamp, setAnalystTimestamp] = useState('');

  // Phase 16.1: Mutually exclusive analysis state machine & scoped errors
  const [analysisState, setAnalysisState] = useState(ANALYSIS_STATES.IDLE);
  const [activeError, setActiveError] = useState(null); // { jobId, descriptorFingerprint, type, message, action }
  const [isDeclaring, setIsDeclaring] = useState(false);

  // Developer Comparison State
  const [showDeveloperMode, setShowDeveloperMode] = useState(false);
  const [compareResult, setCompareResult] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonError, setComparisonError] = useState(null);

  // Phase 15 Geospatial Investigation State
  const [investigationResult, setInvestigationResult] = useState(null);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [investigationError, setInvestigationError] = useState(null);

  // Zoom / Fullscreen Modal for image inspection
  const [activeModalImage, setActiveModalImage] = useState(null);

  // Phase 15.2 Image Display Information toggle
  const [showDisplayInfo, setShowDisplayInfo] = useState(false);

  const fileInputRef = useRef(null);

  // Format file size helper
  const formatFileSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return 'NOT_AVAILABLE';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Perform client-side validation
  const validateFileLocally = (file) => {
    if (!file) return { valid: false, error: 'No file selected.' };

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        valid: false,
        error: `Unsupported file format '${ext}'. Supported formats: JPG, JPEG, PNG, TIFF`,
      };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Image exceeds the allowed upload size (50 MB limit). Current size: ${formatFileSize(file.size)}`,
      };
    }

    return { valid: true, ext };
  };

  // Check if current file is purely 3-channel RGB (JPG, PNG, or 3-band TIFF)
  const isPureRGBFile = (metadata, file) => {
    if (!file && !metadata) return false;
    const filename = (metadata?.filename || file?.name || '').toLowerCase();
    const isTiff = filename.endsWith('.tif') || filename.endsWith('.tiff');
    if (!isTiff) return true; // Standard JPG / PNG are RGB
    if (metadata?.bands === 3) return true;
    return false;
  };

  // Phase 16.1: Canonical Input Descriptor — Authoritative Single Source of Truth
  const inputDescriptor = useMemo(() => {
    return deriveInputDescriptor(fileMetadata, selectedFile, selectedSourceType);
  }, [fileMetadata, selectedFile, selectedSourceType]);

  // Phase 16.1: Descriptor Fingerprint for deterministic error scoping
  const currentDescriptorFingerprint = useMemo(() => {
    return computeDescriptorFingerprint(inputDescriptor);
  }, [inputDescriptor]);

  // Active error visibility scoped strictly to current jobId + descriptorFingerprint
  const shouldShowError = Boolean(
    activeError &&
    (!activeError.jobId || activeError.jobId === jobId) &&
    (!activeError.descriptorFingerprint || activeError.descriptorFingerprint === currentDescriptorFingerprint)
  );

  // Derived state properties — STRICTLY DERIVED from inputDescriptor (no independent conflicting flags)
  const isSarDualPol = inputDescriptor.isSar;
  const isTwoChannelUnclassified = inputDescriptor.inputState === INPUT_STATES.UNCLASSIFIED_2CH;
  const isSingleChannelUnsupported = inputDescriptor.inputState === INPUT_STATES.SINGLE_CHANNEL;
  const isDualChannelUnsupported = isTwoChannelUnclassified;
  const isRgbTiffUnsupported = inputDescriptor.inputState === INPUT_STATES.RGB_TIFF;
  const isSentinel2Invalid = selectedSourceType === 'SENTINEL_2' && inputDescriptor.inputState === INPUT_STATES.OPTICAL_RGB;

  // Phase 16: Format-Aware Model Card Visibility
  const visibleSourceOptions = useMemo(() => {
    if (isSarDualPol || isTwoChannelUnclassified) {
      return SOURCE_OPTIONS.filter((opt) => opt.id === 'SENTINEL1_DUAL_POL');
    }
    if (inputDescriptor.isOpticalRgb || inputDescriptor.inputState === INPUT_STATES.OPTICAL_RGB) {
      return SOURCE_OPTIONS.filter((opt) => opt.id === 'DRONE' || opt.id === 'RGB_SATELLITE' || opt.id === 'SATELLITE_RGB');
    }
    if (inputDescriptor.isSentinel2 || inputDescriptor.inputState === INPUT_STATES.SENTINEL2) {
      return SOURCE_OPTIONS.filter((opt) => opt.id === 'SENTINEL_2');
    }
    const compat = inputDescriptor.compatibleModels || [];
    if (compat.length === 0) {
      return fileMetadata ? [] : SOURCE_OPTIONS;
    }
    const compatSourceIds = new Set(compat.flatMap((m) => (typeof m === 'object' && m.sourceTypes ? m.sourceTypes : [])));
    return SOURCE_OPTIONS.filter((opt) => compatSourceIds.has(opt.id));
  }, [isSarDualPol, isTwoChannelUnclassified, inputDescriptor, fileMetadata]);

  // True when the server / descriptor says no model is compatible for this format
  const isFormatInferenceBlocked = !inputDescriptor.inferenceSupported;

  const hasAnalysisResult = Boolean(
    analysisResult &&
      [
        UPLOAD_STATES.COMPLETED,
        UPLOAD_STATES.READY_FOR_INVESTIGATION,
        UPLOAD_STATES.INVESTIGATING,
        UPLOAD_STATES.INVESTIGATION_COMPLETE,
      ].includes(uploadState)
  );

  // Handle file drop/selection
  const handleFileSelect = async (file) => {
    setErrorMessage(null);
    setActiveError(null);
    setAnalysisResult(null);
    setCompareResult(null);
    setComparisonError(null);
    setAnalysisState(ANALYSIS_STATES.IDLE);
    if (!file) return;

    setUploadState(UPLOAD_STATES.VALIDATING);

    // 1. Client-Side Validation
    const validation = validateFileLocally(file);
    if (!validation.valid) {
      setUploadState(UPLOAD_STATES.ERROR);
      setErrorMessage(validation.error);
      return;
    }

    setSelectedFile(file);

    // Create local object URL for instant preview ONLY for standard browser-supported images (JPG/PNG)
    const isTiff = file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');
    if (!isTiff) {
      const objectUrl = URL.createObjectURL(file);
      setFilePreviewUrl(objectUrl);
    } else {
      setFilePreviewUrl(null);
    }

    // 2. Perform Server-Side Upload & Backend Validation
    setUploadState(UPLOAD_STATES.UPLOADING);
    setUploadProgress(0);

    try {
      const response = await manualAnalysisApi.uploadOnly(file, (progressEvent) => {
        if (progressEvent.total) {
          setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
        }
      });

      const data = response?.data || response;

      if (!data || (!data.jobId && !data.analysisId)) {
        throw new Error('Server upload failed to return analysis verification ID.');
      }

      const activeJobId = data.jobId || data.analysisId;
      setJobId(activeJobId);

      const isSarVerified = Boolean(
        data.isSarDualPol ||
        data.modality === 'SAR_DUAL_POL' ||
        data.tiffMetadata?.modality === 'SAR_DUAL_POL' ||
        (data.bands === 2 && data.polarizationStatus === 'ESTABLISHED' && Array.isArray(data.polarizations) && data.polarizations.includes('VV') && data.polarizations.includes('VH'))
      );
      const isTwoChannelUnclassified = Boolean(
        (data.bands === 2 || data.channelCount === 2) && !isSarVerified
      );
      const isSingleChannel = Boolean(
        data.isSingleChannelUnsupported ||
        (data.bands === 1 && (data.isTiff || isTiff)) ||
        (data.tiffMetadata?.channels === 1) ||
        (data.tiffMetadata?.channelStructure === 'SINGLE_CHANNEL_GRAYSCALE')
      );
      const geoStatus = data.geolocationStatus || (data.geospatialMetadataAvailable ? 'ESTABLISHED' : 'NOT_ESTABLISHED');

      const previewObj = data.preview || data.tiffMetadata?.preview || null;
      const displayStatsObj = data.displayStats || data.tiffMetadata?.displayStats || null;
      const isSegLike = Boolean(data.isSegmentationLike || previewObj?.isSegmentationLike || displayStatsObj?.isBinary);
      const repStr = data.representation || previewObj?.representation || (isTiff ? (isSingleChannel ? (isSegLike ? 'BINARY_MASK' : 'GRAYSCALE') : data.bands === 6 ? 'SENTINEL2_TRUE_COLOR' : isTwoChannelUnclassified || isSarVerified ? 'SAR_VV_VH' : 'RGB') : 'RGB');
      const normStr = data.normalization || previewObj?.normalization || (isTiff ? (isSegLike ? 'BINARY' : 'PERCENTILE_STRETCH') : 'DIRECT');
      const hintStr = data.rasterTypeHint || previewObj?.rasterTypeHint || (isSegLike ? 'SEGMENTATION / MASK-LIKE RASTER' : isSingleChannel ? 'CONTINUOUS GRAYSCALE RASTER' : isSarVerified ? 'SENTINEL-1 DUAL-POL SAR (VV+VH)' : 'OPTICAL RGB RASTER');

      const serverCompatibleModels = Array.isArray(data.compatibleModels) ? data.compatibleModels : [];
      const serverInputFormat = data.inputFormat || (isTiff ? (data.geospatialMetadataAvailable ? 'GEOTIFF_RASTER' : 'TIFF_RASTER') : 'RGB_RASTER');
      const serverChannelCount = data.channelCount !== undefined ? data.channelCount : (data.bands !== undefined ? data.bands : (isTiff ? 1 : 3));
      const serverBandStructure = data.bandStructure || (isSarVerified ? 'SENTINEL1_DUAL_POL_VV_VH' : serverChannelCount === 6 ? 'SENTINEL2_B4_B3_B2_B8_B11_B12' : serverChannelCount === 3 ? 'RGB' : serverChannelCount === 2 ? 'DUAL_CHANNEL_RASTER' : 'GRAYSCALE_OR_MASK');

      const srcIdent = data.sourceIdentification || (isSarVerified ? (data.tiffMetadata?.polarizationStatus === 'ESTABLISHED' ? 'METADATA_VERIFIED' : 'DATASET_VERIFIED') : isTwoChannelUnclassified ? 'NOT_ESTABLISHED' : 'SOURCE_DERIVED');

      setFileMetadata({
        filename: data.filename || file.name,
        format: data.format || (isTiff ? 'TIFF' : file.type.includes('png') ? 'PNG' : 'JPEG'),
        mimeType: data.mimeType || file.type || 'image/octet-stream',
        sizeBytes: data.sizeBytes || file.size,
        width: data.width !== undefined && data.width !== null ? data.width : 'NOT_AVAILABLE',
        height: data.height !== undefined && data.height !== null ? data.height : 'NOT_AVAILABLE',
        isTiff: Boolean(data.isTiff || isTiff),
        bands: data.bands !== undefined && data.bands !== null ? data.bands : (isTiff ? 1 : 3),
        crs: data.crs || 'NOT_AVAILABLE',
        epsg: data.tiffMetadata?.epsg || null,
        geospatialMetadataAvailable: Boolean(data.geospatialMetadataAvailable),
        geolocationStatus: geoStatus,
        isSarDualPol: isSarVerified,
        isTwoChannelUnclassified,
        modality: data.modality || data.tiffMetadata?.modality || (isSarVerified ? 'SAR_DUAL_POL' : isTwoChannelUnclassified ? 'TWO_CHANNEL_UNCLASSIFIED' : undefined),
        polarizationStatus: data.polarizationStatus || data.tiffMetadata?.polarizationStatus || (isSarVerified ? 'ESTABLISHED' : 'NOT_ESTABLISHED'),
        polarizations: data.polarizations || data.tiffMetadata?.polarizations || (isSarVerified ? ['VV', 'VH'] : []),
        sourceType: isSarVerified ? 'SENTINEL1_DUAL_POL' : data.sourceType || undefined,
        sourceIdentification: srcIdent,
        inputFormat: serverInputFormat,
        channelCount: serverChannelCount,
        bandStructure: serverBandStructure,
        compatibleModels: serverCompatibleModels,
        tiffMetadata: data.tiffMetadata || null,
        preview: previewObj,
        displayStats: displayStatsObj,
        representation: repStr,
        normalization: normStr,
        isSegmentationLike: isSegLike,
        rasterTypeHint: hintStr,
        previewUrl: data.previewUrl || (isTiff ? manualAnalysisApi.getPreviewUrl(activeJobId) : null),
        channel1PreviewUrl: data.channel1PreviewUrl || (isTwoChannelUnclassified || isSarVerified ? manualAnalysisApi.getChannel1PreviewUrl(activeJobId) : null),
        channel2PreviewUrl: data.channel2PreviewUrl || (isTwoChannelUnclassified || isSarVerified ? manualAnalysisApi.getChannel2PreviewUrl(activeJobId) : null),
        temporalReference: data.temporalReference || data.tiffMetadata?.temporalReference || null,
        sourceProduct: data.sourceProduct || null,
      });

      // Auto-select SAR model if genuine dual-pol SAR detected
      if (isSarVerified) {
        setSelectedSourceType('SENTINEL1_DUAL_POL');
        setAnalysisState(ANALYSIS_STATES.READY);
        setUploadState(UPLOAD_STATES.READY_FOR_ANALYSIS);
      } else if (isTwoChannelUnclassified) {
        setSelectedSourceType('SENTINEL1_DUAL_POL');
        setAnalysisState(ANALYSIS_STATES.IDLE);
        setUploadState(UPLOAD_STATES.PREVIEW_READY);
      } else if (serverCompatibleModels.length > 0) {
        const allCompatibleSourceIds = serverCompatibleModels.flatMap((m) => m.sourceTypes || []);
        const firstMatch = SOURCE_OPTIONS.find((opt) => allCompatibleSourceIds.includes(opt.id));
        if (firstMatch) setSelectedSourceType(firstMatch.id);
        setAnalysisState(ANALYSIS_STATES.READY);
        setUploadState(UPLOAD_STATES.READY_FOR_ANALYSIS);
      } else {
        setAnalysisState(ANALYSIS_STATES.IDLE);
        setUploadState(UPLOAD_STATES.PREVIEW_READY);
      }

      if (isTiff) {
        setFilePreviewUrl(manualAnalysisApi.getPreviewUrl(activeJobId));
      }
    } catch (err) {
      setUploadState(UPLOAD_STATES.ERROR);
      setAnalysisState(ANALYSIS_STATES.FAILED);
      const serverMsg = err.response?.data?.message || err.response?.data?.error?.message || err.message;
      setErrorMessage(serverMsg || 'Upload failed. Please ensure the file is a valid, uncorrupted image.');
      setActiveError({
        jobId: null,
        descriptorFingerprint: null,
        type: 'UPLOAD_FAILED',
        message: serverMsg || 'Upload failed. Please ensure the file is a valid, uncorrupted image.',
        action: 'UPLOAD_AGAIN',
      });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl(null);
    setFileMetadata(null);
    setJobId(null);
    setAnalysisResult(null);
    setCompareResult(null);
    setComparisonError(null);
    setInvestigationResult(null);
    setIsInvestigating(false);
    setInvestigationError(null);
    setErrorMessage(null);
    setActiveError(null);
    setAnalystTimestamp('');
    setIsDeclaring(false);
    setUploadProgress(0);
    setAnalyzingStageIndex(0);
    setActiveModalImage(null);
    setActiveViewTab('annotated');
    setUploadState(UPLOAD_STATES.IDLE);
    setAnalysisState(ANALYSIS_STATES.IDLE);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Phase 16.1: Backend-authoritative source declaration
  const handleDeclareSentinel1 = async () => {
    if (!jobId) return;
    setIsDeclaring(true);
    setActiveError(null);

    try {
      const response = await manualAnalysisApi.declareSource(jobId, {
        sourceType: 'SENTINEL1_DUAL_POL',
        polarizations: ['VV', 'VH'],
      });
      const data = response?.data || response;
      const authoritative = data?.descriptor || data;

      setSelectedSourceType('SENTINEL1_DUAL_POL');
      setFileMetadata((prev) => ({
        ...prev,
        modality: authoritative.modality || 'SAR_DUAL_POL',
        polarizationStatus: authoritative.polarizationStatus || 'ESTABLISHED',
        polarizations: authoritative.polarizations || ['VV', 'VH'],
        sourceType: authoritative.sourceType || 'SENTINEL1_DUAL_POL',
        sourceIdentification: authoritative.sourceIdentification || 'USER_DECLARED',
        compatibleModels: authoritative.compatibleModels || [
          {
            modelId: SAR_MODEL_ID,
            name: 'Dual-Pol SAR Oil Spill Segmentation',
            status: 'COMPATIBLE',
          },
        ],
        isSarDualPol: true,
        channel1PreviewUrl: manualAnalysisApi.getChannel1PreviewUrl(jobId),
        channel2PreviewUrl: manualAnalysisApi.getChannel2PreviewUrl(jobId),
      }));
      setAnalysisState(ANALYSIS_STATES.READY);
      setUploadState(UPLOAD_STATES.READY_FOR_ANALYSIS);
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error?.message || err.message;
      setActiveError({
        jobId,
        descriptorFingerprint: currentDescriptorFingerprint,
        type: 'DECLARATION_FAILED',
        message: serverMsg || 'Failed to declare Sentinel-1 source on backend.',
        action: 'DECLARE_SENTINEL1',
      });
    } finally {
      setIsDeclaring(false);
    }
  };

  // Explicit Trigger for Production AI Analysis
  const handleAnalyzeClick = async () => {
    if (!jobId) return;

    if (!inputDescriptor.inferenceSupported) {
      const errType = inputDescriptor.isSar
        ? 'SAR INPUT VALIDATION FAILED'
        : inputDescriptor.inputState === INPUT_STATES.SENTINEL2
        ? 'SENTINEL-2 INPUT VALIDATION FAILED'
        : 'OPTICAL INPUT VALIDATION FAILED';
      setActiveError({
        jobId,
        descriptorFingerprint: currentDescriptorFingerprint,
        type: errType,
        message: inputDescriptor.inferenceBlockReason || 'Inference is not supported for the current raster structure.',
        action: isTwoChannelUnclassified ? 'DECLARE_SENTINEL1' : 'UPLOAD_AGAIN',
      });
      return;
    }

    setUploadState(UPLOAD_STATES.ANALYZING);
    setAnalysisState(ANALYSIS_STATES.ANALYZING);
    setActiveError(null);
    setErrorMessage(null);
    setAnalyzingStageIndex(0);

    const activeStages = inputDescriptor.isSar ? SAR_ANALYZING_STAGES : ANALYZING_STAGES;
    const stageInterval = setInterval(() => {
      setAnalyzingStageIndex((prev) => (prev < activeStages.length - 1 ? prev + 1 : prev));
    }, 550);

    try {
      const isSar = Boolean(
        inputDescriptor.isSar ||
        fileMetadata?.isSarDualPol ||
        fileMetadata?.sourceType === 'SENTINEL1_DUAL_POL' ||
        selectedSourceType === 'SENTINEL1_DUAL_POL'
      );
      const isSatellite = selectedSourceType === 'RGB_SATELLITE' || selectedSourceType === 'SATELLITE_RGB';
      const isUnknown = selectedSourceType === 'UNKNOWN';
      const effectiveSourceType = isSar
        ? 'SENTINEL1_DUAL_POL'
        : (isSatellite ? 'SATELLITE_RGB' : (isUnknown ? 'UNKNOWN' : (selectedSourceType || 'DRONE')));
      const effectiveModelId = isSar
        ? SAR_MODEL_ID
        : (isSatellite ? 'mados-resnet34-rgb-v1' : (isUnknown ? null : 'kerf-resnet34-focaldice-v1'));

      if (effectiveSourceType === 'UNKNOWN' || !effectiveModelId) {
        clearInterval(stageInterval);
        setUploadState(UPLOAD_STATES.READY_FOR_ANALYSIS);
        setAnalysisState(ANALYSIS_STATES.READY);
        setActiveError({
          jobId,
          descriptorFingerprint: currentDescriptorFingerprint,
          type: 'OPTICAL INPUT VALIDATION FAILED',
          message: 'Cannot determine optical domain for input: source_type is UNKNOWN. Explicit source selection (DRONE or SATELLITE_RGB) is required.',
          action: 'SELECT_SOURCE',
        });
        return;
      }

      const options = {
        source_type: effectiveSourceType,
        sourceType: effectiveSourceType,
        model_id: effectiveModelId,
        modelId: effectiveModelId,
        investigationTimestamp: analystTimestamp ? analystTimestamp.trim() : undefined,
        acquisitionTimestamp: analystTimestamp ? analystTimestamp.trim() : undefined,
      };

      console.info('[ManualAnalysis] Outgoing analyze request:', { jobId, options });
      const response = await manualAnalysisApi.analyzeImage(jobId, options);
      clearInterval(stageInterval);
      const data = response?.data || response;
      setAnalysisResult(data);
      setActiveViewTab(inputDescriptor.isSar ? 'original' : 'annotated');
      setAnalysisState(ANALYSIS_STATES.SUCCESS);
      const isGeoEstablished = data.geospatial?.geolocationStatus === 'ESTABLISHED';
      setUploadState(isGeoEstablished ? UPLOAD_STATES.READY_FOR_INVESTIGATION : UPLOAD_STATES.COMPLETED);
    } catch (err) {
      clearInterval(stageInterval);
      setUploadState(UPLOAD_STATES.ERROR);
      setAnalysisState(ANALYSIS_STATES.FAILED);
      const httpStatus = err.response?.status;
      const serverMsg =
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        err.message;
      const errCode = err.response?.data?.code || err.response?.data?.error?.code || err.code;
      const isSarFailure = Boolean(inputDescriptor.isSar || fileMetadata?.isSarDualPol || errCode === 'SAR_INFERENCE_FAILED');

      let errType = 'INFERENCE_FAILED';
      let displayMessage = serverMsg;

      if (httpStatus === 502 || httpStatus === 503 || errCode === 'ECONNREFUSED' || errCode === 'OPTICAL_ML_SERVICE_UNAVAILABLE') {
        errType = 'SERVICE_UNAVAILABLE';
        displayMessage = 'AI inference service is temporarily unavailable.';
      } else if (errCode === 'MODEL_INPUT_MISMATCH' || (httpStatus === 400 && (serverMsg || '').toLowerCase().includes('incompatible'))) {
        errType = 'MODEL_INPUT_MISMATCH';
        displayMessage = serverMsg || 'This raster is incompatible with the selected model.';
      } else if (errCode === 'ARTIFACT_GENERATION_FAILED') {
        errType = 'ARTIFACT_GENERATION_FAILED';
        displayMessage = 'Inference completed, but an analysis artifact could not be generated.';
      } else if (httpStatus === 422 || errCode === 'CORRUPTED_OR_INVALID_IMAGE' || errCode === 'INVALID_INPUT') {
        errType = 'INVALID_INPUT';
        displayMessage = serverMsg || 'Uploaded image is invalid or unreadable.';
      } else if (isSarFailure) {
        errType = 'SAR INFERENCE FAILED';
        displayMessage = serverMsg || 'SAR inference failed during model execution.';
      } else if (inputDescriptor.inputState === INPUT_STATES.SENTINEL2) {
        errType = 'SENTINEL-2 INPUT VALIDATION FAILED';
      } else {
        errType = 'INFERENCE_FAILED';
        displayMessage = serverMsg || 'Model inference failed during execution.';
      }

      console.error('[ManualAnalysis] AI analysis failure:', {
        error: err,
        code: errCode,
        status: httpStatus,
        type: errType,
        stage: err.response?.data?.error?.stage || err.stage,
        details: err.response?.data?.error?.details || err.details,
      });

      setActiveError({
        jobId,
        descriptorFingerprint: currentDescriptorFingerprint,
        type: errType,
        message: displayMessage,
        action: 'RETRY_ANALYSIS',
      });
    }
  };

  // Phase 15: Downstream Geospatial Investigation Trigger
  const handleInvestigateClick = async () => {
    if (!jobId) return;

    if (analysisResult?.geospatial?.geolocationStatus !== 'ESTABLISHED') {
      setErrorMessage(
        'GEOSPATIAL INVESTIGATION UNAVAILABLE: This image does not contain valid geolocation metadata (CRS/affine transform). Ocean Guard AI cannot correlate drift trajectories or AIS vessel positions without real geographic coordinates. No coordinates or vessel blame have been fabricated.'
      );
      return;
    }

    setIsInvestigating(true);
    setInvestigationError(null);
    setUploadState(UPLOAD_STATES.INVESTIGATING);

    try {
      const resp = await manualAnalysisApi.investigateSpill(jobId);
      const data = resp?.data || resp;
      setInvestigationResult(data);
      setUploadState(UPLOAD_STATES.INVESTIGATION_COMPLETE);
    } catch (err) {
      setUploadState(UPLOAD_STATES.READY_FOR_INVESTIGATION);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        err.message;
      setInvestigationError(msg || 'Downstream geospatial investigation failed.');
    } finally {
      setIsInvestigating(false);
    }
  };

  // Developer Mode Comparison Trigger
  const handleRunComparison = async () => {
    if (!jobId) return;
    setIsComparing(true);
    setComparisonError(null);
    try {
      const resp = await manualAnalysisApi.compareModels(jobId);
      const data = resp?.data || resp;
      setCompareResult(data);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error?.message ||
        err.response?.data?.detail ||
        err.message;
      setComparisonError(msg || 'Failed to execute dual model comparison.');
    } finally {
      setIsComparing(false);
    }
  };

  // Helper to get image URL for the active view tab
  const getActiveViewUrl = () => {
    if (!jobId) return filePreviewUrl;
    switch (activeViewTab) {
      case 'vv':
        return manualAnalysisApi.getVvUrl(jobId);
      case 'vh':
        return manualAnalysisApi.getVhUrl(jobId);
      case 'probability':
        return manualAnalysisApi.getProbabilityUrl(jobId);
      case 'mask':
        return manualAnalysisApi.getMaskUrl(jobId);
      case 'original':
        return filePreviewUrl || manualAnalysisApi.getOriginalUrl(jobId);
      case 'annotated':
      default:
        return manualAnalysisApi.getAnnotatedUrl(jobId);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        backgroundColor: '#0A0B0D',
        color: '#E7EAEE',
        padding: '24px 32px 48px 32px',
        boxSizing: 'border-box',
        gap: '24px',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <div
        style={{
          borderBottom: '1px solid #25292F',
          paddingBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                margin: 0,
                color: '#E7EAEE',
              }}
            >
              {inputDescriptor.isSar
                ? 'Manual SAR Analysis'
                : inputDescriptor.inputState === INPUT_STATES.SENTINEL2
                ? 'Manual Multispectral Analysis'
                : 'Manual Image Analysis'}
            </h1>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(73, 198, 200, 0.12)',
                border: '1px solid rgba(73, 198, 200, 0.3)',
                color: '#49C6C8',
                fontWeight: 600,
                fontFamily: 'monospace',
              }}
            >
              {inputDescriptor.isSar
                ? 'SENTINEL-1 DUAL-POL SAR'
                : inputDescriptor.inputState === INPUT_STATES.SENTINEL2
                ? 'SENTINEL-2 MULTISPECTRAL'
                : 'TRUSTED SOURCE ROUTER (PHASE 14)'}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: 'rgba(52, 211, 153, 0.12)',
                border: '1px solid rgba(52, 211, 153, 0.35)',
                color: '#34D399',
                fontWeight: 600,
                fontFamily: 'monospace',
              }}
            >
              PRODUCTION FREEZE
            </span>
          </div>
          <p
            style={{
              fontSize: '0.88rem',
              color: '#A7AFB8',
              margin: '6px 0 0 0',
            }}
          >
            {inputDescriptor.isSar
              ? 'Upload a georeferenced Sentinel-1 VV + VH SAR raster for dual-polarization oil-spill detection and geospatial investigation.'
              : inputDescriptor.inputState === INPUT_STATES.SENTINEL2
              ? 'Upload a multispectral Sentinel-2 raster containing RGB, NIR, and SWIR reflectance bands.'
              : 'Upload marine optical imagery (JPG, PNG, Optical TIFF) for source-calibrated classification, continuous probability mapping, and semantic oil-spill segmentation.'}
          </p>
        </div>

        {uploadState !== UPLOAD_STATES.IDLE && (
          <button
            onClick={handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '6px',
              backgroundColor: '#171A1E',
              border: '1px solid #25292F',
              color: '#A7AFB8',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            <RotateCcw size={14} />
            Upload Another Image
          </button>
        )}
      </div>

      {/* ── ERROR MESSAGE BANNER (FINGERPRINT-SCOPED & MUTUALLY EXCLUSIVE) ── */}
      {(shouldShowError || (!activeError && errorMessage)) && (
        <div
          data-testid="error-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            borderRadius: '8px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#F87171',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            {activeError ? (
              <>
                <strong>{activeError.type}: </strong>
                {activeError.message}
              </>
            ) : (
              errorMessage
            )}
          </div>
          {activeError?.action === 'DECLARE_SENTINEL1' && (
            <button
              onClick={handleDeclareSentinel1}
              disabled={isDeclaring}
              style={{
                padding: '6px 14px',
                borderRadius: '4px',
                backgroundColor: '#F59E0B',
                color: '#000000',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                cursor: isDeclaring ? 'wait' : 'pointer',
              }}
            >
              {isDeclaring ? 'Declaring...' : 'DECLARE AS SENTINEL-1 (VV + VH)'}
            </button>
          )}
          {activeError?.action === 'RETRY_ANALYSIS' && (
            <button
              onClick={handleAnalyzeClick}
              style={{
                padding: '6px 14px',
                borderRadius: '4px',
                backgroundColor: '#EF4444',
                color: '#FFFFFF',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Retry Analysis
            </button>
          )}
          {activeError?.action === 'UPLOAD_AGAIN' && (
            <button
              onClick={handleReset}
              style={{
                padding: '6px 14px',
                borderRadius: '4px',
                backgroundColor: '#374151',
                color: '#FFFFFF',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Upload Again
            </button>
          )}
        </div>
      )}

      {/* ── MAIN WORKSPACE VIEWPORT ───────────────────────────────────── */}
      {uploadState === UPLOAD_STATES.IDLE ? (
        /* ═════════════════════════════════════════════════════════════════
           STAGE 1: UPLOAD AREA
           ═════════════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '340px',
              padding: '40px 24px',
              borderRadius: '12px',
              backgroundColor: isDragging ? 'rgba(73, 198, 200, 0.05)' : '#121417',
              border: isDragging ? '2px dashed #49C6C8' : '2px dashed #25292F',
              cursor: 'pointer',
              transition: 'all 180ms ease',
              textAlign: 'center',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.tif,.tiff,image/jpeg,image/png,image/tiff,image/geotiff"
              onChange={(e) => e.target.files && e.target.files[0] && handleFileSelect(e.target.files[0])}
              style={{ display: 'none' }}
            />

            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(73, 198, 200, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#49C6C8',
                marginBottom: '16px',
              }}
            >
              <UploadCloud size={32} />
            </div>

            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#E7EAEE' }}>
              Drop an image here or browse
            </div>

            <div
              style={{
                fontSize: '0.85rem',
                color: '#A7AFB8',
                marginTop: '8px',
                maxWidth: '480px',
              }}
            >
              Supports standard optical marine photographs (JPG, JPEG, PNG) and optical TIFF imagery.
            </div>

            <div
              style={{
                marginTop: '20px',
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              {['JPG', 'JPEG', 'PNG', 'TIFF', 'Max 50 MB', 'Zero Auto-Execution', 'Calibrated Probability Maps'].map((fmt) => (
                <span
                  key={fmt}
                  style={{
                    fontSize: '0.72rem',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    backgroundColor: '#171A1E',
                    border: '1px solid #25292F',
                    color: '#A7AFB8',
                    fontWeight: 500,
                  }}
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : uploadState === UPLOAD_STATES.VALIDATING || uploadState === UPLOAD_STATES.UPLOADING ? (
        /* ═════════════════════════════════════════════════════════════════
           STAGE 2: UPLOADING & VALIDATING PROGRESS
           ═════════════════════════════════════════════════════════════════ */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            padding: '40px',
            borderRadius: '12px',
            backgroundColor: '#121417',
            border: '1px solid #25292F',
            textAlign: 'center',
            gap: '16px',
          }}
        >
          <LoadingSpinner size="lg" />
          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#E7EAEE' }}>
            {uploadState === UPLOAD_STATES.VALIDATING ? 'Validating file format and magic bytes...' : 'Uploading image...'}
          </div>
          <div style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>
            {selectedFile?.name} ({formatFileSize(selectedFile?.size)})
          </div>
          {uploadProgress > 0 && (
            <div
              style={{
                width: '280px',
                height: '6px',
                borderRadius: '3px',
                backgroundColor: '#171A1E',
                overflow: 'hidden',
                marginTop: '8px',
              }}
            >
              <div
                style={{
                  width: `${uploadProgress}%`,
                  height: '100%',
                  backgroundColor: '#49C6C8',
                  transition: 'width 200ms ease',
                }}
              />
            </div>
          )}
        </div>
      ) : uploadState === UPLOAD_STATES.ANALYZING ? (
        /* ═════════════════════════════════════════════════════════════════
           STAGE 3: DETERMINISTIC AI INFERENCE PROGRESS
           ═════════════════════════════════════════════════════════════════ */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '340px',
            padding: '48px 24px',
            borderRadius: '12px',
            backgroundColor: '#121417',
            border: '1px solid #25292F',
            textAlign: 'center',
            gap: '20px',
          }}
        >
          <LoadingSpinner size="lg" />
          {/* Pipeline Stage Indicators */}
          {(() => {
            const stages = inputDescriptor.isSar ? SAR_ANALYZING_STAGES : ANALYZING_STAGES;
            const currentStage = stages[analyzingStageIndex] || stages[0];
            return (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#49C6C8', letterSpacing: '0.03em' }}>
                    {inputDescriptor.isSar ? 'ANALYZING DUAL-POLARIZATION SAR' : 'ANALYZING IMAGE'}
                  </div>
                  <div style={{ fontSize: '0.88rem', color: '#E7EAEE', fontFamily: 'monospace' }}>
                    {currentStage}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '460px', marginTop: '12px' }}>
                  {stages.map((stg, idx) => (
                    <div
                      key={stg}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        fontSize: '0.78rem',
                        color: idx <= analyzingStageIndex ? '#34D399' : '#6B7280',
                        textAlign: 'left',
                      }}
                    >
                      {idx < analyzingStageIndex ? (
                        <CheckCircle2 size={14} style={{ color: '#34D399', flexShrink: 0 }} />
                      ) : idx === analyzingStageIndex ? (
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            border: '2px solid #49C6C8',
                            borderTopColor: 'transparent',
                            animation: 'spin 1s linear infinite',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '14px',
                            height: '14px',
                            borderRadius: '50%',
                            border: '1px solid #374151',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span>{stg}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════════
           STAGE 4: READY_FOR_ANALYSIS OR COMPLETED RESULTS VIEW
           ═════════════════════════════════════════════════════════════════ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* ── SIDE-BY-SIDE VISUAL COMPARISON ──────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px',
              alignItems: 'stretch',
            }}
          >
            {/* ── LEFT PANEL: ORIGINAL IMAGE ──────────────────────────── */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '10px',
                backgroundColor: '#121417',
                border: '1px solid #25292F',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '12px 18px',
                  borderBottom: '1px solid #25292F',
                  backgroundColor: '#171A1E',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileImage size={16} style={{ color: '#49C6C8' }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E7EAEE', letterSpacing: '0.04em' }}>
                    ORIGINAL SOURCE
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(73, 198, 200, 0.12)',
                    border: '1px solid rgba(73, 198, 200, 0.3)',
                    color: '#49C6C8',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                  }}
                >
                  {fileMetadata?.format || 'IMAGE'}
                </span>
              </div>

              {/* Original Preview Viewport */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '340px',
                  maxHeight: '460px',
                  padding: '16px',
                  backgroundColor: '#0A0B0D',
                  position: 'relative',
                }}
              >
                {inputDescriptor.channelCount === 2 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '14px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', width: '100%', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '160px', maxWidth: '240px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: inputDescriptor.isSar ? '#38BDF8' : '#A7AFB8', marginBottom: '6px', letterSpacing: '0.04em' }}>
                          {inputDescriptor.isSar ? 'CHANNEL 1 — VV (CO-POL)' : 'CHANNEL 1'}
                        </div>
                        <img
                          src={fileMetadata?.channel1PreviewUrl || (jobId ? manualAnalysisApi.getChannel1PreviewUrl(jobId) : null)}
                          alt={inputDescriptor.isSar ? 'Channel 1 — VV (Co-Pol)' : 'Channel 1'}
                          onClick={() => setActiveModalImage(fileMetadata?.channel1PreviewUrl || manualAnalysisApi.getChannel1PreviewUrl(jobId))}
                          style={{
                            width: '100%',
                            maxHeight: '260px',
                            objectFit: 'contain',
                            borderRadius: '6px',
                            border: inputDescriptor.isSar ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #374151',
                            cursor: 'zoom-in',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: '160px', maxWidth: '240px', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: inputDescriptor.isSar ? '#818CF8' : '#A7AFB8', marginBottom: '6px', letterSpacing: '0.04em' }}>
                          {inputDescriptor.isSar ? 'CHANNEL 2 — VH (CROSS-POL)' : 'CHANNEL 2'}
                        </div>
                        <img
                          src={fileMetadata?.channel2PreviewUrl || (jobId ? manualAnalysisApi.getChannel2PreviewUrl(jobId) : null)}
                          alt={inputDescriptor.isSar ? 'Channel 2 — VH (Cross-Pol)' : 'Channel 2'}
                          onClick={() => setActiveModalImage(fileMetadata?.channel2PreviewUrl || manualAnalysisApi.getChannel2PreviewUrl(jobId))}
                          style={{
                            width: '100%',
                            maxHeight: '260px',
                            objectFit: 'contain',
                            borderRadius: '6px',
                            border: inputDescriptor.isSar ? '1px solid rgba(129, 140, 248, 0.4)' : '1px solid #374151',
                            cursor: 'zoom-in',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          }}
                        />
                      </div>
                    </div>

                    {inputDescriptor.isSar ? (
                      <div
                        style={{
                          backgroundColor: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          borderRadius: '6px',
                          padding: '10px 16px',
                          color: '#BAE6FD',
                          fontSize: '0.75rem',
                          lineHeight: '1.4',
                          textAlign: 'center',
                          maxWidth: '520px',
                        }}
                      >
                        <strong style={{ color: '#38BDF8' }}>SENTINEL-1 DUAL-POLARIZATION SAR DETECTED:</strong>{' '}
                        Dual polarimetric radar backscatter channels (VV co-polarized + VH cross-polarized). Calibrated and ready for deep learning inference.
                      </div>
                    ) : (
                      <div
                        style={{
                          backgroundColor: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          borderRadius: '6px',
                          padding: '12px 18px',
                          color: '#FDE68A',
                          fontSize: '0.75rem',
                          lineHeight: '1.4',
                          textAlign: 'center',
                          maxWidth: '520px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong style={{ color: '#FBBF24' }}>2-CHANNEL RASTER DETECTED</strong>
                          <div style={{ color: '#FCD34D', fontSize: '0.72rem', marginTop: '2px' }}>
                            Polarization: NOT ESTABLISHED
                          </div>
                        </div>
                        <div style={{ color: '#CBD5E1', fontSize: '0.72rem' }}>
                          This 2-channel TIFF does not contain verified VV/VH metadata tags. To enable dual-polarization SAR segmentation, declare the channel source below.
                        </div>
                        <button
                          type="button"
                          onClick={handleDeclareSentinel1}
                          disabled={isDeclaring}
                          style={{
                            padding: '6px 16px',
                            borderRadius: '4px',
                            backgroundColor: '#F59E0B',
                            color: '#000',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            border: 'none',
                            cursor: isDeclaring ? 'wait' : 'pointer',
                            marginTop: '4px',
                          }}
                        >
                          {isDeclaring ? 'Declaring on Backend...' : 'DECLARE AS SENTINEL-1 (VV + VH)'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : fileMetadata?.isTiff ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '10px' }}>
                    <img
                      src={filePreviewUrl || (jobId ? manualAnalysisApi.getPreviewUrl(jobId) : null)}
                      alt="TIFF Visual Preview"
                      onClick={() => setActiveModalImage(filePreviewUrl || manualAnalysisApi.getPreviewUrl(jobId))}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '380px',
                        objectFit: 'contain',
                        borderRadius: '4px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                        cursor: 'zoom-in',
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                        width: '100%',
                        maxWidth: '520px',
                      }}
                    >
                      {/* Main Title Badge */}
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#A855F7',
                          backgroundColor: 'rgba(168, 85, 247, 0.12)',
                          border: '1px solid rgba(168, 85, 247, 0.35)',
                          padding: '4px 12px',
                          borderRadius: '4px',
                          letterSpacing: '0.04em',
                        }}
                      >
                        <span>VISUALIZATION ONLY: Derived PNG preview • Original TIFF preserved</span>
                      </div>

                      {/* Detail Badges Strip */}
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'center',
                          gap: '6px',
                          fontSize: '0.68rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        {/* Representation Badge */}
                        <div style={{ backgroundColor: '#171A1E', border: '1px solid #25292F', padding: '3px 8px', borderRadius: '4px', color: '#38BDF8' }}>
                          <span style={{ color: '#6B7280' }}>Representation: </span>
                          <strong>{fileMetadata?.representation || (fileMetadata?.bands === 1 ? 'GRAYSCALE' : 'RGB')}</strong>
                        </div>

                        {/* Display Normalization Badge */}
                        <div style={{ backgroundColor: '#171A1E', border: '1px solid #25292F', padding: '3px 8px', borderRadius: '4px', color: '#F59E0B' }}>
                          <span style={{ color: '#6B7280' }}>Display: </span>
                          <strong>
                            {fileMetadata?.representation === 'BINARY_MASK' || fileMetadata?.normalization === 'BINARY'
                              ? 'Binary stretch'
                              : fileMetadata?.normalization === 'CONSTANT'
                              ? 'Constant raster (128 neutral)'
                              : fileMetadata?.representation === 'SENTINEL2_TRUE_COLOR'
                              ? 'B4/B3/B2'
                              : fileMetadata?.representation === 'RGB' || fileMetadata?.normalization === 'DIRECT'
                              ? 'Direct RGB'
                              : '2–98% contrast stretch'}
                          </strong>
                        </div>

                        {/* Source Badge */}
                        <div style={{ backgroundColor: '#171A1E', border: '1px solid #25292F', padding: '3px 8px', borderRadius: '4px', color: '#34D399' }}>
                          <span style={{ color: '#6B7280' }}>Source: </span>
                          <strong>Original TIFF</strong>
                        </div>

                        {/* Inference Status for 1-channel */}
                        {(fileMetadata?.isSingleChannelUnsupported || fileMetadata?.bands === 1) && (
                          <div style={{ backgroundColor: '#171A1E', border: '1px solid #25292F', padding: '3px 8px', borderRadius: '4px', color: '#EF4444' }}>
                            <span style={{ color: '#6B7280' }}>Inference: </span>
                            <strong>Not executed — 1-channel raster</strong>
                          </div>
                        )}
                      </div>

                      {/* Segmentation-like Hint Banner */}
                      {fileMetadata?.isSegmentationLike && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.35)',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '0.68rem',
                            color: '#38BDF8',
                          }}
                        >
                          <span>Detected raster type: <strong>MASK-LIKE / VISUALIZATION</strong> (Not Ground Truth)</span>
                        </div>
                      )}
                    </div>

                    {(fileMetadata?.isSingleChannelUnsupported || fileMetadata?.bands === 1) && (
                      <div
                        style={{
                          backgroundColor: 'rgba(234, 179, 8, 0.12)',
                          border: '1px solid rgba(234, 179, 8, 0.4)',
                          borderRadius: '6px',
                          padding: '10px 16px',
                          color: '#FACC15',
                          fontSize: '0.75rem',
                          lineHeight: '1.4',
                          textAlign: 'center',
                          maxWidth: '520px',
                        }}
                      >
                        <strong>Preview available.</strong> {fileMetadata?.isSegmentationLike ? 'This TIFF contains a binary / mask-like raster (visualization only).' : 'This TIFF contains 1 grayscale channel (2–98% contrast stretch).'} The current optical RGB production models require 3-channel RGB input. AI inference is not executed.
                      </div>
                    )}
                  </div>
                ) : (
                  <img
                    src={filePreviewUrl || (jobId ? manualAnalysisApi.getOriginalUrl(jobId) : null)}
                    alt="Original Upload"
                    onClick={() => setActiveModalImage(filePreviewUrl || manualAnalysisApi.getOriginalUrl(jobId))}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '420px',
                      objectFit: 'contain',
                      borderRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                      cursor: 'zoom-in',
                    }}
                  />
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL: VIEW SWITCHER / FILE INFORMATION ───────── */}
            {hasAnalysisResult ? (
              /* COMPLETED: 4-TAB VISUAL VIEW SWITCHER */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '10px',
                  backgroundColor: '#121417',
                  border: '1px solid #25292F',
                  overflow: 'hidden',
                }}
              >
                {/* 4-Tab View Switcher Header */}
                <div
                  style={{
                    padding: '8px 14px',
                    borderBottom: '1px solid #25292F',
                    backgroundColor: '#171A1E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    {(() => {
                      const isSarResult = Boolean(
                        analysisResult?.modelId === 'unet-dual-pol-sar-v09d-residual-loss' ||
                        analysisResult?.modality === 'SAR_DUAL_POL' ||
                        analysisResult?.model?.modelId === 'unet-dual-pol-sar-v09d-residual-loss' ||
                        fileMetadata?.isSarDualPol
                      );
                      const tabs = isSarResult
                        ? [
                            { id: 'original', label: 'ORIGINAL', icon: FileImage, color: '#49C6C8', badge: null },
                            { id: 'vv', label: 'VV', icon: Activity, color: '#38BDF8', badge: 'CO-POL', badgeColor: '#38BDF8' },
                            { id: 'vh', label: 'VH', icon: Activity, color: '#818CF8', badge: 'CROSS-POL', badgeColor: '#818CF8' },
                            { id: 'probability', label: 'PROBABILITY MAP', icon: Activity, color: '#3B82F6', badge: 'MODEL-DERIVED', badgeColor: '#F59E0B' },
                            { id: 'mask', label: 'BINARY MASK', icon: Layers, color: '#EAB308', badge: 'MODEL-DERIVED', badgeColor: '#F59E0B' },
                            { id: 'annotated', label: 'FINAL OVERLAY', icon: Sparkles, color: '#EF4444', badge: 'MODEL-DERIVED', badgeColor: '#F59E0B' },
                          ]
                        : [
                            { id: 'annotated', label: 'Final Overlay', icon: Sparkles, color: '#EF4444', badge: null },
                            { id: 'probability', label: 'Probability Map', icon: Activity, color: '#3B82F6', badge: null },
                            { id: 'mask', label: 'Binary Mask', icon: Layers, color: '#EAB308', badge: null },
                            { id: 'original', label: 'Original', icon: FileImage, color: '#49C6C8', badge: null },
                          ];
                      return tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeViewTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveViewTab(tab.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '6px 10px',
                              borderRadius: '5px',
                              backgroundColor: isActive ? 'rgba(73, 198, 200, 0.15)' : 'transparent',
                              border: isActive ? '1px solid #49C6C8' : '1px solid transparent',
                              color: isActive ? '#49C6C8' : '#A7AFB8',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 120ms ease',
                            }}
                          >
                            <Icon size={13} style={{ color: isActive ? '#49C6C8' : '#6B7280' }} />
                            <span>{tab.label}</span>
                            {tab.badge && (
                              <span
                                style={{
                                  fontSize: '0.62rem',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  backgroundColor: isActive ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.06)',
                                  border: `1px solid ${tab.badgeColor}66`,
                                  color: tab.badgeColor,
                                  fontFamily: 'monospace',
                                  fontWeight: 700,
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {tab.badge}
                              </span>
                            )}
                          </button>
                        );
                      });
                    })()}
                  </div>

                  <button
                    onClick={() => setActiveModalImage(getActiveViewUrl())}
                    title="Inspect Fullscreen"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#A7AFB8',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Maximize2 size={15} />
                  </button>
                </div>

                {/* Visual Viewport */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '340px',
                    maxHeight: '460px',
                    padding: '16px',
                    backgroundColor: '#0A0B0D',
                    position: 'relative',
                  }}
                >
                  <img
                    src={getActiveViewUrl()}
                    alt={`AI Result: ${activeViewTab}`}
                    onClick={() => setActiveModalImage(getActiveViewUrl())}
                    onError={(e) => {
                      // Fallback to mask if annotated composite or probability map is generating
                      if (activeViewTab !== 'mask') {
                        e.target.src = manualAnalysisApi.getMaskUrl(jobId);
                      }
                    }}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '420px',
                      objectFit: 'contain',
                      borderRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                      cursor: 'zoom-in',
                    }}
                  />

                  {/* Context-aware Legend Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '20px',
                      right: '20px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(10, 11, 13, 0.88)',
                      border: '1px solid #25292F',
                      backdropFilter: 'blur(6px)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.72rem',
                      color: '#E7EAEE',
                    }}
                  >
                    {activeViewTab === 'vv' && (
                      <>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#38BDF8' }} />
                        <span style={{ fontWeight: 600 }}>VV Polarization: Co-polarized backscatter (surface roughness & wave damping)</span>
                      </>
                    )}
                    {activeViewTab === 'vh' && (
                      <>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#818CF8' }} />
                        <span style={{ fontWeight: 600 }}>VH Polarization: Cross-polarized backscatter (volume scattering & texture)</span>
                      </>
                    )}
                    {activeViewTab === 'annotated' && (
                      <>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#EF4444' }} />
                        <span style={{ fontWeight: 600 }}>Oil Spill Footprint (Annotated)</span>
                      </>
                    )}
                    {activeViewTab === 'probability' && (
                      <>
                        <div
                          style={{
                            width: '40px',
                            height: '8px',
                            borderRadius: '2px',
                            background: 'linear-gradient(to right, #000004, #51127c, #b73779, #fc8961, #fcfdbf)',
                          }}
                        />
                        <span style={{ fontWeight: 600 }}>0.0 (Clean) → 1.0 (Oil)</span>
                      </>
                    )}
                    {activeViewTab === 'mask' && (
                      <>
                        <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#FFFFFF' }} />
                        <span style={{ fontWeight: 600 }}>Binary 0 / 255 Foreground</span>
                      </>
                    )}
                    {activeViewTab === 'original' && (
                      <>
                        <span style={{ fontWeight: 600, color: '#49C6C8' }}>Source Optical Raster</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* FILE INFORMATION CARD (BEFORE ANALYSIS) */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '10px',
                  backgroundColor: '#121417',
                  border: '1px solid #25292F',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid #25292F',
                    backgroundColor: '#171A1E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={16} style={{ color: '#A855F7' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E7EAEE' }}>
                      FILE INFORMATION
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#34D399' }}>
                    <CheckCircle2 size={14} />
                    <span>Validated</span>
                  </div>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Filename</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE', wordBreak: 'break-all', textAlign: 'right', maxWidth: '240px' }}>
                      {fileMetadata?.filename || selectedFile?.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Format</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE' }}>
                      {fileMetadata?.format}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Size</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE' }}>
                      {formatFileSize(fileMetadata?.sizeBytes || selectedFile?.size)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Dimensions</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE', fontFamily: 'monospace' }}>
                      {fileMetadata?.width} × {fileMetadata?.height} px
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Channels / Bands</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: inputDescriptor.isSar ? '#38BDF8' : inputDescriptor.inferenceSupported ? '#49C6C8' : '#EF4444', fontFamily: 'monospace' }}>
                      {inputDescriptor.channelCount} Channel{inputDescriptor.channelCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Modality</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: inputDescriptor.isSar ? '#38BDF8' : '#E7EAEE' }}>
                      {inputDescriptor.isSar
                        ? 'SAR Dual-Polarization'
                        : inputDescriptor.inputState === INPUT_STATES.UNCLASSIFIED_2CH
                        ? '2-Channel Raster'
                        : inputDescriptor.inputState === INPUT_STATES.SINGLE_CHANNEL
                        ? '1-Channel Grayscale'
                        : inputDescriptor.inputState === INPUT_STATES.SENTINEL2
                        ? 'Sentinel-2 Multispectral'
                        : 'Optical RGB'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Polarization</span>
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: inputDescriptor.isSar ? '#38BDF8' : isTwoChannelUnclassified ? '#F59E0B' : '#9CA3AF',
                        fontFamily: 'monospace',
                      }}
                    >
                      {inputDescriptor.isSar ? 'VV + VH' : isTwoChannelUnclassified ? 'NOT ESTABLISHED' : 'N/A'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Sensor</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE' }}>
                      {inputDescriptor.isSar
                        ? 'Sentinel-1 SAR'
                        : inputDescriptor.inputState === INPUT_STATES.SENTINEL2
                        ? 'Sentinel-2 MSI'
                        : 'Optical Sensor'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                    <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Inference</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        backgroundColor: inputDescriptor.inferenceSupported
                          ? 'rgba(52, 211, 153, 0.15)'
                          : isTwoChannelUnclassified
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                        color: inputDescriptor.inferenceSupported
                          ? '#34D399'
                          : isTwoChannelUnclassified
                          ? '#FBBF24'
                          : '#F87171',
                      }}
                    >
                      {inputDescriptor.inferenceSupported
                        ? 'SUPPORTED'
                        : isTwoChannelUnclassified
                        ? 'WAITING FOR SOURCE DECLARATION'
                        : 'UNSUPPORTED'}
                    </span>
                  </div>

                  {inputDescriptor.inferenceSupported && inputDescriptor.selectedModelId && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                      <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Model</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#49C6C8', fontFamily: 'monospace' }}>
                        {inputDescriptor.selectedModelId}
                      </span>
                    </div>
                  )}

                  {inputDescriptor.isSar && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                      <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Source Identification</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#BAE6FD' }}>
                        {fileMetadata?.sourceIdentification === 'USER_DECLARED'
                          ? 'Declared'
                          : fileMetadata?.sourceIdentification === 'DATASET_VERIFIED'
                          ? 'Dataset Verified'
                          : 'Metadata Verified'}
                      </span>
                    </div>
                  )}

                  {fileMetadata?.isTiff && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                        <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Data Type / Depth</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE', fontFamily: 'monospace' }}>
                          {fileMetadata?.tiffMetadata?.dtype || 'uint8'} ({fileMetadata?.tiffMetadata?.bitDepth || 8}-bit)
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                        <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Compression</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE', fontFamily: 'monospace' }}>
                          {fileMetadata?.tiffMetadata?.compression || 'NONE'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                        <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Photometric</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE', fontFamily: 'monospace' }}>
                          {fileMetadata?.tiffMetadata?.photometric || 'MINISBLACK'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                        <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>NoData Value</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE', fontFamily: 'monospace' }}>
                          {fileMetadata?.tiffMetadata?.nodata != null ? String(fileMetadata.tiffMetadata.nodata) : 'NONE'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                        <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>GeoTIFF Tagged</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: fileMetadata?.tiffMetadata?.isGeoTiff ? '#34D399' : '#9CA3AF' }}>
                          {fileMetadata?.tiffMetadata?.isGeoTiff ? 'YES (Valid GeoTIFF)' : 'NO (Standard TIFF)'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                        <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Coordinate System</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE', fontFamily: 'monospace' }}>
                          {fileMetadata?.tiffMetadata?.crs || fileMetadata?.crs || 'UNPROJECTED'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                        <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Geolocation Status</span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            backgroundColor: fileMetadata?.geolocationStatus === 'ESTABLISHED' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(107, 114, 128, 0.2)',
                            color: fileMetadata?.geolocationStatus === 'ESTABLISHED' ? '#34D399' : '#9CA3AF',
                          }}
                        >
                          {fileMetadata?.geolocationStatus || 'NOT_ESTABLISHED'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #171A1E' }}>
                        <span style={{ fontSize: '0.82rem', color: '#A7AFB8' }}>Spatial Resolution</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E7EAEE', fontFamily: 'monospace' }}>
                          {(() => {
                            const res = fileMetadata?.tiffMetadata?.resolution;
                            const crs = fileMetadata?.tiffMetadata?.crs || fileMetadata?.crs || '';
                            if (!res) return 'NOT ESTABLISHED';
                            const rx = Array.isArray(res) ? res[0] : res.x;
                            const ry = Array.isArray(res) ? res[1] : res.y;
                            if (rx == null || isNaN(Number(rx))) return 'NOT ESTABLISHED';
                            const numX = Number(rx);
                            const numY = Number(ry);
                            const isGeographic = String(crs).includes('4326') || String(crs).toUpperCase().includes('WGS 84') || Math.abs(numX) < 0.1;
                            if (isGeographic) {
                              const approxMeters = Math.round(Math.abs(numX) * 111320);
                              return `${Math.abs(numX).toFixed(8)}° × ${Math.abs(numY).toFixed(8)}° (~${approxMeters} m × ~${approxMeters} m)`;
                            }
                            return `${Math.abs(numX).toFixed(2)} m × ${Math.abs(numY).toFixed(2)} m`;
                          })()}
                        </span>
                      </div>
                      {/* Phase 15.2: IMAGE DISPLAY INFORMATION EXPANDABLE SECTION */}
                      <div
                        style={{
                          marginTop: '8px',
                          borderTop: '1px solid #25292F',
                          paddingTop: '12px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setShowDisplayInfo(!showDisplayInfo)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#171A1E',
                            border: '1px solid #25292F',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            color: '#E7EAEE',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Activity size={14} style={{ color: '#F59E0B' }} />
                            <span>IMAGE DISPLAY INFORMATION</span>
                          </div>
                          {showDisplayInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {showDisplayInfo && (
                          <div
                            style={{
                              marginTop: '8px',
                              backgroundColor: 'rgba(18, 20, 23, 0.7)',
                              border: '1px solid #25292F',
                              borderRadius: '6px',
                              padding: '12px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1C2025', paddingBottom: '4px' }}>
                              <span style={{ color: '#9CA3AF' }}>Pixel Range</span>
                              <span style={{ color: '#E7EAEE', fontWeight: 600 }}>
                                {fileMetadata?.displayStats?.min !== undefined && fileMetadata?.displayStats?.max !== undefined
                                  ? `${fileMetadata.displayStats.min} – ${fileMetadata.displayStats.max}`
                                  : 'NOT_AVAILABLE'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1C2025', paddingBottom: '4px' }}>
                              <span style={{ color: '#9CA3AF' }}>Unique Values</span>
                              <span style={{ color: '#E7EAEE', fontWeight: 600 }}>
                                {fileMetadata?.displayStats?.uniqueValueCount ?? 'NOT_AVAILABLE'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1C2025', paddingBottom: '4px' }}>
                              <span style={{ color: '#9CA3AF' }}>Mean</span>
                              <span style={{ color: '#E7EAEE', fontWeight: 600 }}>
                                {fileMetadata?.displayStats?.mean ?? 'NOT_AVAILABLE'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1C2025', paddingBottom: '4px' }}>
                              <span style={{ color: '#9CA3AF' }}>Median</span>
                              <span style={{ color: '#E7EAEE', fontWeight: 600 }}>
                                {fileMetadata?.displayStats?.median ?? 'NOT_AVAILABLE'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1C2025', paddingBottom: '4px' }}>
                              <span style={{ color: '#9CA3AF' }}>P02</span>
                              <span style={{ color: '#E7EAEE', fontWeight: 600 }}>
                                {fileMetadata?.displayStats?.p02 ?? 'NOT_AVAILABLE'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1C2025', paddingBottom: '4px' }}>
                              <span style={{ color: '#9CA3AF' }}>P98</span>
                              <span style={{ color: '#E7EAEE', fontWeight: 600 }}>
                                {fileMetadata?.displayStats?.p98 ?? 'NOT_AVAILABLE'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1C2025', paddingBottom: '4px' }}>
                              <span style={{ color: '#9CA3AF' }}>Representation</span>
                              <span style={{ color: '#38BDF8', fontWeight: 600 }}>
                                {fileMetadata?.representation || 'GRAYSCALE'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1C2025', paddingBottom: '4px' }}>
                              <span style={{ color: '#9CA3AF' }}>Normalization</span>
                              <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                                {fileMetadata?.normalization || 'PERCENTILE_STRETCH'}
                              </span>
                            </div>

                            {fileMetadata?.displayStats?.isConstant && (
                              <div
                                style={{
                                  marginTop: '4px',
                                  padding: '8px',
                                  borderRadius: '4px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.35)',
                                  color: '#F87171',
                                  fontSize: '0.72rem',
                                  lineHeight: '1.3',
                                }}
                              >
                                <strong>CONSTANT RASTER:</strong> All valid pixels have the same value. No meaningful contrast can be generated.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── STAGE 4A: SOURCE SELECTION & ACTION BUTTON ───────────── */}
          {(uploadState === UPLOAD_STATES.READY_FOR_ANALYSIS || uploadState === UPLOAD_STATES.PREVIEW_READY) && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '24px',
                borderRadius: '10px',
                backgroundColor: '#121417',
                border: '1px solid #25292F',
                gap: '20px',
              }}
            >
              {inputDescriptor.isSar ? (
                <>
                  {/* Section 17: SAR Status Card */}
                  <div
                    style={{
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid #38BDF8',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      color: '#38BDF8',
                    }}
                  >
                    <ShieldCheck size={24} style={{ flexShrink: 0, marginTop: '2px', color: '#38BDF8' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '4px', color: '#E7EAEE' }}>
                        SENTINEL-1 DUAL-POLARIZATION SAR DETECTED (VV + VH)
                      </div>
                      <div style={{ fontSize: '0.78rem', lineHeight: '1.5', color: '#BAE6FD', marginBottom: '8px' }}>
                        Verified 2-channel polarimetric radar raster. Auto-routed to production checkpoint <code style={{ color: '#38BDF8' }}>unet-dual-pol-sar-v09d-residual-loss</code>. Ready for inference and footprint polygonization.
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>
                          POLARIZATION: {fileMetadata?.polarizationStatus || 'ESTABLISHED'} (VV+VH)
                        </span>
                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(56, 189, 248, 0.2)', color: '#38BDF8', fontWeight: 700, fontFamily: 'monospace' }}>
                          SENSOR: SENTINEL-1 C-BAND SAR
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 18: Auto-Selected Model Card */}
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#E7EAEE', marginBottom: '4px' }}>
                      Selected Deep Learning Model — Auto-Routed Dual-Pol SAR
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#A7AFB8', marginBottom: '12px' }}>
                      The radar pipeline automatically selects the specialized SAR U-Net. Optical RGB models are excluded for polarimetric data.
                    </div>
                    <div
                      style={{
                        padding: '16px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(56, 189, 248, 0.08)',
                        border: '1px solid #38BDF8',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#38BDF8' }}>
                            Sentinel-1 Dual-Pol SAR
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>2-Channel C-Band SAR (VV + VH)</div>
                        </div>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(56, 189, 248, 0.2)',
                            color: '#38BDF8',
                            fontFamily: 'monospace',
                            fontWeight: 700,
                          }}
                        >
                          unet-dual-pol-sar-v09d-residual-loss
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#BAE6FD', lineHeight: '1.4' }}>
                        Dual-polarization Sentinel-1 radar backscatter imagery. Verified production checkpoint unet-dual-pol-sar-v09d-residual-loss.
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#34D399', fontWeight: 600 }}>
                        <CheckCircle2 size={13} />
                        <span>Verified Checkpoint (92.8% IoU)</span>
                      </div>
                    </div>
                  </div>

                  {/* Temporal Reference Card */}
                  <div
                    style={{
                      backgroundColor: fileMetadata?.temporalReference?.isAuthoritative
                        ? 'rgba(56, 189, 248, 0.08)'
                        : 'rgba(245, 158, 11, 0.08)',
                      border: `1px solid ${fileMetadata?.temporalReference?.isAuthoritative ? '#38BDF8' : '#F59E0B'}`,
                      borderRadius: '8px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} color={fileMetadata?.temporalReference?.isAuthoritative ? '#38BDF8' : '#F59E0B'} />
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E7EAEE', letterSpacing: '0.04em' }}>
                          TEMPORAL REFERENCE & HISTORICAL AIS ANCHOR
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: fileMetadata?.temporalReference?.isAuthoritative ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: fileMetadata?.temporalReference?.isAuthoritative ? '#38BDF8' : '#FBBF24',
                        }}
                      >
                        {fileMetadata?.temporalReference?.isAuthoritative
                          ? (fileMetadata.temporalReference.source === 'SENTINEL1_PRODUCT_METADATA' ? 'AUTHENTIC S1 SAFE METADATA' : 'AUTHENTIC RASTER METADATA')
                          : 'ACQUISITION TIME REQUIRED FOR AIS'}
                      </span>
                    </div>

                    {fileMetadata?.temporalReference?.isAuthoritative ? (
                      <div style={{ fontSize: '0.78rem', color: '#BAE6FD', lineHeight: '1.4' }}>
                        Authoritative acquisition time detected: <strong style={{ color: '#F0F9FF', fontFamily: 'monospace' }}>{fileMetadata.temporalReference.timestamp}</strong>
                        {fileMetadata.sourceProduct?.platform && <span> ({fileMetadata.sourceProduct.platform})</span>}
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
                          Historical AIS query window [T₀ - 24h, T₀ + 24h] will anchor automatically to this authentic observation timestamp.
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.78rem', color: '#FDE68A', lineHeight: '1.4' }}>
                          No authentic acquisition timestamp was found in this raster's metadata. To enable historical AIS vessel correlation [T₀ - 24h, T₀ + 24h], provide the acquisition timestamp in UTC ISO-8601:
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="text"
                            value={analystTimestamp}
                            onChange={(e) => setAnalystTimestamp(e.target.value)}
                            placeholder="e.g. 2024-05-15T08:30:00Z"
                            style={{
                              flex: 1,
                              backgroundColor: '#1E293B',
                              border: '1px solid #475569',
                              borderRadius: '6px',
                              color: '#F8FAFC',
                              fontSize: '0.82rem',
                              fontFamily: 'monospace',
                              padding: '8px 12px',
                              outline: 'none',
                            }}
                          />
                          {analystTimestamp && (
                            <button
                              type="button"
                              onClick={() => setAnalystTimestamp('')}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                              }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                          Optional for visual inspection and segmentation, but strictly required for historical vessel attribution. Never uses upload or server time.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SAR Action Button */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <button
                      onClick={handleAnalyzeClick}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 40px',
                        borderRadius: '6px',
                        backgroundColor: '#38BDF8',
                        color: '#0A0B0D',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 120ms ease',
                        boxShadow: '0 2px 10px rgba(56, 189, 248, 0.25)',
                      }}
                    >
                      <Scan size={18} />
                      ANALYZE IMAGE
                    </button>
                    <div style={{ fontSize: '0.75rem', color: '#BAE6FD' }}>
                      Execute unet-dual-pol-sar-v09d-residual-loss
                    </div>
                  </div>
                </>
              ) : inputDescriptor.inputState === INPUT_STATES.UNCLASSIFIED_2CH ? (
                /* Unclassified 2-channel raster waiting for declaration */
                <div
                  style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid #F59E0B',
                    borderRadius: '8px',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    color: '#FBBF24',
                  }}
                >
                  <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '4px' }}>
                      2-CHANNEL RASTER DETECTED — POLARIZATION NOT ESTABLISHED
                    </div>
                    <div style={{ fontSize: '0.78rem', lineHeight: '1.5', color: '#FDE68A', marginBottom: '12px' }}>
                      This TIFF contains 2 channels, but internal metadata does not certify VV/VH polarization tags. To proceed with dual-pol SAR segmentation, declare this raster as genuine Sentinel-1 VV+VH imagery.
                    </div>
                    <button
                      type="button"
                      disabled={isDeclaring}
                      onClick={handleDeclareSentinel1}
                      style={{
                        padding: '8px 18px',
                        borderRadius: '4px',
                        backgroundColor: '#F59E0B',
                        color: '#000',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: isDeclaring ? 'wait' : 'pointer',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                      }}
                    >
                      {isDeclaring ? 'Declaring...' : 'DECLARE AS SENTINEL-1 (VV + VH)'}
                    </button>
                    <div style={{ marginTop: '10px', fontSize: '0.72rem', color: '#FDE68A' }}>
                      Waiting for source declaration before AI inference can be configured.
                    </div>
                  </div>
                </div>
              ) : inputDescriptor.inputState === INPUT_STATES.SINGLE_CHANNEL ? (
                /* Single Channel Grayscale */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div
                    style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid #F59E0B',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      color: '#FBBF24',
                    }}
                  >
                    <AlertTriangle size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '4px' }}>
                        INPUT VISUALIZATION READY — INFERENCE UNSUPPORTED (1-CHANNEL GRAYSCALE)
                      </div>
                      <div style={{ fontSize: '0.78rem', lineHeight: '1.5', color: '#FDE68A' }}>
                        Preview available. This TIFF contains 1 grayscale channel. The current optical RGB production models require 3-channel RGB input. AI inference is not executed.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <button
                      disabled
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 40px',
                        borderRadius: '6px',
                        backgroundColor: '#374151',
                        color: '#9CA3AF',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        border: 'none',
                        cursor: 'not-allowed',
                      }}
                    >
                      <Lock size={18} />
                      INFERENCE BLOCKED (1 CHANNEL GRAYSCALE)
                    </button>
                    <div style={{ fontSize: '0.75rem', color: '#F87171' }}>
                      Optical RGB inference blocked: 1-channel grayscale TIFF is unsupported for 3-channel RGB models.
                    </div>
                  </div>
                </div>
              ) : isFormatInferenceBlocked ? (
                /* Blocked incompatible raster */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div
                    style={{
                      backgroundColor: 'rgba(100, 116, 139, 0.12)',
                      border: '1px solid #475569',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      color: '#94A3B8',
                    }}
                  >
                    <Lock size={24} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '4px', color: '#CBD5E1' }}>
                        AI INFERENCE NOT AVAILABLE — INCOMPATIBLE RASTER FORMAT
                      </div>
                      <div style={{ fontSize: '0.78rem', lineHeight: '1.5', color: '#94A3B8' }}>
                        No production model supports this raster structure ({inputDescriptor.channelCount}-channel, {inputDescriptor.inputState}).
                        Visualization and metadata inspection are available; inference is blocked by the format-aware model router.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <button
                      disabled
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 40px',
                        borderRadius: '6px',
                        backgroundColor: '#374151',
                        color: '#9CA3AF',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        border: 'none',
                        cursor: 'not-allowed',
                      }}
                    >
                      <Lock size={18} />
                      INFERENCE BLOCKED (UNSUPPORTED FORMAT)
                    </button>
                  </div>
                </div>
              ) : (
                /* Optical RGB Formats */
                inputDescriptor.isOpticalRgb ? (
                  <>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#9CA3AF', marginBottom: '8px', letterSpacing: '0.04em' }}>
                        SOURCE
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                          gap: '12px',
                        }}
                      >
                        {visibleSourceOptions.map((opt) => {
                          const isSelected = selectedSourceType === opt.id || (opt.id === 'RGB_SATELLITE' && selectedSourceType === 'SATELLITE_RGB');
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setSelectedSourceType(opt.id);
                                setErrorMessage(null);
                              }}
                              style={{
                                padding: '16px',
                                borderRadius: '8px',
                                backgroundColor: isSelected ? 'rgba(73, 198, 200, 0.1)' : '#171A1E',
                                border: isSelected ? '1px solid #49C6C8' : '1px solid #25292F',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                transition: 'all 120ms ease',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: isSelected ? '#49C6C8' : '#E7EAEE' }}>
                                  {opt.title}
                                </span>
                                {isSelected && <CheckCircle2 size={16} color="#49C6C8" />}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#A7AFB8', lineHeight: '1.4' }}>
                                {opt.description}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Auto-Selected Model Card */}
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#9CA3AF', marginBottom: '6px', letterSpacing: '0.04em' }}>
                        MODEL
                      </div>
                      <div
                        style={{
                          padding: '16px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(73, 198, 200, 0.08)',
                          border: '1px solid #49C6C8',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#34D399', letterSpacing: '0.04em', marginBottom: '2px' }}>
                              AUTO-SELECTED
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#49C6C8', fontFamily: 'monospace' }}>
                              {selectedSourceType === 'RGB_SATELLITE' || selectedSourceType === 'SATELLITE_RGB'
                                ? 'mados-resnet34-rgb-v1'
                                : 'kerf-resnet34-focaldice-v1'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(52, 211, 153, 0.15)',
                                color: '#34D399',
                                fontWeight: 700,
                              }}
                            >
                              Inference: SUPPORTED
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#A7AFB8', lineHeight: '1.4' }}>
                          {selectedSourceType === 'RGB_SATELLITE' || selectedSourceType === 'SATELLITE_RGB'
                            ? 'Medium/high-resolution true-color satellite optical imagery with broad marine coverage. Verified production checkpoint.'
                            : 'High-resolution UAV RGB photography. Calibrated for surface oil sheen and thick oil features. Verified production checkpoint.'}
                        </div>
                      </div>
                    </div>

                    {/* Temporal Reference Card */}
                    <div
                      style={{
                        backgroundColor: fileMetadata?.temporalReference?.isAuthoritative
                          ? 'rgba(73, 198, 200, 0.08)'
                          : 'rgba(245, 158, 11, 0.08)',
                        border: `1px solid ${fileMetadata?.temporalReference?.isAuthoritative ? '#49C6C8' : '#F59E0B'}`,
                        borderRadius: '8px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Clock size={16} color={fileMetadata?.temporalReference?.isAuthoritative ? '#49C6C8' : '#F59E0B'} />
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E7EAEE', letterSpacing: '0.04em' }}>
                            TEMPORAL REFERENCE & HISTORICAL AIS ANCHOR
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor: fileMetadata?.temporalReference?.isAuthoritative ? 'rgba(73, 198, 200, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: fileMetadata?.temporalReference?.isAuthoritative ? '#49C6C8' : '#FBBF24',
                          }}
                        >
                          {fileMetadata?.temporalReference?.isAuthoritative
                            ? 'AUTHENTIC RASTER METADATA'
                            : 'ACQUISITION TIME REQUIRED FOR AIS'}
                        </span>
                      </div>

                      {fileMetadata?.temporalReference?.isAuthoritative ? (
                        <div style={{ fontSize: '0.78rem', color: '#CCFBF1', lineHeight: '1.4' }}>
                          Authoritative acquisition time detected: <strong style={{ color: '#F0FDFA', fontFamily: 'monospace' }}>{fileMetadata.temporalReference.timestamp}</strong>
                          <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
                            Historical AIS query window [T₀ - 24h, T₀ + 24h] will anchor automatically to this authentic observation timestamp.
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ fontSize: '0.78rem', color: '#FDE68A', lineHeight: '1.4' }}>
                            No authentic acquisition timestamp was found in this image. To enable historical AIS vessel correlation [T₀ - 24h, T₀ + 24h], provide the acquisition timestamp in UTC ISO-8601:
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="text"
                              value={analystTimestamp}
                              onChange={(e) => setAnalystTimestamp(e.target.value)}
                              placeholder="e.g. 2024-05-15T08:30:00Z"
                              style={{
                                flex: 1,
                                backgroundColor: '#1E293B',
                                border: '1px solid #475569',
                                borderRadius: '6px',
                                color: '#F8FAFC',
                                fontSize: '0.82rem',
                                fontFamily: 'monospace',
                                padding: '8px 12px',
                                outline: 'none',
                              }}
                            />
                            {analystTimestamp && (
                              <button
                                type="button"
                                onClick={() => setAnalystTimestamp('')}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#94A3B8',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                }}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                            Optional for visual inspection and segmentation, but strictly required for historical vessel attribution. Never uses upload or server time.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Optical Action Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <button
                        onClick={handleAnalyzeClick}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 40px',
                          borderRadius: '6px',
                          backgroundColor: '#49C6C8',
                          color: '#0A0B0D',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 120ms ease',
                          boxShadow: '0 2px 10px rgba(73, 198, 200, 0.25)',
                        }}
                      >
                        <Scan size={18} />
                        ANALYZE IMAGE
                      </button>
                      <div style={{ fontSize: '0.75rem', color: '#A7AFB8' }}>
                        Execute {selectedSourceType === 'RGB_SATELLITE' || selectedSourceType === 'SATELLITE_RGB' ? 'mados-resnet34-rgb-v1' : 'kerf-resnet34-focaldice-v1'}
                      </div>
                    </div>
                  </>
                ) : (
                  /* Sentinel-2 / Generic Multispectral Formats */
                  <>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#E7EAEE', marginBottom: '4px' }}>
                        Select Optical Imagery Source — Format-Aware Routing (Phase 15.3)
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#A7AFB8' }}>
                        Only models compatible with the uploaded raster format ({fileMetadata?.inputFormat || 'RGB_RASTER'},
                        {' '}{fileMetadata?.channelCount ?? 3}-ch) are shown.
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '12px',
                      }}
                    >
                      {(visibleSourceOptions.length > 0 ? visibleSourceOptions : SOURCE_OPTIONS).map((opt) => {
                        const isSelected = selectedSourceType === opt.id;
                        const isS2Warning = opt.id === 'SENTINEL_2' && isPureRGBFile(fileMetadata, selectedFile);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSelectedSourceType(opt.id);
                              if (opt.id === 'SENTINEL_2' && isPureRGBFile(fileMetadata, selectedFile)) {
                                setErrorMessage('Selected Sentinel-2 requires multispectral bands. Uploaded file contains RGB only.');
                              } else {
                                setErrorMessage(null);
                              }
                            }}
                            style={{
                              padding: '16px',
                              borderRadius: '8px',
                              backgroundColor: isSelected
                                ? isS2Warning
                                  ? 'rgba(239, 68, 68, 0.08)'
                                  : 'rgba(73, 198, 200, 0.1)'
                                : '#171A1E',
                              border: isSelected
                                ? isS2Warning
                                  ? '1px solid #EF4444'
                                  : '1px solid #49C6C8'
                                : '1px solid #25292F',
                              textAlign: 'left',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              transition: 'all 120ms ease',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div
                                  style={{
                                    fontSize: '0.88rem',
                                    fontWeight: 700,
                                    color: isSelected ? (isS2Warning ? '#EF4444' : '#49C6C8') : '#E7EAEE',
                                  }}
                                >
                                  {opt.title}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{opt.subtitle}</div>
                              </div>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '2px 6px',
                                  borderRadius: '3px',
                                  backgroundColor: isSelected ? 'rgba(73, 198, 200, 0.2)' : '#25292F',
                                  color: isSelected ? '#49C6C8' : '#A7AFB8',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {opt.modelId}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.74rem', color: '#A7AFB8', lineHeight: '1.4' }}>
                              {opt.description}
                            </div>

                            {isS2Warning && isSelected && (
                              <div
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#F87171',
                                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  marginTop: '4px',
                                }}
                              >
                                ⚠ Requires multispectral bands. Uploaded file contains RGB only.
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Optical Action Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <button
                        onClick={handleAnalyzeClick}
                        disabled={isSentinel2Invalid}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 40px',
                          borderRadius: '6px',
                          backgroundColor: isSentinel2Invalid ? '#374151' : '#49C6C8',
                          color: isSentinel2Invalid ? '#9CA3AF' : '#0A0B0D',
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          border: 'none',
                          cursor: isSentinel2Invalid ? 'not-allowed' : 'pointer',
                          transition: 'all 120ms ease',
                          boxShadow: isSentinel2Invalid ? 'none' : '0 2px 10px rgba(73, 198, 200, 0.25)',
                        }}
                      >
                        <Scan size={18} />
                        ANALYZE IMAGE
                      </button>
                      <div style={{ fontSize: '0.75rem', color: isSentinel2Invalid ? '#F87171' : '#A7AFB8' }}>
                        {isSentinel2Invalid
                          ? 'Sentinel-2 analysis blocked: uploaded file contains RGB only.'
                          : `Execute ${SOURCE_OPTIONS.find((s) => s.id === selectedSourceType)?.modelId || 'optical model'}`}
                      </div>
                    </div>
                  </>
                )
              )}
            </div>
          )}

          {/* ── STAGE 4B: COMPLETED RESULTS VIEW ────────────────────── */}
          {hasAnalysisResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* ── METRIC CARDS GRID ─────────────────────────────────── */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '18px',
                }}
              >
                {(() => {
                  const isSarResult = Boolean(
                    inputDescriptor.isSar ||
                    analysisResult?.modelId === 'unet-dual-pol-sar-v09d-residual-loss' ||
                    analysisResult?.modality === 'SAR_DUAL_POL' ||
                    analysisResult?.model?.modelId === 'unet-dual-pol-sar-v09d-residual-loss' ||
                    fileMetadata?.isSarDualPol
                  );

                  if (isSarResult) {
                    const fgPixels = analysisResult.segmentation?.foreground_pixels || 0;
                    const isDetected = fgPixels >= 10;
                    const areaKm2 = analysisResult.geospatial?.physicalAreaKm2;
                    const areaM2 = analysisResult.geospatial?.physicalAreaM2 || (areaKm2 != null ? Math.round(areaKm2 * 1e6) : null);
                    return (
                      <>
                        {/* 1. SAR DETECTION CARD */}
                        <div
                          style={{
                            backgroundColor: '#121417',
                            borderRadius: '10px',
                            border: '1px solid #25292F',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                          }}
                        >
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38BDF8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            OIL SPILL DETECTION (SAR)
                          </div>
                          <div
                            style={{
                              fontSize: '1.25rem',
                              fontWeight: 800,
                              color: isDetected ? '#EF4444' : '#34D399',
                              fontFamily: 'monospace',
                            }}
                          >
                            {isDetected ? 'OIL SPILL DETECTED' : 'CLEAN OCEAN'}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#E7EAEE' }}>
                            Detected Area:{' '}
                            <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                              {areaKm2 != null ? `${areaKm2.toFixed(4)} km² (${areaM2.toLocaleString()} m²)` : `${fgPixels.toLocaleString()} px`}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                            Components: {analysisResult.segmentation?.connected_component_count ?? 0} · Operating Threshold: {analysisResult.model?.operatingThreshold ?? '0.50'}
                          </div>
                        </div>

                        {/* 2. SAR POLARIZATION & SENSOR CARD */}
                        <div
                          style={{
                            backgroundColor: '#121417',
                            borderRadius: '10px',
                            border: '1px solid #25292F',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                          }}
                        >
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38BDF8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            POLARIZATION & SENSOR
                          </div>
                          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#E7EAEE', fontFamily: 'monospace' }}>
                            Sentinel-1 C-Band (VV + VH)
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#A7AFB8' }}>
                            <span>Oil Type:</span>
                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '3px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', fontWeight: 700, fontFamily: 'monospace' }}>
                              NOT_ESTABLISHED
                            </span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#6B7280', lineHeight: 1.4 }}>
                            Radar backscatter measures surface roughness damping; cannot distinguish crude vs refined fractions.
                          </div>
                        </div>
                      </>
                    );
                  }

                  return (
                    <>
                      {/* 1. CLASSIFICATION CARD */}
                      <div
                        style={{
                          backgroundColor: '#121417',
                          borderRadius: '10px',
                          border: '1px solid #25292F',
                          padding: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#49C6C8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          IMAGE CLASSIFICATION
                        </div>
                        <div
                          style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            color:
                              analysisResult.classification?.label === 'OIL_SPILL'
                                ? '#EF4444'
                                : analysisResult.classification?.label === 'LOOK_ALIKE'
                                ? '#EAB308'
                                : '#34D399',
                            fontFamily: 'monospace',
                          }}
                        >
                          {analysisResult.classification?.label === 'OIL_SPILL'
                            ? 'OIL SPILL'
                            : analysisResult.classification?.label === 'LOOK_ALIKE'
                            ? 'LOOK-ALIKE'
                            : 'CLEAN OCEAN'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#E7EAEE' }}>
                          Confidence:{' '}
                          <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                            {((analysisResult.classification?.confidence || 0) * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                          Probabilities — Oil: {((analysisResult.classification?.probabilities?.OIL_SPILL || 0) * 100).toFixed(1)}% · Look-Alike: {((analysisResult.classification?.probabilities?.LOOK_ALIKE || 0) * 100).toFixed(1)}% · Clean: {((analysisResult.classification?.probabilities?.CLEAN_OCEAN || 0) * 100).toFixed(1)}%
                        </div>
                      </div>

                      {/* 2. SEGMENTATION CARD */}
                      <div
                        style={{
                          backgroundColor: '#121417',
                          borderRadius: '10px',
                          border: '1px solid #25292F',
                          padding: '20px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#49C6C8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          SEGMENTATION
                        </div>
                        <div
                          style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            color: (analysisResult.segmentation?.foreground_pixels || 0) >= 10 ? '#EF4444' : '#34D399',
                            fontFamily: 'monospace',
                          }}
                        >
                          {(analysisResult.segmentation?.foreground_pixels || 0) >= 10 ? 'DETECTED' : 'NOT DETECTED'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#E7EAEE' }}>
                          Detected Area:{' '}
                          <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                            {((analysisResult.segmentation?.foreground_fraction || 0) * 100).toFixed(2)}%
                          </span>{' '}
                          of image ({analysisResult.segmentation?.foreground_pixels?.toLocaleString()} px)
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                          Components: {analysisResult.segmentation?.connected_component_count ?? 0} · Operating Threshold: {analysisResult.model?.operatingThreshold ?? analysisResult.segmentation?.confidence_threshold ?? '0.50'}
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* 3. PROBABILITY DISTRIBUTION STATS CARD */}
                <div
                  style={{
                    backgroundColor: '#121417',
                    borderRadius: '10px',
                    border: '1px solid #25292F',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3B82F6', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      PROBABILITY STATS
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        color: '#60A5FA',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }}
                    >
                      CALIBRATED
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '6px' }}>
                    <div style={{ backgroundColor: '#171A1E', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#A7AFB8' }}>MIN</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E7EAEE', fontFamily: 'monospace' }}>
                        {(analysisResult.segmentation?.probability_distribution?.min ?? 0).toFixed(4)}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#171A1E', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#A7AFB8' }}>P10</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E7EAEE', fontFamily: 'monospace' }}>
                        {(analysisResult.segmentation?.probability_distribution?.p10 ?? 0).toFixed(4)}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#171A1E', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#A7AFB8' }}>MEDIAN</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E7EAEE', fontFamily: 'monospace' }}>
                        {(analysisResult.segmentation?.probability_distribution?.median ?? 0).toFixed(4)}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#171A1E', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#A7AFB8' }}>MEAN</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E7EAEE', fontFamily: 'monospace' }}>
                        {(analysisResult.segmentation?.probability_distribution?.mean ?? 0).toFixed(4)}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#171A1E', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#A7AFB8' }}>P90</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E7EAEE', fontFamily: 'monospace' }}>
                        {(analysisResult.segmentation?.probability_distribution?.p90 ?? 0).toFixed(4)}
                      </div>
                    </div>
                    <div style={{ backgroundColor: '#171A1E', padding: '8px', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.65rem', color: '#A7AFB8' }}>MAX</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#E7EAEE', fontFamily: 'monospace' }}>
                        {(analysisResult.segmentation?.probability_distribution?.max ?? 0).toFixed(4)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. AI MODEL METADATA CARD */}
                <div
                  style={{
                    backgroundColor: '#121417',
                    borderRadius: '10px',
                    border: '1px solid #25292F',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#49C6C8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      AI MODEL & LINEAGE
                    </div>
                    {analysisResult.model?.checkpointSha256 && (
                      <span
                        style={{
                          fontSize: '0.68rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(52, 211, 153, 0.15)',
                          border: '1px solid rgba(52, 211, 153, 0.4)',
                          color: '#34D399',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        ✓ Verified
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#A7AFB8' }}>
                    Model: <span style={{ color: '#E7EAEE', fontFamily: 'monospace', fontWeight: 600 }}>{analysisResult.model?.modelId || 'N/A'}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#A7AFB8' }}>
                    Source Type: <span style={{ color: '#E7EAEE', fontFamily: 'monospace' }}>{analysisResult.inputMetadata?.sourceType || 'DRONE'} ({analysisResult.inputMetadata?.sourceTypeOrigin || 'USER_SELECTED'})</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#A7AFB8' }}>
                    Checkpoint: <span style={{ color: '#E7EAEE', fontFamily: 'monospace' }} title={analysisResult.model?.checkpointSha256}>{analysisResult.model?.checkpointSha256 ? `${analysisResult.model.checkpointSha256.substring(0, 8)}...${analysisResult.model.checkpointSha256.substring(56)}` : 'N/A'}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#A7AFB8' }}>
                    Mask SHA:{' '}
                    <span style={{ color: '#E7EAEE', fontFamily: 'monospace' }} title={analysisResult.outputFingerprint?.binary_mask_sha256 || analysisResult.segmentation?.mask_sha256}>
                      {(analysisResult.outputFingerprint?.binary_mask_sha256 || analysisResult.segmentation?.mask_sha256)
                        ? `${(analysisResult.outputFingerprint?.binary_mask_sha256 || analysisResult.segmentation?.mask_sha256).substring(0, 8)}...${(analysisResult.outputFingerprint?.binary_mask_sha256 || analysisResult.segmentation?.mask_sha256).substring(56)}`
                        : 'N/A'}
                    </span>
                  </div>
                  {analysisResult.model?.routingReason && (
                    <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: '4px', borderTop: '1px solid #25292F', paddingTop: '6px' }}>
                      Routing: <span style={{ color: '#D1D5DB' }}>{analysisResult.model.routingReason}</span>
                    </div>
                  )}
                </div>

                {/* 5. GEOSPATIAL & PHYSICAL AREA CARD */}
                <div
                  style={{
                    backgroundColor: '#121417',
                    borderRadius: '10px',
                    border: '1px solid #25292F',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#49C6C8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      GEOSPATIAL REFERENCE
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: analysisResult.geospatial?.geolocationStatus === 'ESTABLISHED' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(107, 114, 128, 0.2)',
                        border: analysisResult.geospatial?.geolocationStatus === 'ESTABLISHED' ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid #374151',
                        color: analysisResult.geospatial?.geolocationStatus === 'ESTABLISHED' ? '#34D399' : '#9CA3AF',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }}
                    >
                      {analysisResult.geospatial?.geolocationStatus || 'NOT_ESTABLISHED'}
                    </span>
                  </div>

                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: analysisResult.geospatial?.physicalAreaKm2 != null ? '#EF4444' : '#E7EAEE', fontFamily: 'monospace' }}>
                    {analysisResult.geospatial?.physicalAreaKm2 != null
                      ? `${analysisResult.geospatial.physicalAreaKm2.toFixed(4)} km²`
                      : 'N/A (Unprojected)'}
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#A7AFB8' }}>
                    Physical Area:{' '}
                    {analysisResult.geospatial?.physicalAreaM2 != null ? (
                      <span style={{ color: '#E7EAEE', fontWeight: 600 }}>
                        {analysisResult.geospatial.physicalAreaM2.toLocaleString()} m²
                      </span>
                    ) : (
                      'NOT_ESTABLISHED'
                    )}
                    {analysisResult.geospatial?.physicalAreaKm2 != null && (
                      <span style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(73, 198, 200, 0.15)', color: '#49C6C8', fontWeight: 700 }}>
                        MODEL_DERIVED
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.72rem', color: '#6B7280' }}>
                    CRS: <code style={{ color: '#9CA3AF' }}>{analysisResult.geospatial?.crs || 'UNPROJECTED'}</code>
                    {analysisResult.geospatial?.epsg && ` (EPSG:${analysisResult.geospatial.epsg})`}
                  </div>
                </div>
              </div>

              {/* ── CONNECTED COMPONENT DIAGNOSTICS (IF DETECTED) ──────── */}
              {Array.isArray(analysisResult.segmentation?.components) && analysisResult.segmentation.components.length > 0 && (
                <div
                  style={{
                    backgroundColor: '#121417',
                    borderRadius: '10px',
                    border: '1px solid #25292F',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#E7EAEE', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={16} style={{ color: '#49C6C8' }} />
                    Connected Component Diagnostics ({analysisResult.segmentation.components.length} components detected)
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #25292F', color: '#A7AFB8' }}>
                          <th style={{ padding: '8px' }}>ID</th>
                          <th style={{ padding: '8px' }}>Area (Pixels)</th>
                          <th style={{ padding: '8px' }}>Area (%)</th>
                          <th style={{ padding: '8px' }}>Mean Probability</th>
                          <th style={{ padding: '8px' }}>Max Probability</th>
                          <th style={{ padding: '8px' }}>Bounding Box [y_min, x_min, y_max, x_max]</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.segmentation.components.map((comp, compIdx) => (
                          <tr key={`comp-${comp.component_id ?? comp.id ?? compIdx}`} style={{ borderBottom: '1px solid #171A1E', color: '#E7EAEE', fontFamily: 'monospace' }}>
                            <td style={{ padding: '8px', fontWeight: 600, color: '#49C6C8' }}>#{comp.component_id ?? comp.id ?? compIdx + 1}</td>
                            <td style={{ padding: '8px' }}>{(comp.area_pixels ?? comp.pixel_area)?.toLocaleString()} px</td>
                            <td style={{ padding: '8px' }}>{(((comp.area_fraction ?? comp.area_percentage) || 0) * (comp.area_percentage != null ? 1 : 100)).toFixed(2)}%</td>
                            <td style={{ padding: '8px' }}>{(comp.mean_probability || 0).toFixed(4)}</td>
                            <td style={{ padding: '8px' }}>{(comp.max_probability || 0).toFixed(4)}</td>
                            <td style={{ padding: '8px', color: '#9CA3AF' }}>
                              [{comp.bbox?.join(', ')}]
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── STAGE 2: GEOLOCATION GATE & DOWNSTREAM INVESTIGATION ──── */}
              {analysisResult.geospatial?.geolocationStatus === 'ESTABLISHED' ? (
                <div
                  style={{
                    backgroundColor: '#121417',
                    borderRadius: '10px',
                    border: '1px solid rgba(73, 198, 200, 0.35)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Globe size={18} style={{ color: '#49C6C8' }} />
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#E7EAEE' }}>
                        STAGE 2: DOWNSTREAM GEOSPATIAL INVESTIGATION
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(52, 211, 153, 0.15)',
                        border: '1px solid rgba(52, 211, 153, 0.4)',
                        color: '#34D399',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }}
                    >
                      GEOLOCATION: ESTABLISHED (EPSG:{analysisResult.geospatial?.epsg || 'WGS84'})
                    </span>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: '#A7AFB8', lineHeight: '1.5' }}>
                    Valid geospatial reference and affine transform detected. You can proceed with the downstream pipeline: run a 24-hour Lagrangian ocean hydrodynamic drift hindcast from the modelled spill origin and correlate AIS vessel traffic to identify potential suspects.
                  </div>

                  {investigationError && (
                    <div style={{ fontSize: '0.78rem', color: '#F87171', backgroundColor: 'rgba(239, 68, 68, 0.12)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      {investigationError}
                    </div>
                  )}

                  {!investigationResult && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <button
                        onClick={handleInvestigateClick}
                        disabled={isInvestigating}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 30px',
                          borderRadius: '6px',
                          backgroundColor: '#49C6C8',
                          color: '#0A0B0D',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: isInvestigating ? 'wait' : 'pointer',
                          boxShadow: '0 2px 10px rgba(73, 198, 200, 0.3)',
                          transition: 'all 120ms ease',
                        }}
                      >
                        {isInvestigating ? <LoadingSpinner size="sm" /> : <Navigation size={16} />}
                        {isInvestigating ? 'Executing Drift Hindcast & AIS Correlation...' : 'INVESTIGATE SPILL'}
                      </button>

                      <button
                        onClick={() => navigate(`/analysis/${analysisResult?.analysisId || jobId}`)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '12px 24px',
                          borderRadius: '6px',
                          backgroundColor: '#1E293B',
                          border: '1px solid #38BDF8',
                          color: '#38BDF8',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '0 2px 10px rgba(56, 189, 248, 0.15)',
                          transition: 'all 120ms ease',
                        }}
                      >
                        <Compass size={16} />
                        ANALYSE SPILL
                      </button>

                      {isInvestigating && (
                        <span style={{ fontSize: '0.78rem', color: '#49C6C8', fontFamily: 'monospace' }}>
                          Simulating Lagrangian drift & cross-referencing maritime traffic...
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: '#171A1E',
                    borderRadius: '10px',
                    border: '1px solid #25292F',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F59E0B' }}>
                    <Lock size={18} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#E7EAEE' }}>
                      DOWNSTREAM INVESTIGATION GATED (GEOLOCATION NOT ESTABLISHED)
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#A7AFB8', lineHeight: '1.5' }}>
                    Downstream drift hindcasting and AIS vessel attribution require genuine spatial coordinates and affine transform tags. Because this raster is unprojected (<code style={{ color: '#F59E0B' }}>GEOLOCATION: NOT_ESTABLISHED</code>), geographic positioning and vessel blame cannot be scientifically established. Investigation is locked to prevent fabricating coordinates or vessel liability.
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      disabled
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 22px',
                        borderRadius: '6px',
                        backgroundColor: '#25292F',
                        color: '#6B7280',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'not-allowed',
                      }}
                    >
                      <Lock size={15} />
                      INVESTIGATE SPILL (GATED)
                    </button>

                    <button
                      onClick={() => navigate(`/analysis/${analysisResult?.analysisId || jobId}`)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 22px',
                        borderRadius: '6px',
                        backgroundColor: '#1E293B',
                        border: '1px solid #38BDF8',
                        color: '#38BDF8',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 10px rgba(56, 189, 248, 0.15)',
                        transition: 'all 120ms ease',
                      }}
                    >
                      <Compass size={15} />
                      ANALYSE SPILL
                    </button>
                  </div>
                </div>
              )}

              {/* ── INVESTIGATION RESULTS: MAP & RANKED CANDIDATES TABLE ── */}
              {investigationResult && (
                <div
                  style={{
                    backgroundColor: '#121417',
                    borderRadius: '10px',
                    border: '1px solid #25292F',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    padding: '20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #25292F', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Compass size={18} style={{ color: '#49C6C8' }} />
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#E7EAEE' }}>
                        Investigation Dossier: Modelled Drift Trajectory & Candidate Vessels
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(73, 198, 200, 0.15)',
                        color: '#49C6C8',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }}
                    >
                      ID: {investigationResult.investigationId}
                    </span>
                  </div>

                  {/* Interactive Map View */}
                  <div style={{ height: '360px', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #25292F' }}>
                    <MapView
                      center={[
                        investigationResult.centroid?.latitude || 0,
                        investigationResult.centroid?.longitude || 0,
                      ]}
                      zoom={9}
                      scenarioKey={`inv-${investigationResult.investigationId}`}
                    >
                      {/* Spill Centroid Marker */}
                      {investigationResult.centroid && (
                        <CircleMarker
                          center={[investigationResult.centroid.latitude, investigationResult.centroid.longitude]}
                          radius={8}
                          pathOptions={{ color: '#EF4444', fillColor: '#EF4444', fillOpacity: 0.8 }}
                        >
                          <Popup>
                            <div style={{ fontSize: '0.75rem', color: '#111' }}>
                              <strong>MODEL_DERIVED Spill Footprint</strong><br />
                              Centroid: {investigationResult.centroid.latitude.toFixed(4)}, {investigationResult.centroid.longitude.toFixed(4)}<br />
                              Area: {investigationResult.physicalAreaKm2?.toFixed(3)} km²
                            </div>
                          </Popup>
                        </CircleMarker>
                      )}

                      {/* Drift Trajectory Polyline */}
                      {Array.isArray(investigationResult.driftTrajectory?.backwardPath) &&
                        investigationResult.driftTrajectory.backwardPath.length > 0 && (
                          <Polyline
                            positions={investigationResult.driftTrajectory.backwardPath.map((pt) => [pt.latitude, pt.longitude])}
                            pathOptions={{ color: '#F59E0B', weight: 3, dashArray: '6, 6' }}
                          >
                            <Popup>
                              <div style={{ fontSize: '0.75rem', color: '#111' }}>
                                <strong>24h Hydrodynamic Drift Hindcast</strong><br />
                                Origin: {investigationResult.driftTrajectory.originLat?.toFixed(4)}, {investigationResult.driftTrajectory.originLng?.toFixed(4)}
                              </div>
                            </Popup>
                          </Polyline>
                        )}

                      {/* Candidate Vessels Markers */}
                      {Array.isArray(investigationResult.candidates) &&
                        investigationResult.candidates.map((cand, idx) => {
                          const lat = cand.correlation?.closestCellCoordinates?.latitude ?? cand.evidence?.passingLat ?? cand.evidence?.closestPoint?.latitude ?? cand.latitude;
                          const lng = cand.correlation?.closestCellCoordinates?.longitude ?? cand.evidence?.passingLng ?? cand.evidence?.closestPoint?.longitude ?? cand.longitude;
                          if (lat == null || lng == null) return null;

                          const candName = cand.vessel?.name || cand.vesselName || cand.name || `Vessel #${cand.mmsi}`;
                          const candMmsi = cand.mmsi || cand.vesselId?.mmsi || 'N/A';
                          const candType = cand.vessel?.vesselType || cand.vesselType || 'Commercial';
                          const presenceHours = cand.aisEvidence?.presenceHours || cand.presenceHours || 1;
                          const distKm = cand.correlation?.closestCellDistanceKm ?? cand.evidence?.distanceKm;
                          const distStr = distKm != null ? `${Number(distKm).toFixed(2)} km` : 'N/A';
                          const timeDeltaStr = cand.evidence?.timeDiffHours != null ? `${Number(cand.evidence.timeDiffHours).toFixed(1)} hours` : 'N/A';

                          return (
                            <CircleMarker
                              key={`cand-marker-${cand.mmsi || cand.id || idx}-${idx}`}
                              center={[Number(lat), Number(lng)]}
                              radius={6}
                              pathOptions={{ color: '#7E22CE', fillColor: '#A855F7', fillOpacity: 0.9 }}
                            >
                              <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                                <div style={{ fontFamily: "monospace", fontSize: '11px', lineHeight: 1.45 }}>
                                  <div style={{ fontWeight: 800, color: '#6D28D9', marginBottom: '2px' }}>GFW AIS Vessel Presence — Hourly</div>
                                  <div><strong>Vessel:</strong> {candName}</div>
                                  <div><strong>MMSI:</strong> {candMmsi}</div>
                                  <div><strong>Presence:</strong> {presenceHours} hours</div>
                                  <div><strong>Cell:</strong> {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}</div>
                                  <div><strong>Distance to spill origin:</strong> {distStr}</div>
                                  <div><strong>Temporal difference:</strong> {timeDeltaStr}</div>
                                  <div><strong>Classification:</strong> POTENTIAL CANDIDATE</div>
                                  <div><strong>Attribution:</strong> NOT ESTABLISHED</div>
                                </div>
                              </Tooltip>
                              <Popup>
                                <div style={{ fontSize: '0.75rem', color: '#111', lineHeight: 1.4 }}>
                                  <strong style={{ color: '#4C1D95' }}>GFW AIS Vessel Presence — Hourly</strong><br />
                                  <span style={{ fontSize: '0.70rem', color: '#6B7280' }}>Observed GFW vessel-presence cell (NOT exact vessel position)</span><br />
                                  <strong>Vessel:</strong> {candName}<br />
                                  <strong>MMSI:</strong> {candMmsi}<br />
                                  <strong>Type:</strong> {candType}<br />
                                  <strong>Presence:</strong> {presenceHours} hrs<br />
                                  <strong>Cell:</strong> {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}<br />
                                  <strong>Distance to Origin:</strong> {distStr}<br />
                                  <strong>CPA:</strong> NOT AVAILABLE<br />
                                  <strong>Heading / Speed:</strong> NOT AVAILABLE<br />
                                  <span style={{ color: '#D97706', fontWeight: 700 }}>POTENTIAL CANDIDATE</span> &bull; <span>ATTRIBUTION: NOT ESTABLISHED</span>
                                </div>
                              </Popup>
                            </CircleMarker>
                          );
                        })}
                    </MapView>
                  </div>

                  {/* Ranked Candidates Table */}
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#E7EAEE', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Ship size={16} style={{ color: '#49C6C8' }} />
                      GFW AIS Vessel Presence — Ranked Potential Candidates ({investigationResult.candidates?.length || 0})
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #25292F', color: '#A7AFB8' }}>
                            <th style={{ padding: '8px' }}>Rank</th>
                            <th style={{ padding: '8px' }}>Vessel Name</th>
                            <th style={{ padding: '8px' }}>MMSI</th>
                            <th style={{ padding: '8px' }}>Vessel Type</th>
                            <th style={{ padding: '8px' }}>Presence Hours</th>
                            <th style={{ padding: '8px' }}>Closest Presence Cell</th>
                            <th style={{ padding: '8px' }}>Distance to Origin</th>
                            <th style={{ padding: '8px' }}>Time Delta</th>
                            <th style={{ padding: '8px' }}>Presence Score</th>
                            <th style={{ padding: '8px' }}>Legal Classification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(investigationResult.candidates) && investigationResult.candidates.length > 0 ? (
                            investigationResult.candidates.map((cand, idx) => {
                              const rank = cand.rank || idx + 1;
                              const candName = cand.vessel?.name || cand.vesselName || cand.name || 'UNKNOWN';
                              const candMmsi = cand.mmsi || cand.vesselId?.mmsi || 'N/A';
                              const candType = cand.vessel?.vesselType || cand.vesselType || 'Cargo';
                              const presenceHours = cand.aisEvidence?.presenceHours || cand.presenceHours || 1;
                              const closestCoords = cand.correlation?.closestCellCoordinates;
                              const closestCellStr = closestCoords
                                ? `${closestCoords.latitude.toFixed(4)}°, ${closestCoords.longitude.toFixed(4)}°`
                                : (cand.latitude != null && cand.longitude != null ? `${Number(cand.latitude).toFixed(4)}°, ${Number(cand.longitude).toFixed(4)}°` : 'N/A');
                              const distKm = cand.correlation?.closestCellDistanceKm ?? cand.evidence?.distanceKm;
                              const distStr = distKm != null ? `${Number(distKm).toFixed(2)} km` : 'N/A';
                              const timeDeltaStr = cand.evidence?.timeDiffHours != null ? `${Number(cand.evidence.timeDiffHours).toFixed(1)} hrs` : 'N/A';
                              const scoreVal = cand.correlation?.score ?? cand.totalScore ?? 0;
                              const scoreStr = typeof scoreVal === 'number' ? scoreVal.toFixed(3) : 'N/A';

                              return (
                                <tr key={`cand-row-${cand.mmsi || cand.id || idx}-${idx}`} style={{ borderBottom: '1px solid #171A1E', color: '#E7EAEE', fontFamily: 'monospace' }}>
                                  <td style={{ padding: '8px', color: '#49C6C8', fontWeight: 700 }}>#{rank}</td>
                                  <td style={{ padding: '8px', fontWeight: 600, color: '#E7EAEE', fontFamily: 'sans-serif' }}>
                                    {candName}
                                  </td>
                                  <td style={{ padding: '8px', color: '#A7AFB8' }}>{candMmsi}</td>
                                  <td style={{ padding: '8px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>
                                    {candType}
                                  </td>
                                  <td style={{ padding: '8px', color: '#38BDF8' }}>
                                    {presenceHours} hrs
                                  </td>
                                  <td style={{ padding: '8px', color: '#CBD5E1' }}>
                                    {closestCellStr}
                                  </td>
                                  <td style={{ padding: '8px' }}>
                                    {distStr}
                                  </td>
                                  <td style={{ padding: '8px' }}>
                                    {timeDeltaStr}
                                  </td>
                                  <td style={{ padding: '8px', fontWeight: 700, color: '#C084FC' }}>
                                    {scoreStr}
                                  </td>
                                  <td style={{ padding: '8px' }}>
                                    <span
                                      style={{
                                        fontSize: '0.68rem',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                        color: '#F59E0B',
                                        fontWeight: 700,
                                        letterSpacing: '0.04em',
                                      }}
                                    >
                                      POTENTIAL CANDIDATE
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={10} style={{ padding: '16px', textAlign: 'center', color: '#A7AFB8' }}>
                                {investigationResult.aisStatus === 'AIS_PROVIDER_UNAVAILABLE' || investigationResult.aisCorrelation?.status === 'AIS_PROVIDER_UNAVAILABLE' ? (
                                  <div data-testid="ais-provider-unavailable" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <strong style={{ color: '#F87171', fontSize: '0.80rem' }}>HISTORICAL AIS UNAVAILABLE</strong>
                                    <div style={{ color: '#E2E8F0' }}>Provider: <strong>GLOBAL FISHING WATCH</strong></div>
                                    <div style={{ color: '#CBD5E1' }}>Reason: {investigationResult.unavailableReason || investigationResult.aisCorrelation?.unavailableReason || 'Historical AIS provider is unreachable or offline.'}</div>
                                  </div>
                                ) : (
                                  <div data-testid="no-matching-presence" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ color: '#38BDF8', fontWeight: 600 }}>
                                      GFW historical AIS query completed successfully, but no vessel-presence records satisfied the configured spatial/temporal candidate criteria.
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                                      Provider: <strong style={{ color: '#E2E8F0' }}>GLOBAL FISHING WATCH</strong> &nbsp;|&nbsp; Dataset: <strong style={{ color: '#E2E8F0' }}>public-global-presence:v4.0</strong> &nbsp;|&nbsp; Status: <strong style={{ color: '#F59E0B' }}>NO_MATCHING_PRESENCE</strong>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Attribution Guardrail Box */}
                    <div
                      data-testid="attribution-guardrail-box"
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        borderRadius: '6px',
                        padding: '12px 16px',
                        marginTop: '14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        fontSize: '0.72rem',
                        color: '#FBBF24',
                        lineHeight: '1.5',
                      }}
                    >
                      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong>ATTRIBUTION GUARDRAIL & SCIENTIFIC LIMITATIONS:</strong>
                        <div>
                          All vessels identified above are classified strictly as <strong>POTENTIAL CANDIDATE</strong>. Ocean Guard AI establishes probabilistic spatio-temporal correlation based on broadcast AIS telemetry and hydrodynamic drift models. Confirmed polluter status requires physical boarding, oil-fingerprinting (GC-MS), or legal maritime authority adjudication. Ocean Guard AI never labels vessels as "CONFIRMED POLLUTER".
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── DEVELOPER MODE: SIDE-BY-SIDE MODEL COMPARISON ─────── */}
              <div
                style={{
                  backgroundColor: '#121417',
                  borderRadius: '10px',
                  border: '1px solid #25292F',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowDeveloperMode(!showDeveloperMode)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: '#171A1E',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    color: '#E7EAEE',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <GitCompare size={16} style={{ color: '#F59E0B' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      Developer Mode: Dual Optical Model Comparison (Drone vs Satellite)
                    </span>
                  </div>
                  {showDeveloperMode ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showDeveloperMode && (
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ fontSize: '0.78rem', color: '#A7AFB8' }}>
                      Run both <code style={{ color: '#49C6C8' }}>kerf-resnet34-focaldice-v1</code> and{' '}
                      <code style={{ color: '#49C6C8' }}>mados-resnet34-rgb-v1</code> side-by-side on this exact raster to inspect domain differences and verify independent execution.
                    </div>

                    {!compareResult && (
                      <button
                        onClick={handleRunComparison}
                        disabled={isComparing}
                        style={{
                          alignSelf: 'flex-start',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 18px',
                          borderRadius: '6px',
                          backgroundColor: '#F59E0B',
                          color: '#0A0B0D',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          border: 'none',
                          cursor: isComparing ? 'wait' : 'pointer',
                        }}
                      >
                        {isComparing ? <LoadingSpinner size="sm" /> : <GitCompare size={14} />}
                        {isComparing ? 'Running Dual Model Comparison...' : 'Run Side-by-Side Model Comparison'}
                      </button>
                    )}

                    {comparisonError && (
                      <div style={{ fontSize: '0.78rem', color: '#F87171', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px' }}>
                        {comparisonError}
                      </div>
                    )}

                    {compareResult && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #25292F', color: '#A7AFB8' }}>
                                <th style={{ padding: '10px' }}>Metric / Property</th>
                                <th style={{ padding: '10px', color: '#49C6C8' }}>Drone / Aerial RGB (KERF)</th>
                                <th style={{ padding: '10px', color: '#3B82F6' }}>Satellite RGB (MADOS)</th>
                              </tr>
                            </thead>
                            <tbody style={{ fontFamily: 'monospace' }}>
                              <tr style={{ borderBottom: '1px solid #171A1E' }}>
                                <td style={{ padding: '10px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>Model ID</td>
                                <td style={{ padding: '10px', color: '#E7EAEE', fontWeight: 600 }}>{compareResult.drone_model?.model_id}</td>
                                <td style={{ padding: '10px', color: '#E7EAEE', fontWeight: 600 }}>{compareResult.satellite_model?.model_id}</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #171A1E' }}>
                                <td style={{ padding: '10px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>Checkpoint SHA-256</td>
                                <td style={{ padding: '10px', color: '#9CA3AF' }} title={compareResult.drone_model?.checkpoint_sha256}>{compareResult.drone_model?.checkpoint_sha256?.substring(0, 16)}...</td>
                                <td style={{ padding: '10px', color: '#9CA3AF' }} title={compareResult.satellite_model?.checkpoint_sha256}>{compareResult.satellite_model?.checkpoint_sha256?.substring(0, 16)}...</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #171A1E' }}>
                                <td style={{ padding: '10px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>Detected Area</td>
                                <td style={{ padding: '10px', color: compareResult.drone_model?.foreground_pixels > 0 ? '#EF4444' : '#34D399', fontWeight: 700 }}>
                                  {((compareResult.drone_model?.foreground_fraction || 0) * 100).toFixed(2)}% ({compareResult.drone_model?.foreground_pixels?.toLocaleString()} px)
                                </td>
                                <td style={{ padding: '10px', color: compareResult.satellite_model?.foreground_pixels > 0 ? '#EF4444' : '#34D399', fontWeight: 700 }}>
                                  {((compareResult.satellite_model?.foreground_fraction || 0) * 100).toFixed(2)}% ({compareResult.satellite_model?.foreground_pixels?.toLocaleString()} px)
                                </td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #171A1E' }}>
                                <td style={{ padding: '10px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>Connected Components</td>
                                <td style={{ padding: '10px', color: '#E7EAEE' }}>{compareResult.drone_model?.connected_component_count ?? 0}</td>
                                <td style={{ padding: '10px', color: '#E7EAEE' }}>{compareResult.satellite_model?.connected_component_count ?? 0}</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #171A1E' }}>
                                <td style={{ padding: '10px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>Probability Max / Mean</td>
                                <td style={{ padding: '10px', color: '#E7EAEE' }}>
                                  {(compareResult.drone_model?.probability_distribution?.max ?? 0).toFixed(4)} / {(compareResult.drone_model?.probability_distribution?.mean ?? 0).toFixed(4)}
                                </td>
                                <td style={{ padding: '10px', color: '#E7EAEE' }}>
                                  {(compareResult.satellite_model?.probability_distribution?.max ?? 0).toFixed(4)} / {(compareResult.satellite_model?.probability_distribution?.mean ?? 0).toFixed(4)}
                                </td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #171A1E' }}>
                                <td style={{ padding: '10px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>Binary Mask SHA-256</td>
                                <td style={{ padding: '10px', color: '#9CA3AF' }} title={compareResult.drone_model?.mask_sha256}>{compareResult.drone_model?.mask_sha256?.substring(0, 16)}...</td>
                                <td style={{ padding: '10px', color: '#9CA3AF' }} title={compareResult.satellite_model?.mask_sha256}>{compareResult.satellite_model?.mask_sha256?.substring(0, 16)}...</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #171A1E' }}>
                                <td style={{ padding: '10px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>Masks Identical?</td>
                                <td colSpan={2} style={{ padding: '10px', color: compareResult.comparison?.masks_identical ? '#EF4444' : '#34D399', fontWeight: 700 }}>
                                  {compareResult.comparison?.masks_identical ? 'YES (IDENTICAL)' : 'NO (DISTINCT OUTPUTS)'}
                                </td>
                              </tr>
                              <tr>
                                <td style={{ padding: '10px', color: '#A7AFB8', fontFamily: 'sans-serif' }}>Raw Outputs Identical?</td>
                                <td colSpan={2} style={{ padding: '10px', color: compareResult.comparison?.raw_outputs_identical ? '#EF4444' : '#34D399', fontWeight: 700 }}>
                                  {compareResult.comparison?.raw_outputs_identical ? 'YES (IDENTICAL)' : 'NO (DISTINCT PROBABILITIES)'}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── DATA PROVENANCE & SCIENTIFIC GUARDRAILS ────────────── */}
              <div
                style={{
                  backgroundColor: '#171A1E',
                  borderRadius: '10px',
                  border: '1px solid #25292F',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#49C6C8',
                    letterSpacing: '0.04em',
                    borderBottom: '1px solid #25292F',
                    paddingBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <ShieldCheck size={16} />
                  DATA PROVENANCE & SCIENTIFIC GUARDRAILS
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '14px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#A7AFB8', textTransform: 'uppercase' }}>Source</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E7EAEE', marginTop: '2px' }}>
                      {analysisResult.inputMetadata?.sourceType || selectedSourceType}
                    </div>
                    <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(52, 211, 153, 0.12)', color: '#34D399', fontWeight: 600 }}>
                      {analysisResult.inputMetadata?.sourceTypeOrigin || 'USER_SELECTED'}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#A7AFB8', textTransform: 'uppercase' }}>Geolocation</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E7EAEE', marginTop: '2px' }}>
                      {analysisResult.geospatial?.geolocationStatus || 'NOT_ESTABLISHED'}
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: analysisResult.geospatial?.geolocationStatus === 'ESTABLISHED' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(107, 114, 128, 0.2)',
                        color: analysisResult.geospatial?.geolocationStatus === 'ESTABLISHED' ? '#34D399' : '#9CA3AF',
                        fontWeight: 600,
                      }}
                    >
                      {analysisResult.geospatial?.geolocationStatus || 'NOT_ESTABLISHED'}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#A7AFB8', textTransform: 'uppercase' }}>Analysis Modality</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E7EAEE', marginTop: '2px' }}>
                      {selectedSourceType === 'SENTINEL1_DUAL_POL' || analysisResult?.modality === 'SAR_DUAL_POL' || analysisResult?.modality === 'SAR'
                        ? 'SAR DUAL-POL INFERENCE'
                        : 'OPTICAL IMAGE INFERENCE'}
                    </div>
                    <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(73, 198, 200, 0.12)', color: '#49C6C8', fontWeight: 600 }}>
                      ANALYTICAL
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #25292F', paddingTop: '10px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#A7AFB8', fontWeight: 600, marginBottom: '6px' }}>
                    Scientific Boundaries:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.72rem', color: '#6B7280', lineHeight: '1.5' }}>
                    <li>
                      Pixel-level segmentation indicates 2D {selectedSourceType === 'SENTINEL1_DUAL_POL' || analysisResult?.modality === 'SAR_DUAL_POL' || analysisResult?.modality === 'SAR' ? 'radar backscatter anomaly' : 'optical surface footprint'} only; physical thickness and volume are NOT established.
                    </li>
                    <li>The model does not distinguish crude oil vs refined bilge/waste hydrocarbon fractions.</li>
                    <li>
                      {selectedSourceType === 'SENTINEL1_DUAL_POL' || analysisResult?.modality === 'SAR_DUAL_POL' || analysisResult?.modality === 'SAR'
                        ? 'Downstream drift and AIS correlation require valid GeoTIFF georeferencing (CRS + affine geotransform).'
                        : 'No geographic coordinates or AIS vessel attribution exist for standard optical photographic uploads.'}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FULLSCREEN IMAGE INSPECTION MODAL ───────────────────────── */}
      {activeModalImage && (
        <div
          onClick={() => setActiveModalImage(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '24px',
            cursor: 'zoom-out',
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setActiveModalImage(null)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: 0,
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <X size={24} />
            </button>
            <img
              src={activeModalImage}
              alt="Expanded Inspection"
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
