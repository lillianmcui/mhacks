import type { Feature, FeatureCollection, Polygon } from 'geojson';

const EARTH_RADIUS_M = 6371008.8;
const STEPS = 64;

/** Geodesic circle as a GeoJSON polygon, for drawing the matching radius R. */
export function circlePolygon(lat: number, lon: number, radius_m: number): Feature<Polygon> {
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const δ = radius_m / EARTH_RADIUS_M;
  const ring: [number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const θ = (i / STEPS) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };
