import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { haversineM, matchAsset, type AssetPoint } from "./match.ts";

const PLUME = { latitude: 31.85, longitude: -103.45 };
const HERE = dirname(fileURLToPath(import.meta.url));

function asset(id: string, latOffsetM: number, lonOffsetM = 0): AssetPoint {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((PLUME.latitude * Math.PI) / 180);
  return {
    asset_id: id,
    latitude: PLUME.latitude + latOffsetM / mPerDegLat,
    longitude: PLUME.longitude + lonOffsetM / mPerDegLon,
  };
}

test("MATCHED when exactly one asset within R", () => {
  const out = matchAsset(PLUME, [asset("TX-184", 100)], 250);
  assert.equal(out.match_result, "MATCHED");
  assert.equal(out.asset_id, "TX-184");
  assert.ok((out.distance_m ?? 0) > 90);
  assert.ok((out.distance_m ?? 0) < 110);
  assert.equal(out.candidates.length, 1);
});

test("AMBIGUOUS when more than one asset within R", () => {
  const out = matchAsset(PLUME, [asset("TX-184", 50), asset("TX-185", 120)], 250);
  assert.equal(out.match_result, "AMBIGUOUS");
  assert.equal(out.asset_id, undefined);
  assert.deepEqual(
    out.candidates.map((c) => c.asset_id),
    ["TX-184", "TX-185"],
  );
  assert.ok(out.candidates[0].distance_m < out.candidates[1].distance_m);
});

test("NO_REGISTERED_ASSET when none within R", () => {
  const out = matchAsset(PLUME, [asset("TX-999", 400)], 250);
  assert.equal(out.match_result, "NO_REGISTERED_ASSET");
  assert.deepEqual(out.candidates, []);
});

test("includes asset at exactly R (boundary)", () => {
  const r = 250;
  const onBoundary = asset("TX-BND", r);
  const dist = haversineM(
    PLUME.latitude,
    PLUME.longitude,
    onBoundary.latitude,
    onBoundary.longitude,
  );
  assert.ok(dist <= r + 0.5);
  const out = matchAsset(PLUME, [onBoundary], r);
  assert.equal(out.match_result, "MATCHED");
  assert.equal(out.asset_id, "TX-BND");
});

test("MATCHED against company fixture when plume is at asset coords", () => {
  const raw = JSON.parse(
    readFileSync(join(HERE, "../../data/fixtures/company/assets.json"), "utf8"),
  ) as AssetPoint[];
  const plume = { latitude: raw[0].latitude, longitude: raw[0].longitude };
  const out = matchAsset(plume, raw, 250);
  assert.equal(out.match_result, "MATCHED");
  assert.equal(out.asset_id, "TX-184");
  assert.equal(out.distance_m, 0);
});
