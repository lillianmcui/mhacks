// TRACK_BACKEND.md §3.6-§3.7: Core API action inputs, outputs and envelope.
//
// Transport: POST /actions/{action_name}, JSON body, `Authorization: Bearer`.
// Every number an agent might speak is returned twice: the raw value and a
// `display` string from format.ts. Agents quote display strings verbatim.
import type {
  Actor,
  AlertChannel,
  BriefingKind,
  BriefingSource,
  DeliveryStatus,
  ErrorCode,
  IncidentStatus,
  MatchResult,
  Priority,
} from './enums.ts';
import type {
  Asset,
  Contact,
  EscalationPolicy,
  Incident,
  MatchCandidate,
  MethaneEvent,
  PolicyRule,
  ProviderSource,
} from './tables.ts';

// ---- Envelope (§3.7) -------------------------------------------------------

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  error: { code: ErrorCode; message: string };
}
export type ApiResponse<T> = ApiOk<T> | ApiErr;

// ---- Shared output shapes --------------------------------------------------

export interface IncidentSummary {
  incident_id: string;
  event_id: string;
  status: IncidentStatus;
  priority: Priority;
  policy_rule_id: string;
  match_result: MatchResult;
  asset_id: string | null;
  facility_type: string | null;
  distance_m: number | null;
  assigned_contact_id: string | null;
  emission_auto: number;
  emission_uncertainty_auto: number | null;
  scene_timestamp: string;
  is_replay: boolean;
  created_at: string;
  updated_at: string;
  display: {
    headline: string;
    /** "Associated asset: ..." / "Nearest registered asset: ..." / no-asset wording. */
    asset: string;
    emission: string;
    provenance: string;
  };
}

export interface CandidateDetail extends MatchCandidate {
  facility_type: string | null;
  display: { distance: string };
}

export interface IncidentDetail {
  incident: Incident;
  event: MethaneEvent;
  /** The matched asset (MATCHED) or the nearest candidate (AMBIGUOUS); null otherwise. */
  asset: Asset | null;
  candidates: CandidateDetail[];
  assigned_contact: Contact | null;
  status: IncidentStatus;
  display: IncidentSummary['display'] & {
    distance: string | null;
    wind: string | null;
    replay_notice: string;
    attribution: string;
  };
}

export interface AssetDetail {
  asset: Asset;
  /** The asset's site manager. */
  contact: Contact | null;
}

export interface Evidence {
  incident_id: string;
  event: MethaneEvent;
  is_replay: boolean;
  provenance: string;
  display: {
    emission: string;
    provenance: string;
    scene_timestamp: string;
    wind: string | null;
    replay_notice: string;
    attribution: string;
  };
}

export interface EscalationPolicyResult {
  policy: EscalationPolicy;
  /** The rule that fired for the incident; null when looked up by asset_id. */
  fired_rule: PolicyRule | null;
  /** Role the incident was routed to; null when looked up by asset_id. */
  notify_role: string | null;
}

export interface AssetHistory {
  incident_id: string;
  source: ProviderSource | null;
  /** Earlier CH4SE incidents on the same asset or the same provider source. */
  previous_incidents: IncidentSummary[];
  display: {
    history: string;
    persistence: string | null;
    previous_incidents: string;
  };
}

export interface Briefing {
  text: string;
  source: BriefingSource;
}

export interface NotifyResult {
  alert_id: string;
  delivery_status: DeliveryStatus;
  /** Exact text that was handed to Relay (when a send occurred). */
  message_text?: string;
  briefing_source?: BriefingSource;
}

export const HANDLE_STEPS = [
  'get_open_incidents',
  'get_incident',
  'get_asset',
  'get_escalation_policy',
  'generate_briefing',
  'notify_operator',
] as const;
export type HandleStepName = (typeof HANDLE_STEPS)[number];

export interface HandleStep {
  step: HandleStepName;
  ok: boolean;
  detail: string;
}

/** Addition (flagged): the Fetch sequence, shared with the dashboard fallback. */
export interface HandleResult {
  incident: IncidentSummary;
  steps: HandleStep[];
  briefing: Briefing | null;
  /**
   * The alert this run sent, or the earlier one when the incident was already
   * ALERT_SENT (nothing is sent twice). null when the send failed; see the
   * notify_operator step.
   */
  alert: NotifyResult | null;
}

// ---- Action table (§3.6) ---------------------------------------------------

export interface ActionIO {
  get_open_incidents: { input: { limit?: number }; output: IncidentSummary[] };
  get_incident: { input: { incident_id: string }; output: IncidentDetail };
  get_asset: { input: { asset_id: string }; output: AssetDetail };
  get_evidence: { input: { incident_id: string }; output: Evidence };
  get_escalation_policy: {
    input: { asset_id: string } | { incident_id: string };
    output: EscalationPolicyResult;
  };
  get_asset_history: { input: { incident_id: string }; output: AssetHistory };
  acknowledge_incident: {
    input: { incident_id: string; contact_id: string; channel: AlertChannel; then_status?: 'INVESTIGATING' };
    output: IncidentSummary;
  };
  set_incident_status: {
    input: { incident_id: string; status: IncidentStatus; actor: Actor; note?: string };
    output: IncidentSummary;
  };
  generate_briefing: { input: { incident_id: string; kind: BriefingKind }; output: Briefing };
  notify_operator: {
    input: {
      incident_id: string;
      channel: 'SMS' | 'CALL';
      actor?: Actor;
      /** When set, Relay gets this text instead of generating a second briefing. */
      briefing?: Briefing;
    };
    output: NotifyResult;
  };
  record_action: {
    input: { incident_id: string; actor: Actor; action_name: string; detail: string };
    output: { action_id: string };
  };
  handle_highest_priority: { input: { actor: Actor }; output: HandleResult };
}

export type ActionName = keyof ActionIO;
export type ActionInput<N extends ActionName> = ActionIO[N]['input'];
export type ActionOutput<N extends ActionName> = ActionIO[N]['output'];

export const ACTION_NAMES = [
  'get_open_incidents',
  'get_incident',
  'get_asset',
  'get_evidence',
  'get_escalation_policy',
  'get_asset_history',
  'acknowledge_incident',
  'set_incident_status',
  'generate_briefing',
  'notify_operator',
  'record_action',
  'handle_highest_priority',
] as const satisfies readonly ActionName[];
