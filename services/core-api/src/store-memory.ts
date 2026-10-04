// In-memory Store with the same rules as the SpacetimeDB reducers
// (spacetime/module/src/index.ts). Used by the stub Core API and by unit
// tests; test/e2e.stdb.test.ts runs the same scenario against the real module
// so the two cannot drift unnoticed.
import {
  ACTORS,
  ALERT_CHANNELS,
  BRIEFING_SOURCES,
  DELIVERY_STATUSES,
  INCIDENT_STATUSES,
  MATCH_RESULTS,
  PRIORITIES,
  canTransition,
  type Acknowledgement,
  type Action,
  type Alert,
  type Asset,
  type Contact,
  type EscalationPolicy,
  type Incident,
  type IncidentStatus,
  type MethaneEvent,
  type ProviderSource,
} from '@ch4se/contracts';
import { ApiError } from './errors.ts';
import type { Store } from './store.ts';

export function createMemoryStore(now: () => Date = () => new Date()): Store {
  const events = new Map<string, MethaneEvent>();
  const sources = new Map<string, ProviderSource>();
  const assets = new Map<string, Asset>();
  const contacts = new Map<string, Contact>();
  const policies = new Map<string, EscalationPolicy>();
  const incidents = new Map<string, Incident>();
  const alerts = new Map<string, Alert>();
  const acknowledgements = new Map<string, Acknowledgement>();
  const actions = new Map<string, Action>();
  let actionSeq = 0;

  const copy = <T>(value: T): T => structuredClone(value);
  const all = <T>(map: Map<string, T>) => [...map.values()].map(copy);
  const stamp = () => now().toISOString();

  function requireEnum(values: readonly string[], value: string, field: string): void {
    if (!values.includes(value)) {
      throw new ApiError('VALIDATION_ERROR', `${field} must be one of ${values.join(' | ')}; got "${value}"`);
    }
  }
  function requireNonEmpty(value: string, field: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ApiError('VALIDATION_ERROR', `${field} must not be empty`);
    }
  }
  function requireIncident(incident_id: string): Incident {
    const row = incidents.get(incident_id);
    if (!row) throw new ApiError('NOT_FOUND', `incident ${incident_id} not found`);
    return row;
  }
  function logAction(incident_id: string, actor: string, action_name: string, detail: string): void {
    const action_id = `ACT-m${String(++actionSeq).padStart(7, '0')}`;
    actions.set(action_id, { action_id, incident_id, actor: actor as Action['actor'], action_name, detail, at: stamp() });
  }
  function transition(incident_id: string, to: IncidentStatus): IncidentStatus {
    const row = requireIncident(incident_id);
    const from = row.status;
    if (!canTransition(from, to)) {
      throw new ApiError('INVALID_TRANSITION', `incident ${incident_id} cannot go from ${from} to ${to}`);
    }
    incidents.set(incident_id, { ...row, status: to, updated_at: stamp() });
    return from;
  }

  // Each write validates fully before it mutates, so a rejected call leaves
  // every row unchanged, like a rolled-back reducer.
  const store: Store = {
    events: () => all(events),
    providerSources: () => all(sources),
    assets: () => all(assets),
    contacts: () => all(contacts),
    policies: () => all(policies),
    incidents: () => all(incidents),
    alerts: () => all(alerts),
    acknowledgements: () => all(acknowledgements),
    actions: () => all(actions),

    async seedAssets(rows) {
      for (const row of rows) requireNonEmpty(row.asset_id, 'asset_id');
      for (const row of rows) assets.set(row.asset_id, copy(row));
    },
    async seedContacts(rows) {
      for (const row of rows) requireNonEmpty(row.contact_id, 'contact_id');
      for (const row of rows) contacts.set(row.contact_id, copy(row));
    },
    async seedPolicies(rows) {
      for (const row of rows) {
        requireNonEmpty(row.policy_id, 'policy_id');
        for (const rule of row.rules) requireEnum(PRIORITIES, rule.priority, `rule ${rule.rule_id} priority`);
      }
      for (const row of rows) policies.set(row.policy_id, copy(row));
    },

    async insertEvent(event, source) {
      requireNonEmpty(event.event_id, 'event_id');
      requireNonEmpty(event.plume_id, 'plume_id');
      if (events.has(event.event_id) || all(events).some(e => e.plume_id === event.plume_id)) {
        throw new ApiError('VALIDATION_ERROR', `event ${event.event_id} (plume ${event.plume_id}) already ingested`);
      }
      if (source && source.source_name !== event.source_name) {
        throw new ApiError('VALIDATION_ERROR', 'source.source_name does not match event.source_name');
      }
      events.set(event.event_id, { ...copy(event), ingested_at: stamp() });
      if (source && !sources.has(source.source_name)) sources.set(source.source_name, copy(source));
    },

    async createIncident(input) {
      requireEnum(MATCH_RESULTS, input.match_result, 'match_result');
      requireEnum(PRIORITIES, input.priority, 'priority');
      if (!events.has(input.event_id)) throw new ApiError('NOT_FOUND', `event ${input.event_id} not found`);
      if (all(incidents).some(i => i.event_id === input.event_id)) {
        throw new ApiError('VALIDATION_ERROR', `event ${input.event_id} already has an incident`);
      }
      if (input.asset_id !== null && !assets.has(input.asset_id)) {
        throw new ApiError('NOT_FOUND', `asset ${input.asset_id} not found`);
      }
      if (input.assigned_contact_id !== null && !contacts.has(input.assigned_contact_id)) {
        throw new ApiError('NOT_FOUND', `contact ${input.assigned_contact_id} not found`);
      }
      const incident_id = `INC-${String(incidents.size + 1).padStart(4, '0')}`;
      const at = stamp();
      incidents.set(incident_id, { incident_id, ...copy(input), status: 'ANALYZED', created_at: at, updated_at: at });
      logAction(
        incident_id,
        'SYSTEM',
        'create_incident',
        `${input.match_result}; priority ${input.priority} (rule ${input.policy_rule_id})`
      );
    },

    async setIncidentStatus({ incident_id, status, actor, note }) {
      requireEnum(INCIDENT_STATUSES, status, 'status');
      requireEnum(ACTORS, actor, 'actor');
      requireIncident(incident_id);
      if (status === 'ACKNOWLEDGED') {
        throw new ApiError('VALIDATION_ERROR', 'use acknowledge_incident to set ACKNOWLEDGED');
      }
      const from = transition(incident_id, status);
      logAction(incident_id, actor, 'set_incident_status', `${from} -> ${status}${note ? `: ${note}` : ''}`);
    },

    async acknowledgeIncident({ incident_id, contact_id, channel, actor }) {
      requireEnum(ALERT_CHANNELS, channel, 'channel');
      requireEnum(ACTORS, actor, 'actor');
      requireIncident(incident_id);
      if (!contacts.has(contact_id)) throw new ApiError('NOT_FOUND', `contact ${contact_id} not found`);
      const from = transition(incident_id, 'ACKNOWLEDGED');
      acknowledgements.set(incident_id, { incident_id, contact_id, channel, at: stamp() });
      logAction(incident_id, actor, 'acknowledge_incident', `${from} -> ACKNOWLEDGED by ${contact_id} via ${channel}`);
    },

    async recordAlert({ actor, ...row }) {
      requireNonEmpty(row.alert_id, 'alert_id');
      requireEnum(ALERT_CHANNELS, row.channel, 'channel');
      requireEnum(DELIVERY_STATUSES, row.delivery_status, 'delivery_status');
      requireEnum(BRIEFING_SOURCES, row.briefing_source, 'briefing_source');
      requireEnum(ACTORS, actor, 'actor');
      const current = requireIncident(row.incident_id);
      if (!contacts.has(row.contact_id)) throw new ApiError('NOT_FOUND', `contact ${row.contact_id} not found`);
      if (alerts.has(row.alert_id)) throw new ApiError('VALIDATION_ERROR', `alert ${row.alert_id} already exists`);
      alerts.set(row.alert_id, { ...copy(row), sent_at: stamp() });
      if (row.delivery_status !== 'FAILED' && current.status === 'ANALYZED') transition(row.incident_id, 'ALERT_SENT');
      logAction(row.incident_id, actor, 'record_alert', `${row.channel} to ${row.contact_id}: ${row.delivery_status}`);
    },

    async recordAction(row) {
      requireNonEmpty(row.action_id, 'action_id');
      requireNonEmpty(row.action_name, 'action_name');
      requireEnum(ACTORS, row.actor, 'actor');
      requireIncident(row.incident_id);
      if (actions.has(row.action_id)) throw new ApiError('VALIDATION_ERROR', `action ${row.action_id} already exists`);
      actions.set(row.action_id, { ...copy(row), at: stamp() });
    },

    close() {},
  };
  return store;
}
