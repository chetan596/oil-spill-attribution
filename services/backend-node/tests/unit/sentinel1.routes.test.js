const request = require("supertest");
const app = require("../../src/app");
const sentinel1Service = require("../../src/services/sentinel1/sentinel1.service");

describe("Sentinel-1 API Routes (CDSE Discovery)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("GET /api/v1/sentinel1/aois returns 4 named AOIs", async () => {
    const res = await request(app).get("/api/v1/sentinel1/aois");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(4);
    expect(res.body.data.some((a) => a.id === "mumbai")).toBe(true);
  });

  test("GET /api/v1/sentinel1/search executes catalogue query", async () => {
    jest.spyOn(sentinel1Service, "searchAcquisitions").mockResolvedValue({
      source: "COPERNICUS_DATA_SPACE",
      query: { aoi: "mumbai" },
      totalFound: 1,
      results: [{ id: "S1A_IW_GRDH_1SDV_20240218T010329" }],
    });

    const res = await request(app)
      .get("/api/v1/sentinel1/search")
      .query({ aoi: "mumbai", limit: 3 });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe("COPERNICUS_DATA_SPACE");
    expect(res.body.query).toBeDefined();
    expect(res.body.query.aoi).toBe("mumbai");
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  test("POST /api/v1/sentinel1/process creates analysis job with real Sentinel-1 flag", async () => {
    const res = await request(app)
      .post("/api/v1/sentinel1/process")
      .send({
        productId: "S1A_IW_GRDH_TEST_MUMBAI_001",
        timeWindowHours: 24,
        metadata: {
          productName: "S1A_IW_GRDH_TEST_MUMBAI_001.SAFE",
          platform: "Sentinel-1A",
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.source).toBe("COPERNICUS_DATA_SPACE");
  });
});
