/**
 * TEMPORARY stand-in for `packages/contracts` (owned by Backend, TRACK_BACKEND §3).
 * Mirrors §3.1–§3.7 as written in the track doc. Delete this folder and repoint
 * the `@ch4se/contracts` alias once the real package lands. Do not add anything
 * here that isn't in the backend contract.
 */

// ---- §3.1 Enums -------------------------------------------------------------

export const INCIDENT_STATUSES = [
  'DETECTED',
  'ANALYZED',
  'ALERT_SENT',
  'ACKNOWLEDGED',
  'INVESTIGATING',
  'RESOLVED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export type MatchResult = 'MATCHED' | 'AMBIGUOUS' | 'NO_REGISTERED_ASSET';

/** Exact set still to be confirmed at kickoff. Ordered highest first. */
export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Actor = 'FETCH_AGENT' | 'RELAY_AGENT' | 'DASHBOARD' | 'SYSTEM';
export type AlertChannel = 'SMS' | 'CALL' | 'DASHBOARD';
export type BriefingSource = 'GROK' | 'TEMPLATE';

// ---- §3.2 Tables ------------------------------------------------------------
// Timestamps are ISO-8601 strings on the client side.

export interface MethaneEvent {
  event_id: string;
  plume_id: string;
  scene_id: string;
  scene_timestamp: string;
  plume_latitude: number;
  plume_longitude: number;
  instrument: string;
  ipcc_sector: string;
  emission_auto: number;
  emission_uncertainty_auto: number | null;
  wind_speed_avg_auto: number | null;
  wind_direction_avg_auto: number | null;
  wind_source_auto: string | null;
  plume_quality: string;
  plume_png: string;
  /** Not yet in the backend contract; needed for the P1 plume_png overlay. [west, south, east, north] */
  plume_bounds?: [number, number, number, number] | null;
  source_name: string;
  provider: string;
  is_replay: boolean;
  ingested_at: string;
}

export interface ProviderSource {
  source_name: string;
  persistence: number | null;
  emission_auto: number | null;
  emission_uncertainty_auto: number | null;
  observation_dates: string[];
  detection_dates: string[];
  explanation: string | null;
}

export interface Asset {
  asset_id: string;
  facility_type: string;
  latitude: number;
  longitude: number;
  operator_name: string;
  site_manager_contact_id: string;
  area_id: string;
  policy_id: string;
}

export interface Contact {
  contact_id: string;
  name: string;
  role: string;
  phone: string;
  area_id: string;
}

export interface MatchCandidate {
  asset_id: string;
  distance_m: number;
}

export interface Incident {
  incident_id: string;
  event_id: string;
  match_result: MatchResult;
  asset_id: string | null;
  distance_m: number | null;
  candidates: MatchCandidate[];
  priority: Priority;
  policy_rule_id: string;
  status: IncidentStatus;
  assigned_contact_id: string;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  alert_id: string;
  incident_id: string;
  contact_id: string;
  channel: AlertChannel;
  sent_at: string;
  delivery_status: string;
  message_text: string;
  briefing_source: BriefingSource;
}

export interface Acknowledgement {
  incident_id: string;
  contact_id: string;
  channel: AlertChannel;
  at: string;
}

export interface Action {
  action_id: string;
  incident_id: string;
  actor: Actor;
  action_name: string;
  detail: string;
  at: string;
}

// ---- §3.6 Core API action I/O ----------------------------------------------
// Only the actions the dashboard calls are typed here.

export interface IncidentSummary {
  incident_id: string;
  status: IncidentStatus;
  priority: Priority;
  asset_id: string | null;
  updated_at: string;
}

export interface ActionInputs {
  get_open_incidents: { limit?: number };
  generate_briefing: { incident_id: string; kind: 'operator' | 'sms' | 'summary' };
  acknowledge_incident: {
    incident_id: string;
    contact_id: string;
    channel: AlertChannel;
    then_status?: 'INVESTIGATING';
  };
  set_incident_status: { incident_id: string; status: IncidentStatus; actor: Actor; note?: string };
  handle_highest_priority: { actor: Actor };
}

export interface ActionOutputs {
  get_open_incidents: IncidentSummary[];
  generate_briefing: { text: string; source: BriefingSource };
  acknowledge_incident: IncidentSummary;
  set_incident_status: IncidentSummary;
  /** Shape is "the orchestration result"; not pinned down yet. */
  handle_highest_priority: { incident_id: string; alert_id?: string; delivery_status?: string; steps?: string[] };
}

export type ActionName = keyof ActionInputs;

// ---- §3.7 Envelope ---------------------------------------------------------

export type ErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_TRANSITION'
  | 'VALIDATION_ERROR'
  | 'UPSTREAM_UNAVAILABLE'
  | 'NO_OPEN_INCIDENTS'
  | 'UNAUTHORIZED';

export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

/** Matching radius R (Track C match.ts default). Not yet exported by contracts; flagged. */
export const MATCH_RADIUS_M = 250;
