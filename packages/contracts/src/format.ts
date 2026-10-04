// Display formatters: the ONE place numbers are turned into text.
//
// Agents quote these strings verbatim and the dashboard shows them as-is.
// Nothing else in the system may format an emission, uncertainty, distance,
// count or timestamp. Every function is pure and deterministic.
import type { AlertChannel, IncidentStatus, MatchResult, Priority } from './enums.ts';
import type { MethaneEvent, ProviderSource } from './tables.ts';

export const REPLAY_NOTICE = 'Real historical observation, replayed through CH4SE.';
export const ATTRIBUTION = 'Data: Carbon Mapper';

const INSTRUMENT_LABELS: Record<string, string> = {
  tan: 'Tanager',
  emi: 'EMIT',
  av3: 'AVIRIS-3',
  ang: 'AVIRIS-NG',
  GAO: 'GAO',
};

export function formatInstrument(instrument: string): string {
  return INSTRUMENT_LABELS[instrument] ?? instrument;
}

// Whole numbers, no thousands separators: a separator would split one value
// into two "numbers" for Track C's Grok number-check.
function whole(value: number): string {
  return String(Math.round(value));
}

function oneDecimal(value: number): string {
  return value.toFixed(1);
}

/** "2026-08-13 19:04 UTC". Unparseable input is returned unchanged. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** "2026-08-13" from a date or timestamp string. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}

/** "{emission_auto} ± {emission_uncertainty_auto} kg CH4/hr (Carbon Mapper estimate)" */
export function formatEmission(emission_auto: number, emission_uncertainty_auto: number | null): string {
  if (emission_uncertainty_auto === null) {
    return `${whole(emission_auto)} kg CH4/hr (Carbon Mapper estimate; uncertainty not reported)`;
  }
  return `${whole(emission_auto)} ± ${whole(emission_uncertainty_auto)} kg CH4/hr (Carbon Mapper estimate)`;
}

/** "Carbon Mapper · Tanager · 2026-08-13 19:04 UTC" */
export function formatProvenance(event: Pick<MethaneEvent, 'provider' | 'instrument' | 'scene_timestamp'>): string {
  return `${event.provider} · ${formatInstrument(event.instrument)} · ${formatTimestamp(event.scene_timestamp)}`;
}

/** "184 m from plume origin" */
export function formatDistance(distance_m: number): string {
  return `${whole(distance_m)} m from plume origin`;
}

/** "Associated asset: TX-184 well (184 m from plume origin)" */
export function formatAssociatedAsset(asset_id: string, facility_type: string, distance_m: number): string {
  return `Associated asset: ${asset_id} ${facility_type} (${formatDistance(distance_m)})`;
}

/** "Nearest registered asset: TX-184 well (184 m from plume origin)" */
export function formatNearestAsset(asset_id: string, facility_type: string, distance_m: number): string {
  return `Nearest registered asset: ${asset_id} ${facility_type} (${formatDistance(distance_m)})`;
}

/** "detected on {n} of {m} observation dates since {first_date}" */
export function formatHistory(source: Pick<ProviderSource, 'observation_dates' | 'detection_dates'> | null): string {
  if (!source || source.observation_dates.length === 0) return 'no provider observation history available';
  const first = [...source.observation_dates].sort()[0]!;
  return `detected on ${source.detection_dates.length} of ${source.observation_dates.length} observation dates since ${formatDate(first)}`;
}

/** "persistence 0.6 (Carbon Mapper)", or null when the provider gives none. */
export function formatPersistence(persistence: number | null): string | null {
  return persistence === null ? null : `persistence ${String(persistence)} (Carbon Mapper)`;
}

/** "4.2 m/s from 215° (HRRR)", or null when the provider gives no wind. */
export function formatWind(
  event: Pick<MethaneEvent, 'wind_speed_avg_auto' | 'wind_direction_avg_auto' | 'wind_source_auto'>
): string | null {
  if (event.wind_speed_avg_auto === null) return null;
  const direction = event.wind_direction_avg_auto === null ? '' : ` from ${whole(event.wind_direction_avg_auto)}°`;
  const source = event.wind_source_auto === null ? '' : ` (${event.wind_source_auto})`;
  return `${oneDecimal(event.wind_speed_avg_auto)} m/s${direction}${source}`;
}

/** Dashboard headline (TRACK_FRONTEND.md §3). */
export function formatStatusHeadline(status: IncidentStatus, priority: Priority): string {
  switch (status) {
    case 'DETECTED':
    case 'ANALYZED':
    case 'ALERT_SENT':
      return `${priority} — UNACKNOWLEDGED`;
    case 'ACKNOWLEDGED':
      return 'ACKNOWLEDGED';
    case 'INVESTIGATING':
      return 'ACKNOWLEDGED — INVESTIGATION UNDERWAY';
    case 'RESOLVED':
      return 'RESOLVED';
  }
}

/** "Alert sent to Dana Reyes via SMS at 2026-10-03 18:20 UTC" */
export function formatAlertSent(contact_name: string, channel: AlertChannel, sent_at: string): string {
  return `Alert sent to ${contact_name} via ${channel} at ${formatTimestamp(sent_at)}`;
}

/** "2 unresolved incidents" / "1 unresolved incident" / "no unresolved incidents" */
export function formatOpenCount(count: number): string {
  if (count === 0) return 'no unresolved incidents';
  return `${String(count)} unresolved incident${count === 1 ? '' : 's'}`;
}

/**
 * The asset line for any match result. Wording is deliberate: "associated" or
 * "nearest registered" asset, never "source" or "caused by".
 */
export function formatAssetMatch(match: {
  match_result: MatchResult;
  /** Matched asset, or the nearest candidate when AMBIGUOUS. */
  asset: { asset_id: string; facility_type: string; distance_m: number } | null;
  candidate_count: number;
}): string {
  if (match.match_result === 'NO_REGISTERED_ASSET' || match.asset === null) {
    return 'No registered asset within range of the plume origin';
  }
  const { asset_id, facility_type, distance_m } = match.asset;
  if (match.match_result === 'MATCHED') return formatAssociatedAsset(asset_id, facility_type, distance_m);
  return `${formatNearestAsset(asset_id, facility_type, distance_m)}; ${String(match.candidate_count)} registered assets within range, so the match is ambiguous`;
}

/** "no previous CH4SE incidents" / "1 previous CH4SE incident" */
export function formatPreviousIncidents(count: number): string {
  if (count === 0) return 'no previous CH4SE incidents';
  return `${String(count)} previous CH4SE incident${count === 1 ? '' : 's'}`;
}
