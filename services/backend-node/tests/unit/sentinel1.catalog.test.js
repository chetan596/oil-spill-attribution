const {
  getNamedAois,
  resolveBoundingBox,
  normalizeStacItem,
  searchSentinel1Catalog,
} = require("../../src/services/sentinel1/sentinel1.catalog.service");

describe("CDSE Sentinel-1 Catalogue Service", () => {
  test("getNamedAois returns 4 valid Indian maritime AOIs with WGS84 bounding boxes", () => {
    const aois = getNamedAois();
    expect(aois.length).toBe(4);

    const mumbai = aois.find((a) => a.id === "mumbai");
    expect(mumbai).toBeDefined();
    expect(mumbai.name).toContain("Mumbai");
    expect(mumbai.bbox).toEqual([72.5, 18.5, 73.2, 19.2]);
    expect(mumbai.geometry.type).toBe("Polygon");

    const kutch = aois.find((a) => a.id === "kutch");
    expect(kutch.bbox).toEqual([68.8, 22.2, 69.8, 23.0]);

    const bengal = aois.find((a) => a.id === "bengal");
    expect(bengal.bbox).toEqual([86.0, 19.4, 87.2, 20.4]);

    const malabar = aois.find((a) => a.id === "malabar");
    expect(malabar.bbox).toEqual([73.2, 14.5, 74.2, 15.5]);
  });

  test("resolveBoundingBox resolves named AOIs and custom coordinates", () => {
    const mumbaiRes = resolveBoundingBox("mumbai");
    expect(mumbaiRes.bbox).toEqual([72.5, 18.5, 73.2, 19.2]);
    expect(mumbaiRes.aoiMeta.id).toBe("mumbai");

    const customRes = resolveBoundingBox("custom", [70.0, 15.0, 71.0, 16.0]);
    expect(customRes.bbox).toEqual([70.0, 15.0, 71.0, 16.0]);
    expect(customRes.aoiMeta.id).toBe("custom");
  });

  test("normalizeStacItem correctly extracts Sentinel-1 dual-pol metadata", () => {
    const mockFeature = {
      id: "S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG",
      bbox: [71.12, 17.87, 73.81, 19.81],
      geometry: { type: "Polygon", coordinates: [[[71.12, 17.87], [73.81, 17.87], [73.81, 19.81], [71.12, 19.81], [71.12, 17.87]]] },
      properties: {
        platform: "sentinel-1a",
        datetime: "2024-02-18T01:03:29.872Z",
        start_datetime: "2024-02-18T01:03:29.872Z",
        end_datetime: "2024-02-18T01:03:54.871Z",
        "product:type": "IW_GRDH_1S",
        "sar:instrument_mode": "IW",
        "sar:polarizations": ["VV", "VH"],
        "sat:orbit_state": "descending",
        "sat:relative_orbit": 34,
        "processing:level": "L1",
        _private: {
          product_name: "S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG.SAFE",
          product_size: 996681453,
          product_uuid: "3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79",
        },
      },
      assets: {
        vv: {
          alternate: {
            https: {
              href: "https://download.dataspace.copernicus.eu/odata/v1/Products(3f5c4ba1)/Nodes/measurement/vv.tiff/$value",
            },
          },
        },
        vh: {
          alternate: {
            https: {
              href: "https://download.dataspace.copernicus.eu/odata/v1/Products(3f5c4ba1)/Nodes/measurement/vh.tiff/$value",
            },
          },
        },
      },
    };

    const item = normalizeStacItem(mockFeature);
    expect(item.id).toBe("S1A_IW_GRDH_1SDV_20240218T010329_20240218T010354_052606_065D1D_A8B1_COG");
    expect(item.productUuid).toBe("3f5c4ba1-ed70-4065-91b9-2bbeb7ebfb79");
    expect(item.platform).toBe("SENTINEL-1A");
    expect(item.polarization).toBe("VV+VH");
    expect(item.orbitDirection).toBe("DESCENDING");
    expect(item.relativeOrbit).toBe(34);
    expect(item.downloadSizeMb).toBe(950.5);
    expect(item.vvDownloadUrl).toContain("vv.tiff");
    expect(item.source).toBe("COPERNICUS_DATA_SPACE");
  });
});
