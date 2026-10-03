/**
 * TEMPORARY stand-in for `packages/contracts/format.ts` (Backend).
 * The dashboard must never format numbers itself; every number shown in the UI
 * goes through one of these. Function names are guesses until the backend
 * publishes the real module, so keep call sites going through this import only.
 */

const INSTRUMENT_NAMES: Record<string, string> = {
  tan: 'Tanager',
  emi: 'EMIT',
  av3: 'AVIRIS-3',
  ang: 'AVIRIS-NG',
  GAO: 'GAO',
};

export function formatInstrument(instrument: string): string {
  return INSTRUMENT_NAMES[instrument] ?? instrument;
}

function trimNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** "{emission_auto} ± {emission_uncertainty_auto} kg CH4/hr (Carbon Mapper estimate)" */
export function formatEmission(emission: number, uncertainty: number | null): string {
  const base = trimNumber(emission);
  const unc = uncertainty == null ? '' : ` ± ${trimNumber(uncertainty)}`;
  return `${base}${unc} kg CH4/hr (Carbon Mapper estimate)`;
}

export function formatDistance(distance_m: number): string {
  return `${trimNumber(distance_m)} m`;
}

/** "2026-08-13 19:04 UTC" */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** "19:04:12" (UTC), for timeline rows. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(11, 19);
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

/** "Carbon Mapper · Tanager · 2026-08-13 19:04 UTC" */
export function formatProvenance(provider: string, instrument: string, scene_timestamp: string): string {
  return `${provider} · ${formatInstrument(instrument)} · ${formatTimestamp(scene_timestamp)}`;
}

/** "detected on {n} of {m} observation dates since {first_date}" */
export function formatHistory(detection_dates: string[], observation_dates: string[]): string {
  const first = [...observation_dates].sort()[0];
  const since = first ? ` since ${formatDate(first)}` : '';
  return `detected on ${detection_dates.length} of ${observation_dates.length} observation dates${since}`;
}

/** "{wind_speed_avg_auto} m/s from {wind_direction_avg_auto}° (HRRR)" */
export function formatWind(speed: number, direction: number, source: string | null): string {
  return `${speed.toFixed(1)} m/s from ${Math.round(direction)}° (${source ?? 'HRRR'})`;
}

export function formatPersistence(persistence: number): string {
  return `${Math.round(persistence * 100)}% persistence (Carbon Mapper)`;
}
