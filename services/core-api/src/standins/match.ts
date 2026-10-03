// Backend stand-in for Track C's packages/rules/match.ts, used ONLY while that
// file does not exist (and by the stub Core API). Same contract (§3.8):
// haversine distance, inclusive radius, candidates nearest first.
import { DEFAULT_MATCH_RADIUS_M, type MatchAsset } from '@ch4se/contracts';

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

export const standinMatchAsset: MatchAsset = (plume, assets, radius_m = DEFAULT_MATCH_RADIUS_M) => {
  const candidates = assets
    .map(asset => {
      const dLat = rad(asset.latitude - plume.latitude);
      const dLon = rad(asset.longitude - plume.longitude);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(plume.latitude)) * Math.cos(rad(asset.latitude)) * Math.sin(dLon / 2) ** 2;
      return { asset_id: asset.asset_id, distance_m: 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)) };
    })
    .filter(candidate => candidate.distance_m <= radius_m)
    .sort((a, b) => a.distance_m - b.distance_m || (a.asset_id < b.asset_id ? -1 : 1));
  if (candidates.length === 0) return { match_result: 'NO_REGISTERED_ASSET', candidates };
  if (candidates.length > 1) return { match_result: 'AMBIGUOUS', candidates };
  return { match_result: 'MATCHED', asset_id: candidates[0]!.asset_id, distance_m: candidates[0]!.distance_m, candidates };
};
