import { describe, expect, it } from "vitest";
import { haversineM, matchAsset, type AssetPoint } from "./match.js";

const PLUME = { latitude: 31.85, longitude: -103.45 };

function asset(id: string, latOffsetM: number, lonOffsetM = 0): AssetPoint {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((PLUME.latitude * Math.PI) / 180);
  return {
    asset_id: id,
    latitude: PLUME.latitude + latOffsetM / mPerDegLat,
    longitude: PLUME.longitude + lonOffsetM / mPerDegLon,
  };
}

describe("matchAsset", () => {
  it("MATCHED when exactly one asset within R", () => {
    const out = matchAsset(PLUME, [asset("TX-184", 100)], 250);
    expect(out.match_result).toBe("MATCHED");
    expect(out.asset_id).toBe("TX-184");
    expect(out.distance_m).toBeGreaterThan(90);
    expect(out.distance_m).toBeLessThan(110);
    expect(out.candidates).toHaveLength(1);
  });

  it("AMBIGUOUS when more than one asset within R", () => {
    const out = matchAsset(
      PLUME,
      [asset("TX-184", 50), asset("TX-185", 120)],
      250,
    );
    expect(out.match_result).toBe("AMBIGUOUS");
    expect(out.asset_id).toBeUndefined();
    expect(out.candidates.map((c) => c.asset_id)).toEqual(["TX-184", "TX-185"]);
    expect(out.candidates[0].distance_m).toBeLessThan(out.candidates[1].distance_m);
  });

  it("NO_REGISTERED_ASSET when none within R", () => {
    const out = matchAsset(PLUME, [asset("TX-999", 400)], 250);
    expect(out.match_result).toBe("NO_REGISTERED_ASSET");
    expect(out.candidates).toEqual([]);
  });

  it("includes asset at exactly R (boundary)", () => {
    const r = 250;
    const d = haversineM(PLUME.latitude, PLUME.longitude, PLUME.latitude, PLUME.longitude);
    expect(d).toBe(0);
    const onBoundary = asset("TX-BND", r);
    const dist = haversineM(
      PLUME.latitude,
      PLUME.longitude,
      onBoundary.latitude,
      onBoundary.longitude,
    );
    expect(dist).toBeLessThanOrEqual(r + 0.5);
    const out = matchAsset(PLUME, [onBoundary], r);
    expect(out.match_result).toBe("MATCHED");
    expect(out.asset_id).toBe("TX-BND");
  });
});
