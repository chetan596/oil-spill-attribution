# Phase 3A — Data Requirements & Ingestion Specification

**System:** AI-Powered Oil Spill Detection & Vessel Attribution System (SIH26143)  
**Document:** Data Specification & Directory Blueprint  
**Date:** September 2026  

---

## 1. Directory Structure

All datasets must strictly adhere to the following directory layout:

```
data/
├── raw/
│   ├── satellite/         # Raw Sentinel-1 SAR acquisitions (GeoTIFF / SAFE)
│   │   ├── train/
│   │   ├── val/
│   │   └── test/
│   ├── ais/               # Historical AIS vessel position logs (CSV / Parquet)
│   ├── weather/           # ERA5 / GFS wind vector grids (GRIB2 / NetCDF)
│   └── ocean/             # HYCOM / Copernicus ocean surface current fields
├── interim/               # Calibrated sigma0 backscatter, tiled 512x512 patches
├── processed/             # Clean normalized tensors, raster masks, train splits
└── scenarios/             # Curated demonstration scenarios (e.g. demo-scene-001)
    └── demo-scene-001/
        ├── sar_scene.tif
        ├── ais_telemetry.parquet
        └── ocean_currents.nc
```

---

## 2. Sentinel-1 SAR Image Specifications

| Parameter | Required Specification |
| :--- | :--- |
| **Sensor / Platform** | Sentinel-1A / Sentinel-1B C-Band SAR |
| **Product Type** | Level-1 Ground Range Detected (GRD) or Single Look Complex (SLC) |
| **Acquisition Mode** | Interferometric Wide Swath (IW) or Extra Wide Swath (EW) |
| **Polarization** | Primary: **VV** (Vertical transmit, Vertical receive — highest oil-water contrast) |
| | Secondary: **VH** (Cross-polarization for ship detection and land masking) |
| **Spatial Resolution** | 10m × 10m (IW mode) or 20m × 40m (EW mode) |
| **File Format** | Standard GeoTIFF (`.tif` / `.tiff`) with embedded affine transform and CRS |
| **Coordinate System** | `EPSG:4326` (WGS84) or Projected UTM Zone (e.g., `EPSG:32643` for Mumbai offshore) |
| **Radiometric Calibration** | $\sigma^0$ (Sigma Nought) backscatter in decibels (dB) or linear amplitude |

---

## 3. Label & Ground-Truth Mask Specifications

The ML pipeline requires pixel-level semantic segmentation ground truth:

### 3.1 Class Mapping
- **Class 0 (Background / Sea Surface)**: Clean ocean water with normal radar backscatter.
- **Class 1 (Oil Spill)**: Mineral crude oil / petroleum slick causing capillary wave dampening (low backscatter / dark patch).
- **Class 2 (Look-alike)**: Low wind zones, biogenic slicks, algae blooms, upwelling, rain cells.
- **Class 3 (Ship / Vessel)**: Bright point-target corner reflectors.
- **Class 4 (Land / Coastline)**: Landmass mask (from GSHHG or OSM water polygons).

### 3.2 Mask Format
- 8-bit single-channel GeoTIFF or PNG with identical dimensions $(H \times W)$ matching the SAR tile.
- Pixel values: integer IDs `0, 1, 2, 3, 4` or binary `0 (Clean Water)` vs `1 (Oil Slick)`.

---

## 4. Dataset Manifest Schema (`dataset_manifest.json`)

Each dataset batch should be accompanied by a JSON manifest:

```json
{
  "dataset_version": "sih26143-v1.0",
  "total_scenes": 120,
  "scenes": [
    {
      "scene_id": "S1A_IW_GRDH_1SDV_20260910T143210_034521_04128A_F021",
      "source": "Copernicus Open Access Hub / SIH Benchmark",
      "acquisition_timestamp": "2026-09-10T14:32:10Z",
      "platform": "Sentinel-1A",
      "mode": "IW",
      "polarization": ["VV", "VH"],
      "resolution_meters": 10.0,
      "crs": "EPSG:4326",
      "bbox": [72.2, 18.5, 73.1, 19.4],
      "file_path": "data/raw/satellite/train/scene_001.tif",
      "mask_path": "data/raw/satellite/train/scene_001_mask.png",
      "split": "train",
      "contains_spill": true,
      "contains_lookalikes": true
    }
  ]
}
```

---

## 5. Instructions for Dataset Ingestion

When the SIH evaluation dataset is provided:
1. Copy raw SAR GeoTIFF scenes into `data/raw/satellite/`.
2. Copy corresponding ground-truth segmentation masks into `data/raw/satellite/`.
3. Place `dataset_manifest.json` in `data/raw/satellite/`.
4. Run preprocessing tiling script (`python services/ml-python/app/preprocessing/tiling.py`) to generate 512×512 tiles with 64px overlap into `data/interim/`.
