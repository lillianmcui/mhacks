// TRACK_BACKEND.md §3.2, as plain JSON shapes (snake_case, ISO-8601 strings for
// CH4SE timestamps). This is what the Core API returns and what fixtures in
// data/fixtures/company/ must look like. Provider field names follow Product
// Direction §5.3 exactly; do not rename them.
//
// Field categories: [OBS] Carbon Mapper, [DER] derived by CH4SE,
// [SYN] synthetic demo data, [LLM] LLM- or template-generated.
import type {
  Actor,
  AlertChannel,
  BriefingSource,
  DeliveryStatus,
  IncidentStatus,
  MatchResult,
  Priority,
} from './enums.ts';

export const PROVIDER_CARBON_MAPPER = 'Carbon Mapper';

/** One Carbon Mapper plume. */
export interface MethaneEvent {
  event_id: string; // [DER] internal key; never source_name
  plume_id: string; // [OBS]
  scene_id: string; // [OBS]
  scene_timestamp: string; // [OBS] verbatim provider string
  plume_latitude: number; // [OBS]
  plume_longitude: number; // [OBS]
  instrument: string; // [OBS] tan | emi | av3 | ang | GAO
  ipcc_sector: string | null; // [OBS]
  emission_auto: number; // [OBS] kg CH4/hr
  emission_uncertainty_auto: number | null; // [OBS]
  wind_speed_avg_auto: number | null; // [OBS]
  wind_direction_avg_auto: number | null; // [OBS]
  wind_source_auto: string | null; // [OBS]
  plume_quality: string | null; // [OBS]
  plume_png: string | null; // [OBS] URL or fixture path
  source_name: string; // [OBS] reference only, not a key
  provider: string; // [DER] "Carbon Mapper" for P0
  is_replay: boolean; // [DER] always true in the demo
  ingested_at: string; // [DER] replay time, not observation time
}

/** Snapshot of /catalog/source/{source_name}. Addition (flagged). */
export interface ProviderSource {
  source_name: string; // [OBS]
  persistence: number | null; // [OBS]
  emission_auto: number | null; // [OBS]
  emission_uncertainty_auto: number | null; // [OBS]
  observation_dates: string[]; // [OBS]
  detection_dates: string[]; // [OBS]
  explanation: string | null; // [OBS]
}

/** All fields [SYN]: real OGIM location, synthetic ownership. */
export interface Asset {
  asset_id: string;
  facility_type: string;
  latitude: number;
  longitude: number;
  operator_name: string; // the fictional company; never the OGIM operator
  site_manager_contact_id: string;
  area_id: string;
  policy_id: string;
}

/** All fields [SYN]. Phones belong to teammates only. */
export interface Contact {
  contact_id: string;
  name: string;
  role: string;
  phone: string;
  area_id: string;
}

/**
 * Named thresholds (§3.5). Values are written into the policy fixture at
 * kickoff, before anyone looks at the MAIN event's numbers.
 */
export interface PolicyThresholds {
  EMISSION_CRITICAL_KGH: number;
  EMISSION_HIGH_KGH: number;
  RECURRENCE_MIN_DETECTIONS: number;
}
export type EmissionThresholdName = 'EMISSION_CRITICAL_KGH' | 'EMISSION_HIGH_KGH';
export type RecurrenceThresholdName = 'RECURRENCE_MIN_DETECTIONS';

/** Every condition present must hold. An omitted condition is not checked. */
export interface PolicyRuleConditions {
  /** emission_auto >= thresholds[min_emission] */
  min_emission?: EmissionThresholdName;
  /** len(detection_dates) >= thresholds[min_detections] */
  min_detections?: RecurrenceThresholdName;
  match_results?: MatchResult[];
  facility_types?: string[];
}

export interface PolicyRule {
  rule_id: string;
  conditions: PolicyRuleConditions;
  priority: Priority;
  notify_role: string;
}

/** All fields [SYN]. Rules are evaluated in order; the first match wins. */
export interface EscalationPolicy {
  policy_id: string;
  thresholds: PolicyThresholds;
  rules: PolicyRule[];
  ambiguous_route_role: string;
  no_asset_route_role: string;
}

export interface MatchCandidate {
  asset_id: string;
  distance_m: number;
}

/** All fields [DER]. */
export interface Incident {
  incident_id: string;
  event_id: string;
  match_result: MatchResult;
  asset_id: string | null;
  distance_m: number | null;
  candidates: MatchCandidate[];
  priority: Priority;
  policy_id: string; // addition (flagged): the policy policy_rule_id belongs to
  policy_rule_id: string;
  status: IncidentStatus;
  assigned_contact_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  alert_id: string; // [DER]
  incident_id: string; // [DER]
  contact_id: string; // [DER]
  channel: AlertChannel; // [DER]
  sent_at: string; // [DER]
  delivery_status: DeliveryStatus; // [DER]
  message_text: string; // [LLM]
  briefing_source: BriefingSource; // [DER]
}

/** All fields [DER]. */
export interface Acknowledgement {
  incident_id: string;
  contact_id: string;
  channel: AlertChannel;
  at: string;
}

/** Audit log. All fields [DER]. */
export interface Action {
  action_id: string;
  incident_id: string;
  actor: Actor;
  action_name: string;
  detail: string;
  at: string;
}
