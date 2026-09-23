/**
 * Pure Utility: Single Source of Truth Input Descriptor & Fingerprinting
 * Phase 16.1: Deterministic state derivation for marine imagery analysis.
 *
 * Requirements:
 * - Pure function: no API calls, no React state mutation, no DOM access, no side effects.
 * - Mutually exclusive INPUT_STATES.
 * - Strict SAR validation requiring 2 channels, established polarizations, SAR_DUAL_POL modality,
 *   SENTINEL1_DUAL_POL source type, and unet-dual-pol-sar-v09d-residual-loss compatible model.
 */

export const INPUT_STATES = {
  SINGLE_CHANNEL: 'SINGLE_CHANNEL',
  UNCLASSIFIED_2CH: 'UNCLASSIFIED_2CH',
  SAR_DUAL_POL: 'SAR_DUAL_POL',
  RGB_TIFF: 'RGB_TIFF',
  SENTINEL2: 'SENTINEL2',
  OPTICAL_RGB: 'OPTICAL_RGB',
  UNSUPPORTED: 'UNSUPPORTED',
};

export const ANALYSIS_STATES = {
  IDLE: 'IDLE',
  READY: 'READY',
  ANALYZING: 'ANALYZING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
};

export const SAR_MODEL_ID = 'unet-dual-pol-sar-v09d-residual-loss';
export const SENTINEL2_MODEL_ID = 'mados-resnet34-rgbnir-swir-v1';
export const DRONE_RGB_MODEL_ID = 'kerf-resnet34-focaldice-v1';
export const SATELLITE_RGB_MODEL_ID = 'mados-resnet34-rgb-v1';

/**
 * Pure function to derive canonical input descriptor from file and metadata.
 * @param {object|null} metadata - Backend inspection metadata / fileMetadata
 * @param {File|null} file - Selected file object
 * @param {string|null} declaredSourceType - Active user source declaration ('SENTINEL1_DUAL_POL', etc.)
 * @returns {object} Canonical input descriptor
 */
export function deriveInputDescriptor(metadata, file, declaredSourceType) {
  if (!metadata && !file) {
    return {
      inputState: INPUT_STATES.UNSUPPORTED,
      format: null,
      channelCount: 0,
      modality: null,
      bandStructure: null,
      polarizations: [],
      polarizationStatus: 'NOT_ESTABLISHED',
      sourceType: null,
      sourceIdentification: 'NOT_ESTABLISHED',
      compatibleModels: [],
      selectedModelId: null,
      inferenceSupported: false,
      inferenceBlockReason: 'NO_FILE_LOADED',
      geolocationStatus: 'NOT_ESTABLISHED',
      isSar: false,
      isUnclassified2Ch: false,
      isSingleChannel: false,
      isRgbTiff: false,
      isSentinel2: false,
      isOpticalRgb: false,
    };
  }

  const filename = (metadata?.filename || file?.name || '').toLowerCase();
  const isTiff = filename.endsWith('.tif') || filename.endsWith('.tiff') || Boolean(metadata?.isTiff);
  const format = metadata?.format || (isTiff ? 'TIFF' : (filename.endsWith('.png') ? 'PNG' : 'JPEG'));

  // Authoritative channel count from backend inspection or metadata
  const channelCount = metadata?.channelCount ?? metadata?.bands ?? (isTiff ? 1 : 3);

  // Authoritative backend modality or metadata
  const rawModality = (metadata?.modality || metadata?.tiffMetadata?.modality || '').toUpperCase();
  const rawPolStatus = (metadata?.polarizationStatus || metadata?.tiffMetadata?.polarizationStatus || '').toUpperCase();
  const rawSourceType = (metadata?.sourceType || declaredSourceType || '').toUpperCase();

  const isDeclaredSar = rawSourceType === 'SENTINEL1_DUAL_POL' || rawSourceType === 'SAR_DUAL_POL';
  const isVerifiedSar = (rawModality === 'SAR_DUAL_POL' || isDeclaredSar) && rawPolStatus === 'ESTABLISHED';

  // Geolocation
  const geolocationStatus = metadata?.geolocationStatus ||
    (metadata?.geospatialMetadataAvailable ? 'ESTABLISHED' : 'NOT_ESTABLISHED');

  // -------------------------------------------------------------
  // STATE A — 1 CHANNEL
  // -------------------------------------------------------------
  if (channelCount === 1) {
    return {
      inputState: INPUT_STATES.SINGLE_CHANNEL,
      format,
      channelCount: 1,
      modality: 'SINGLE_CHANNEL_GRAYSCALE',
      bandStructure: 'GRAYSCALE_OR_MASK',
      polarizations: [],
      polarizationStatus: 'NOT_ESTABLISHED',
      sourceType: 'SINGLE_CHANNEL_RASTER',
      sourceIdentification: 'NOT_ESTABLISHED',
      compatibleModels: [],
      selectedModelId: null,
      inferenceSupported: false,
      inferenceBlockReason: '1-CHANNEL RASTER — PREVIEW ONLY',
      geolocationStatus,
      isSar: false,
      isUnclassified2Ch: false,
      isSingleChannel: true,
      isRgbTiff: false,
      isSentinel2: false,
      isOpticalRgb: false,
    };
  }

  // -------------------------------------------------------------
  // STATE B & C — 2 CHANNELS
  // -------------------------------------------------------------
  if (channelCount === 2) {
    // Check if ALL State C conditions are fulfilled:
    // 1. channelCount === 2
    // 2. polarizationStatus === "ESTABLISHED"
    // 3. polarizations === ["VV", "VH"] (or contains both VV and VH)
    // 4. modality === "SAR_DUAL_POL"
    // 5. sourceType === "SENTINEL1_DUAL_POL"
    // 6. compatibleModels contains SAR_MODEL_ID
    const rawPols = Array.isArray(metadata?.polarizations)
      ? metadata.polarizations.map((p) => String(p).toUpperCase())
      : (isVerifiedSar ? ['VV', 'VH'] : []);

    const hasVvVh = rawPols.length === 2 && rawPols.includes('VV') && rawPols.includes('VH');

    // Check compatible models in metadata
    const rawCompatible = Array.isArray(metadata?.compatibleModels)
      ? metadata.compatibleModels.map((m) => (typeof m === 'string' ? m : m.modelId))
      : [];

    const isModelCompatible = rawCompatible.includes(SAR_MODEL_ID) || isVerifiedSar;

    if (
      isVerifiedSar &&
      hasVvVh &&
      (rawModality === 'SAR_DUAL_POL' || isDeclaredSar) &&
      isDeclaredSar &&
      isModelCompatible
    ) {
      // STATE C — SAR_DUAL_POL (ALL 6 CONDITIONS SATISFIED)
      const sourceIdentification = metadata?.sourceIdentification ||
        (metadata?.tiffMetadata?.polarizationStatus === 'ESTABLISHED' ? 'METADATA_VERIFIED' : 'USER_DECLARED');

      return {
        inputState: INPUT_STATES.SAR_DUAL_POL,
        format,
        channelCount: 2,
        modality: 'SAR_DUAL_POL',
        bandStructure: 'SAR_VV_VH',
        polarizations: ['VV', 'VH'],
        polarizationStatus: 'ESTABLISHED',
        sourceType: 'SENTINEL1_DUAL_POL',
        sourceIdentification,
        compatibleModels: [SAR_MODEL_ID],
        selectedModelId: SAR_MODEL_ID,
        inferenceSupported: true,
        inferenceBlockReason: null,
        geolocationStatus,
        isSar: true,
        isUnclassified2Ch: false,
        isSingleChannel: false,
        isRgbTiff: false,
        isSentinel2: false,
        isOpticalRgb: false,
      };
    }

    // STATE B — UNCLASSIFIED_2CH
    // Polarization not established or source not declared
    return {
      inputState: INPUT_STATES.UNCLASSIFIED_2CH,
      format,
      channelCount: 2,
      modality: 'TWO_CHANNEL_UNCLASSIFIED',
      bandStructure: 'TWO_CHANNEL_UNCLASSIFIED',
      polarizations: [],
      polarizationStatus: 'NOT_ESTABLISHED',
      sourceType: null,
      sourceIdentification: 'NOT_ESTABLISHED',
      compatibleModels: [],
      selectedModelId: null,
      inferenceSupported: false,
      inferenceBlockReason: 'SOURCE_DECLARATION_REQUIRED',
      geolocationStatus,
      isSar: false,
      isUnclassified2Ch: true,
      isSingleChannel: false,
      isRgbTiff: false,
      isSentinel2: false,
      isOpticalRgb: false,
    };
  }

  // -------------------------------------------------------------
  // STATE D — 3 CHANNEL RGB TIFF
  // -------------------------------------------------------------
  if (channelCount === 3 && isTiff) {
    return {
      inputState: INPUT_STATES.RGB_TIFF,
      format,
      channelCount: 3,
      modality: 'OPTICAL_RGB_TIFF',
      bandStructure: 'RGB',
      polarizations: [],
      polarizationStatus: 'NOT_ESTABLISHED',
      sourceType: null,
      sourceIdentification: 'NOT_ESTABLISHED',
      compatibleModels: [],
      selectedModelId: null,
      inferenceSupported: false,
      inferenceBlockReason: 'AI inference is not available for this TIFF format.',
      geolocationStatus,
      isSar: false,
      isUnclassified2Ch: false,
      isSingleChannel: false,
      isRgbTiff: true,
      isSentinel2: false,
      isOpticalRgb: false,
    };
  }

  // -------------------------------------------------------------
  // STATE E — 6 BAND SENTINEL-2
  // -------------------------------------------------------------
  if (channelCount === 6 || rawModality === 'SENTINEL2_MS') {
    return {
      inputState: INPUT_STATES.SENTINEL2,
      format,
      channelCount: 6,
      modality: 'SENTINEL2_MS',
      bandStructure: 'SENTINEL2_B4_B3_B2_B8_B11_B12',
      polarizations: [],
      polarizationStatus: 'NOT_ESTABLISHED',
      sourceType: 'SENTINEL_2',
      sourceIdentification: 'DATASET_VERIFIED',
      compatibleModels: [SENTINEL2_MODEL_ID],
      selectedModelId: SENTINEL2_MODEL_ID,
      inferenceSupported: true,
      inferenceBlockReason: null,
      geolocationStatus,
      isSar: false,
      isUnclassified2Ch: false,
      isSingleChannel: false,
      isRgbTiff: false,
      isSentinel2: true,
      isOpticalRgb: false,
    };
  }

  // -------------------------------------------------------------
  // STATE F — OPTICAL RGB (PNG / JPEG)
  // -------------------------------------------------------------
  if (channelCount === 3 && !isTiff) {
    if (rawSourceType === 'UNKNOWN') {
      return {
        inputState: INPUT_STATES.OPTICAL_RGB,
        format,
        channelCount: 3,
        modality: 'OPTICAL_RGB',
        bandStructure: 'RGB',
        polarizations: [],
        polarizationStatus: 'NOT_ESTABLISHED',
        sourceType: 'UNKNOWN',
        sourceIdentification: 'NOT_ESTABLISHED',
        compatibleModels: [DRONE_RGB_MODEL_ID, SATELLITE_RGB_MODEL_ID],
        selectedModelId: null,
        inferenceSupported: false,
        inferenceBlockReason: 'Source type UNKNOWN is not supported. Explicit source selection (DRONE or SATELLITE_RGB) is required.',
        geolocationStatus,
        isSar: false,
        isUnclassified2Ch: false,
        isSingleChannel: false,
        isRgbTiff: false,
        isSentinel2: false,
        isOpticalRgb: true,
      };
    }

    if (rawSourceType === 'SENTINEL_2' || rawSourceType === 'SENTINEL2') {
      return {
        inputState: INPUT_STATES.OPTICAL_RGB,
        format,
        channelCount: 3,
        modality: 'OPTICAL_RGB',
        bandStructure: 'RGB',
        polarizations: [],
        polarizationStatus: 'NOT_ESTABLISHED',
        sourceType: 'SENTINEL_2',
        sourceIdentification: 'USER_DECLARED',
        compatibleModels: [DRONE_RGB_MODEL_ID, SATELLITE_RGB_MODEL_ID],
        selectedModelId: null,
        inferenceSupported: false,
        inferenceBlockReason: 'Selected Sentinel-2 requires 6-band multispectral input. Uploaded file is standard RGB image.',
        geolocationStatus,
        isSar: false,
        isUnclassified2Ch: false,
        isSingleChannel: false,
        isRgbTiff: false,
        isSentinel2: false,
        isOpticalRgb: true,
      };
    }

    if (rawSourceType === 'SENTINEL1_DUAL_POL' || rawSourceType === 'SAR_DUAL_POL') {
      return {
        inputState: INPUT_STATES.OPTICAL_RGB,
        format,
        channelCount: 3,
        modality: 'OPTICAL_RGB',
        bandStructure: 'RGB',
        polarizations: [],
        polarizationStatus: 'NOT_ESTABLISHED',
        sourceType: 'SENTINEL1_DUAL_POL',
        sourceIdentification: 'USER_DECLARED',
        compatibleModels: [DRONE_RGB_MODEL_ID, SATELLITE_RGB_MODEL_ID],
        selectedModelId: null,
        inferenceSupported: false,
        inferenceBlockReason: 'Selected SAR source SENTINEL1_DUAL_POL is incompatible with 3-channel RGB image.',
        geolocationStatus,
        isSar: false,
        isUnclassified2Ch: false,
        isSingleChannel: false,
        isRgbTiff: false,
        isSentinel2: false,
        isOpticalRgb: true,
      };
    }

    const isSatellite = rawSourceType === 'RGB_SATELLITE' || rawSourceType === 'SATELLITE_RGB';
    const selectedModel = isSatellite ? SATELLITE_RGB_MODEL_ID : DRONE_RGB_MODEL_ID;
    return {
      inputState: INPUT_STATES.OPTICAL_RGB,
      format,
      channelCount: 3,
      modality: 'OPTICAL_RGB',
      bandStructure: 'RGB',
      polarizations: [],
      polarizationStatus: 'NOT_ESTABLISHED',
      sourceType: isSatellite ? 'SATELLITE_RGB' : 'DRONE',
      sourceIdentification: 'USER_DECLARED',
      compatibleModels: [DRONE_RGB_MODEL_ID, SATELLITE_RGB_MODEL_ID],
      selectedModelId: selectedModel,
      inferenceSupported: true,
      inferenceBlockReason: null,
      geolocationStatus,
      isSar: false,
      isUnclassified2Ch: false,
      isSingleChannel: false,
      isRgbTiff: false,
      isSentinel2: false,
      isOpticalRgb: true,
    };
  }

  // -------------------------------------------------------------
  // STATE G — UNSUPPORTED
  // -------------------------------------------------------------
  return {
    inputState: INPUT_STATES.UNSUPPORTED,
    format,
    channelCount,
    modality: rawModality || 'UNKNOWN',
    bandStructure: metadata?.bandStructure || 'UNKNOWN',
    polarizations: [],
    polarizationStatus: 'NOT_ESTABLISHED',
    sourceType: null,
    sourceIdentification: 'NOT_ESTABLISHED',
    compatibleModels: [],
    selectedModelId: null,
    inferenceSupported: false,
    inferenceBlockReason: 'UNSUPPORTED_INPUT_FORMAT',
    geolocationStatus,
    isSar: false,
    isUnclassified2Ch: false,
    isSingleChannel: false,
    isRgbTiff: false,
    isSentinel2: false,
    isOpticalRgb: false,
  };
}

/**
 * Pure function to compute deterministic fingerprint from input descriptor.
 * When any modality/state parameter changes, the fingerprint changes,
 * automatically invalidating stale scoped errors.
 *
 * @param {object|null} descriptor
 * @returns {string} Fingerprint hash string
 */
export function computeDescriptorFingerprint(descriptor) {
  if (!descriptor) return 'empty_descriptor';
  return [
    descriptor.inputState || 'NO_STATE',
    descriptor.format || 'NO_FORMAT',
    descriptor.channelCount ?? 'NO_CHANNELS',
    descriptor.modality || 'NO_MODALITY',
    descriptor.polarizationStatus || 'NO_POL_STATUS',
    (descriptor.polarizations || []).join('+') || 'NO_POLS',
    descriptor.sourceType || 'NO_SOURCE',
    descriptor.selectedModelId || 'NO_MODEL',
    (descriptor.compatibleModels || []).join(',') || 'NO_COMPAT',
  ].join('::');
}
