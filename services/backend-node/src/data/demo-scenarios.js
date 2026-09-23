/**
 * Deterministic Demonstration Scenarios for Oil Spill Attribution System (SIH26143)
 *
 * Provides spatially, temporally, and physically coherent demonstration scenarios
 * across diverse Indian maritime corridors:
 *   - demo-scene-001: Mumbai Offshore Sector (Canonical Primary Baseline)
 *   - demo-scene-002: Gulf of Kutch Maritime Pass
 *   - demo-scene-003: Bay of Bengal / Paradip Offshore Corridor
 *   - demo-scene-004: Goa / Malabar Offshore Transit Channel
 */

const DEMO_SCENARIOS = {
  "demo-scene-001": {
    id: "demo-scene-001",
    sceneId: "DEMO-SAR-SENTINEL1-MUMBAI-2026-001",
    title: "Mumbai Offshore Sector (Primary Baseline)",
    description: "Sentinel-1 C-Band SAR dual-pol acquisition over Mumbai High corridor with simulated MetOcean boundary forcings.",
    satellite: "DEMO-Sentinel-1 (Simulated C-Band SAR)",
    acquisitionAt: new Date("2026-03-10T12:00:00.000Z"),
    fileUrl: "https://demo.oil-spill.dev/data/scenes/demo-scene-001.tif",
    sceneGeomWkt: "POLYGON((72.500 18.500, 73.200 18.500, 73.200 19.200, 72.500 19.200, 72.500 18.500))",
    spillGeomWkt: "POLYGON((72.800 18.900, 72.860 18.900, 72.860 18.942, 72.800 18.942, 72.800 18.900))",
    centroidLat: 18.921,
    centroidLng: 72.832,
    areaKm2: 4.73,
    confidence: 0.94,
    estimatedAgeHours: 14.5,
    originLat: 19.113,
    originLng: 72.544,
    originTimestamp: "2026-03-09T21:30:00.000Z",
    uncertaintyRadiusKm: 2.6,
    bandInfo: {
      polarisation: "VV+VH",
      resolutionMeters: 10,
      isDemoScene: true,
      description: "Deterministic SAR scene covering Mumbai offshore waters (18.921°N, 72.832°E)",
    },
  },
  "demo-scene-002": {
    id: "demo-scene-002",
    sceneId: "DEMO-SAR-SENTINEL1-KUTCH-2026-002",
    title: "Gulf of Kutch Maritime Pass (Secondary Scenario)",
    description: "Strait transit corridor with complex tidal currents and dense tanker traffic.",
    satellite: "DEMO-Sentinel-1 (Simulated C-Band SAR)",
    acquisitionAt: new Date("2026-03-11T06:00:00.000Z"),
    fileUrl: "https://demo.oil-spill.dev/data/scenes/demo-scene-002.tif",
    sceneGeomWkt: "POLYGON((68.800 22.000, 69.600 22.000, 69.600 22.800, 68.800 22.800, 68.800 22.000))",
    spillGeomWkt: "POLYGON((69.180 22.430, 69.240 22.430, 69.240 22.470, 69.180 22.470, 69.180 22.430))",
    centroidLat: 22.450,
    centroidLng: 69.210,
    areaKm2: 2.85,
    confidence: 0.91,
    estimatedAgeHours: 12.0,
    originLat: 22.642,
    originLng: 68.922,
    originTimestamp: "2026-03-10T18:00:00.000Z",
    uncertaintyRadiusKm: 2.4,
    bandInfo: {
      polarisation: "VV+VH",
      resolutionMeters: 10,
      isDemoScene: true,
      description: "Deterministic SAR scene covering Gulf of Kutch maritime waters (22.450°N, 69.210°E)",
    },
  },
  "demo-scene-003": {
    id: "demo-scene-003",
    sceneId: "DEMO-SAR-SENTINEL1-BENGAL-2026-003",
    title: "Bay of Bengal / Paradip Offshore",
    description: "Deep-water maritime corridor with seasonal monsoon surface drift in Bay of Bengal.",
    satellite: "DEMO-Sentinel-1 (Simulated C-Band SAR)",
    acquisitionAt: new Date("2026-03-12T04:30:00.000Z"),
    fileUrl: "https://demo.oil-spill.dev/data/scenes/demo-scene-003.tif",
    sceneGeomWkt: "POLYGON((86.500 19.800, 87.300 19.800, 87.300 20.500, 86.500 20.500, 86.500 19.800))",
    spillGeomWkt: "POLYGON((86.880 20.120, 86.960 20.120, 86.960 20.180, 86.880 20.180, 86.880 20.120))",
    centroidLat: 20.150,
    centroidLng: 86.920,
    areaKm2: 5.20,
    confidence: 0.89,
    estimatedAgeHours: 16.0,
    originLat: 20.342,
    originLng: 86.632,
    originTimestamp: "2026-03-11T12:30:00.000Z",
    uncertaintyRadiusKm: 2.8,
    bandInfo: {
      polarisation: "VV+VH",
      resolutionMeters: 10,
      isDemoScene: true,
      description: "Deterministic SAR scene covering Bay of Bengal offshore waters (20.150°N, 86.920°E)",
    },
  },
  "demo-scene-004": {
    id: "demo-scene-004",
    sceneId: "DEMO-SAR-SENTINEL1-MALABAR-2026-004",
    title: "Goa / Malabar Offshore Corridor",
    description: "Coastal traffic lane along western continental shelf with southerly drift currents.",
    satellite: "DEMO-Sentinel-1 (Simulated C-Band SAR)",
    acquisitionAt: new Date("2026-03-13T10:15:00.000Z"),
    fileUrl: "https://demo.oil-spill.dev/data/scenes/demo-scene-004.tif",
    sceneGeomWkt: "POLYGON((73.100 14.900, 73.900 14.900, 73.900 15.600, 73.100 15.600, 73.100 14.900))",
    spillGeomWkt: "POLYGON((73.490 15.260, 73.550 15.260, 73.550 15.300, 73.490 15.300, 73.490 15.260))",
    centroidLat: 15.280,
    centroidLng: 73.520,
    areaKm2: 3.60,
    confidence: 0.93,
    estimatedAgeHours: 10.5,
    originLat: 15.472,
    originLng: 73.232,
    originTimestamp: "2026-03-12T23:45:00.000Z",
    uncertaintyRadiusKm: 2.1,
    bandInfo: {
      polarisation: "VV+VH",
      resolutionMeters: 10,
      isDemoScene: true,
      description: "Deterministic SAR scene covering Malabar coast transit waters (15.280°N, 73.520°E)",
    },
  },
};

module.exports = {
  DEMO_SCENARIOS,
};
