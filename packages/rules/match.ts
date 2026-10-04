/** Deterministic asset matching (Product Direction §6.2). Track C owns this file. */

export type MatchResult = "MATCHED" | "AMBIGUOUS" | "NO_REGISTERED_ASSET";

export interface AssetPoint {
  asset_id: string;
  latitude: number;
  longitude: number;
}

export interface MatchCandidate {
  asset_id: string;
  distance_m: number;
}

export interface MatchOutput {
  match_result: MatchResult;
  asset_id?: string;
  distance_m?: number;
  candidates: MatchCandidate[];
}

/** Same mean radius as backend stand-in (merge-compatible distances). */
const EARTH_RADIUS_M = 6_371_008.8;

/** Haversine distance in meters between two WGS84 points. */
export function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Match plume origin to registered assets within radius_m (default 250 m).
 * Assets exactly at distance R are included (boundary case).
 */
export function matchAsset(
  plumeLatLon: { latitude: number; longitude: number },
  assets: AssetPoint[],
  radius_m = 250,
): MatchOutput {
  const within = assets
    .map((a) => ({
      asset_id: a.asset_id,
      distance_m: haversineM(
        plumeLatLon.latitude,
        plumeLatLon.longitude,
        a.latitude,
        a.longitude,
      ),
    }))
    .filter((c) => c.distance_m <= radius_m)
    .sort((a, b) => a.distance_m - b.distance_m || a.asset_id.localeCompare(b.asset_id));

  if (within.length === 0) {
    return { match_result: "NO_REGISTERED_ASSET", candidates: [] };
  }
  if (within.length === 1) {
    return {
      match_result: "MATCHED",
      asset_id: within[0].asset_id,
      distance_m: within[0].distance_m,
      candidates: within,
    };
  }
  return {
    match_result: "AMBIGUOUS",
    candidates: within,
  };
}
