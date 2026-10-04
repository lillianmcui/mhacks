// The Core API's only door to operational state. Reads come from the
// subscribed client cache; writes are the reducers of §3.3 and nothing else.
// Write methods reject with ApiError (NOT_FOUND | INVALID_TRANSITION |
// VALIDATION_ERROR | UPSTREAM_UNAVAILABLE).
import type {
  Acknowledgement,
  Action,
  Actor,
  Alert,
  AlertChannel,
  Asset,
  Contact,
  EscalationPolicy,
  Incident,
  IncidentStatus,
  MethaneEvent,
  ProviderSource,
} from '@ch4se/contracts';

export type EventInput = Omit<MethaneEvent, 'ingested_at'>;
export type CreateIncidentInput = Pick<
  Incident,
  | 'event_id'
  | 'match_result'
  | 'asset_id'
  | 'distance_m'
  | 'candidates'
  | 'priority'
  | 'policy_id'
  | 'policy_rule_id'
  | 'assigned_contact_id'
>;
export type RecordAlertInput = Omit<Alert, 'sent_at'> & { actor: Actor };
export type RecordActionInput = Omit<Action, 'at'>;

export interface Store {
  events(): MethaneEvent[];
  providerSources(): ProviderSource[];
  assets(): Asset[];
  contacts(): Contact[];
  policies(): EscalationPolicy[];
  incidents(): Incident[];
  alerts(): Alert[];
  acknowledgements(): Acknowledgement[];
  actions(): Action[];

  seedAssets(assets: Asset[]): Promise<void>;
  seedContacts(contacts: Contact[]): Promise<void>;
  seedPolicies(policies: EscalationPolicy[]): Promise<void>;
  insertEvent(event: EventInput, source: ProviderSource | null): Promise<void>;
  createIncident(input: CreateIncidentInput): Promise<void>;
  setIncidentStatus(input: {
    incident_id: string;
    status: IncidentStatus;
    actor: Actor;
    note: string | null;
  }): Promise<void>;
  acknowledgeIncident(input: {
    incident_id: string;
    contact_id: string;
    channel: AlertChannel;
    actor: Actor;
  }): Promise<void>;
  recordAlert(input: RecordAlertInput): Promise<void>;
  recordAction(input: RecordActionInput): Promise<void>;

  close(): void;
}
