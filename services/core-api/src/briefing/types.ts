/**
 * Temporary local mirror of packages/contracts BriefingInput for offline tests.
 * After merging backend: delete this shape and `import type { BriefingInput, BriefingKind } from '@ch4se/contracts'`.
 */
export type BriefingKind = "operator" | "sms" | "summary";

export type MatchResult = "MATCHED" | "AMBIGUOUS" | "NO_REGISTERED_ASSET";
export type IncidentStatus =
  | "DETECTED"
  | "ANALYZED"
  | "ALERT_SENT"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "RESOLVED";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface MatchCandidate {
  asset_id: string;
  distance_m: number;
}

/** Mirrors contracts BriefingInput. Implementations quote `display` only. */
export interface BriefingInput {
  incident: {
    incident_id: string;
    status: IncidentStatus;
    priority: Priority;
    match_result: MatchResult;
    distance_m: number | null;
    candidates: MatchCandidate[];
  };
  event: {
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
    source_name: string;
    provider: string;
    is_replay: boolean;
    ingested_at: string;
  };
  asset: {
    asset_id: string;
    facility_type: string;
    operator_name: string;
    area_id: string;
  } | null;
  assigned_contact: { name: string; role: string } | null;
  policy_rule: {
    policy_id: string;
    rule_id: string;
    priority: Priority;
    notify_role: string;
  };
  history: {
    source: {
      source_name: string;
      persistence: number | null;
      emission_auto: number | null;
      emission_uncertainty_auto: number | null;
      observation_dates: string[];
      detection_dates: string[];
      explanation: string | null;
    } | null;
    previous_incident_count: number;
  };
  display: {
    emission: string;
    provenance: string;
    scene_timestamp: string;
    asset: string;
    distance: string | null;
    history: string;
    persistence: string | null;
    wind: string | null;
    previous_incidents: string;
    replay_notice: string;
    attribution: string;
  };
}
