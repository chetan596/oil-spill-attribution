const { haversineDistance, EARTH_RADIUS_KM } = require("../../src/scoring/haversine");

describe("Haversine Distance Calculator", () => {
  it("should return 0 for identical coordinates", () => {
    const dist = haversineDistance(18.921, 72.832, 18.921, 72.832);
    expect(dist).toBe(0.0);
  });

  it("should calculate accurate known distance between London and Paris (~343 km)", () => {
    // London: 51.5074°N, 0.1278°W (-0.1278)
    // Paris: 48.8566°N, 2.3522°E
    const dist = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(340);
    expect(dist).toBeLessThan(346);
  });

  it("should calculate accurate known distance between Mumbai and Dubai (~1930 km)", () => {
    // Mumbai: 18.921, 72.832
    // Dubai: 25.2048, 55.2708
    const dist = haversineDistance(18.921, 72.832, 25.2048, 55.2708);
    expect(dist).toBeGreaterThan(1920);
    expect(dist).toBeLessThan(1945);
  });

  it("should return NaN for invalid coordinate inputs", () => {
    expect(haversineDistance(null, 72.8, 18.9, 72.8)).toBeNaN();
    expect(haversineDistance(18.9, undefined, 18.9, 72.8)).toBeNaN();
    expect(haversineDistance(NaN, 72.8, 18.9, 72.8)).toBeNaN();
    expect(haversineDistance("18.9", 72.8, 18.9, 72.8)).toBeNaN();
  });

  it("should return NaN for out-of-bounds coordinates", () => {
    expect(haversineDistance(95.0, 72.8, 18.9, 72.8)).toBeNaN();
    expect(haversineDistance(-91.0, 72.8, 18.9, 72.8)).toBeNaN();
    expect(haversineDistance(18.9, 185.0, 18.9, 72.8)).toBeNaN();
    expect(haversineDistance(18.9, -190.0, 18.9, 72.8)).toBeNaN();
  });

  it("should be symmetric (d(A, B) === d(B, A))", () => {
    const d1 = haversineDistance(18.9, 72.8, 19.5, 73.1);
    const d2 = haversineDistance(19.5, 73.1, 18.9, 72.8);
    expect(d1).toBe(d2);
  });
});
