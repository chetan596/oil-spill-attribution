"""
SAR Preprocessor Module for Sentinel-1 C-Band SAR Imagery.
Handles raster loading via rasterio, band validation, nodata/NaN scrubbing,
radiometric calibration, and comprehensive geospatial metadata extraction.
"""

import os
from typing import Dict, Any, Tuple, Optional
import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.transform import Affine

from app.preprocessing.normalization import normalize_sar_band


class SARPreprocessingError(Exception):
    """Exception raised for errors during SAR raster ingestion and preprocessing."""
    pass


def load_sar_raster(
    file_path: str,
    polarization: str = "VV"
) -> Tuple[np.ndarray, Dict[str, Any]]:
    """
    Load and preprocess a Sentinel-1 SAR GeoTIFF image.

    Args:
        file_path: Path to the GeoTIFF raster file.
        polarization: "VV" (1-channel), "VH" (1-channel), or "dual" / "VV+VH" (2-channels).

    Returns:
        Tuple of:
            - Preprocessed numpy array with shape (channels, height, width), dtype float32 in [0.0, 1.0]
            - Metadata dictionary containing width, height, count, dtype, crs, transform, bounds, etc.

    Raises:
        SARPreprocessingError: If file not found, corrupt, or missing requested bands.
    """
    if not os.path.exists(file_path):
        raise SARPreprocessingError(f"SAR raster file not found: {file_path}")

    try:
        with rasterio.open(file_path) as src:
            width = src.width
            height = src.height
            count = src.count
            dtype = str(src.dtypes[0])
            crs: Optional[CRS] = src.crs
            transform: Affine = src.transform
            bounds = src.bounds
            res = src.res
            nodata = src.nodata

            # Validate band availability
            pol_upper = polarization.upper().replace(" ", "").replace("+", "")
            if pol_upper in ["DUAL", "VVVH"]:
                if count < 2:
                    raise SARPreprocessingError(
                        f"Dual polarization requested (VV+VH), but raster contains only {count} band(s)."
                    )
                # Band 1: VV, Band 2: VH
                band1 = src.read(1)
                band2 = src.read(2)
                raw_bands = [band1, band2]
                selected_bands = ["VV", "VH"]
            elif pol_upper == "VH":
                if count < 2:
                    band_idx = 1
                else:
                    band_idx = 2
                raw_bands = [src.read(band_idx)]
                selected_bands = ["VH"]
            else:  # Default to VV (Band 1)
                raw_bands = [src.read(1)]
                selected_bands = ["VV"]

            # Scrub nodata, NaN, Inf and normalize each band to [0.0, 1.0]
            processed_bands = []
            for idx, band in enumerate(raw_bands):
                pol_name = selected_bands[idx] if idx < len(selected_bands) else "VV"
                norm_band = normalize_sar_band(band, polarization=pol_name, nodata=nodata)
                processed_bands.append(norm_band)

            tensor_array = np.stack(processed_bands, axis=0).astype(np.float32)

            metadata: Dict[str, Any] = {
                "file_path": file_path,
                "width": width,
                "height": height,
                "band_count": count,
                "original_dtype": dtype,
                "crs": crs.to_string() if crs else None,
                "is_geographic": crs.is_geographic if crs else None,
                "transform": list(transform) if transform else None,
                "affine_transform": transform,
                "bounds": {
                    "left": bounds.left,
                    "bottom": bounds.bottom,
                    "right": bounds.right,
                    "top": bounds.top,
                },
                "resolution": list(res),
                "nodata": nodata,
                "selected_bands": selected_bands,
                "channels": len(selected_bands),
                "georeferencing_status": "valid" if crs and transform else "missing",
            }

            return tensor_array, metadata

    except rasterio.errors.RasterioError as err:
        raise SARPreprocessingError(f"Rasterio error reading GeoTIFF '{file_path}': {str(err)}")
    except Exception as err:
        if isinstance(err, SARPreprocessingError):
            raise
        raise SARPreprocessingError(f"Unexpected failure reading SAR raster '{file_path}': {str(err)}")
