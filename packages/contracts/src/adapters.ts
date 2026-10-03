// TRACK_BACKEND.md §3.8: in-process interfaces the backend calls and Track C
// implements. Frozen at kickoff; additive changes only.
//
// Where the Core API looks for each implementation (file + named export):
//
//   packages/rules/match.ts                           export matchAsset
//   services/core-api/src/briefing/index.ts           export renderTemplateBriefing
//   services/core-api/src/adapters/grok/index.ts      export grokBriefing
//   services/core-api/src/adapters/relay/index.ts     export relaySend
//
// Until a file exists the backend uses its own stand-in (match, template) or
// reports the upstream as unavailable (Grok -> TEMPLATE, Relay ->
// UPSTREAM_UNAVAILABLE).
import type { BriefingKind, DeliveryStatus, IncidentStatus, MatchResult, Priority } from './enums.ts';
import type { MatchCandidate, MethaneEvent, ProviderSource } from './tables.ts';

export const DEFAULT_MATCH_RADIUS_M = 250;

export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface MatchableAsset extends LatLon {
  asset_id: string;
}

export interface MatchOutcome {
  match_result: MatchResult;
  /** Set only when MATCHED. */
  asset_id?: string;
  /** Set only when MATCHED. */
  distance_m?: number;
  /** Every asset within radius_m, nearest first. Empty for NO_REGISTERED_ASSET. */
  candidates: MatchCandidate[];
}

export type MatchAsset = (plumeLatLon: LatLon, assets: MatchableAsset[], radius_m?: number) => MatchOutcome;

/**
 * Everything a briefing may say. Implementations use ONLY the `display`
 * strings for numbers, dates and counts, and never compute or format a value.
 * Contains no phone numbers.
 */
export interface BriefingInput {
  incident: {
    incident_id: string;
    status: IncidentStatus;
    priority: Priority;
    match_result: MatchResult;
    distance_m: number | null;
    candidates: MatchCandidate[];
  };
  /** Provider fields, verbatim. */
  event: MethaneEvent;
  /** Matched asset (MATCHED) or nearest candidate (AMBIGUOUS); null otherwise. */
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
    source: ProviderSource | null;
    previous_incident_count: number;
  };
  display: {
    emission: string;
    provenance: string;
    scene_timestamp: string;
    /** "Associated asset: ..." / "Nearest registered asset: ..." / no-asset wording. */
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

export type RenderTemplateBriefing = (input: BriefingInput, kind: BriefingKind) => string;

/** Number-check validation happens inside; on failure or timeout it throws. */
export type GrokBriefing = (input: BriefingInput, kind: BriefingKind) => Promise<{ text: string }>;

export interface RelaySendInput {
  to_phone: string;
  channel: 'SMS' | 'CALL';
  text: string;
}
export interface RelaySendResult {
  delivery_status: DeliveryStatus;
  provider_ref: string;
}
/** Throws when Relay cannot be reached. */
export type RelaySend = (input: RelaySendInput) => Promise<RelaySendResult>;
