// The one implementation of every shared action (TRACK_BACKEND.md §3.6).
// Fetch, Relay and the dashboard fallback all land here; nothing else changes
// state. Handlers throw ApiError; http.ts turns that into the envelope.
import { randomUUID } from 'node:crypto';
import {
  ACTORS,
  ALERT_CHANNELS,
  BRIEFING_KINDS,
  INCIDENT_STATUSES,
  UNACKNOWLEDGED_STATUSES,
  isOneOf,
  type ActionInput,
  type ActionName,
  type ActionOutput,
  type Actor,
  type Briefing,
  type BriefingKind,
  type HandleResult,
  type HandleStep,
  type HandleStepName,
  type NotifyResult,
} from '@ch4se/contracts';
import { ApiError } from './errors.ts';
import type { Ports } from './ports.ts';
import { standinTemplateBriefing } from './standins/briefing.ts';
import type { Store } from './store.ts';
import {
  assetHistory,
  briefingInput,
  escalationPolicy,
  evidence,
  incidentDetail,
  incidentSummary,
  openIncidents,
  requireIncident,
} from './views.ts';

export type Actions = { [N in ActionName]: (input: unknown) => Promise<ActionOutput<N>> };

export interface ActionDeps {
  store: Store;
  ports: Ports;
  /** Suffix for ALR-/ACT- ids; injectable for tests. */
  newId?: () => string;
  log?: (message: string) => void;
}

// ---- Input validation ------------------------------------------------------

type Fields = Record<string, unknown>;

function fields(input: unknown): Fields {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError('VALIDATION_ERROR', 'request body must be a JSON object');
  }
  return input as Fields;
}

function text(input: Fields, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError('VALIDATION_ERROR', `${key} is required and must be a non-empty string`);
  }
  return value;
}

function choice<T extends string>(input: Fields, key: string, values: readonly T[]): T {
  const value = input[key];
  if (!isOneOf(values, value)) {
    throw new ApiError('VALIDATION_ERROR', `${key} must be one of ${values.join(' | ')}`);
  }
  return value;
}

function optional<T>(input: Fields, key: string, read: () => T): T | undefined {
  return input[key] === undefined || input[key] === null ? undefined : read();
}

const NOTIFY_CHANNELS = ['SMS', 'CALL'] as const;

export function createActions({ store, ports, newId, log = () => {} }: ActionDeps): Actions {
  const id = newId ?? (() => randomUUID().replaceAll('-', '').slice(0, 12));

  async function generateBriefing(incident_id: string, kind: BriefingKind): Promise<Briefing> {
    const input = briefingInput(store, incident_id);
    if (ports.grokBriefing) {
      try {
        const { text: grokText } = await ports.grokBriefing(input, kind);
        if (typeof grokText === 'string' && grokText.trim() !== '') return { text: grokText, source: 'GROK' };
        log(`grok returned empty text for ${incident_id}; using template`);
      } catch (error) {
        log(`grok failed for ${incident_id} (${error instanceof Error ? error.message : String(error)}); using template`);
      }
    }
    // The template is the last resort; if it throws, the stand-in still says
    // something true rather than failing the alert.
    try {
      return { text: ports.renderTemplateBriefing(input, kind), source: 'TEMPLATE' };
    } catch (error) {
      log(`template failed for ${incident_id} (${error instanceof Error ? error.message : String(error)}); using stand-in`);
      return { text: standinTemplateBriefing(input, kind), source: 'TEMPLATE' };
    }
  }

  async function recordAction(incident_id: string, actor: Actor, action_name: string, detail: string) {
    const action_id = `ACT-${id()}`;
    await store.recordAction({ action_id, incident_id, actor, action_name, detail });
    return { action_id };
  }

  // `prepared` lets a caller that already generated the briefing send exactly
  // that text instead of generating a second one.
  async function notifyOperator(
    incident_id: string,
    channel: 'SMS' | 'CALL',
    actor: Actor,
    prepared?: Briefing
  ): Promise<NotifyResult> {
    const incident = requireIncident(store, incident_id);
    // Re-notifying after ALERT_SENT is allowed (e.g. escalating SMS to CALL);
    // once someone has acknowledged there is nobody left to alert.
    if (!UNACKNOWLEDGED_STATUSES.includes(incident.status)) {
      throw new ApiError('INVALID_TRANSITION', `incident ${incident_id} is ${incident.status}; no notification sent`);
    }
    const contact = store.contacts().find(c => c.contact_id === incident.assigned_contact_id);
    if (!contact) throw new ApiError('VALIDATION_ERROR', `incident ${incident_id} has no assigned contact to notify`);
    const briefing = prepared ?? (await generateBriefing(incident_id, channel === 'SMS' ? 'sms' : 'operator'));

    // A failed send must leave the incident where it was (ANALYZED stays
    // ANALYZED) but still shows up on the timeline.
    const unavailable = async (reason: string): Promise<never> => {
      await recordAction(incident_id, actor, 'notify_operator_failed', `${channel} to ${contact.contact_id}: ${reason}`);
      throw new ApiError('UPSTREAM_UNAVAILABLE', `Relay unavailable: ${reason}`);
    };
    if (!ports.relaySend) return unavailable(ports.describe.relay);
    let sent;
    try {
      sent = await ports.relaySend({ to_phone: contact.phone, channel, text: briefing.text });
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error));
    }

    const alert_id = `ALR-${id()}`;
    await store.recordAlert({
      alert_id,
      incident_id,
      contact_id: contact.contact_id,
      channel,
      delivery_status: sent.delivery_status,
      message_text: briefing.text,
      briefing_source: briefing.source,
      actor,
    });
    return { alert_id, delivery_status: sent.delivery_status };
  }

  // The Fetch agent's sequence. Each step leaves an Action row so the
  // dashboard timeline shows the agent working.
  async function handleHighestPriority(actor: Actor): Promise<HandleResult> {
    // Incidents nobody has been alerted about come first. When every
    // unacknowledged incident is already ALERT_SENT, the run reports on the
    // most urgent one without sending again.
    const unacknowledged = openIncidents(store).filter(incident => UNACKNOWLEDGED_STATUSES.includes(incident.status));
    const top = unacknowledged.find(incident => incident.status !== 'ALERT_SENT') ?? unacknowledged[0];
    if (!top) throw new ApiError('NO_OPEN_INCIDENTS', 'there are no unacknowledged incidents to handle');
    const incident_id = top.incident_id;
    const steps: HandleStep[] = [];
    const step = async (name: HandleStepName, ok: boolean, detail: string) => {
      steps.push({ step: name, ok, detail });
      await recordAction(incident_id, actor, name, detail);
    };

    await step('get_open_incidents', true, `selected ${incident_id} (${top.priority})`);
    const detail = incidentDetail(store, incident_id);
    await step('get_incident', true, `${detail.incident.match_result}; status ${detail.status}`);
    await step('get_asset', true, detail.display.asset);
    const policy = escalationPolicy(store, { incident_id });
    await step(
      'get_escalation_policy',
      true,
      `policy ${policy.policy.policy_id} rule ${detail.incident.policy_rule_id} -> ${policy.notify_role ?? 'no role'}`
    );
    const briefing = await generateBriefing(incident_id, 'sms');
    await step('generate_briefing', true, `sms briefing from ${briefing.source}`);

    if (top.status === 'ALERT_SENT') {
      const sent = store
        .alerts()
        .filter(a => a.incident_id === incident_id && a.delivery_status !== 'FAILED')
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
        .at(-1);
      const existing = sent ? { alert_id: sent.alert_id, delivery_status: sent.delivery_status } : null;
      await step(
        'notify_operator',
        true,
        `already alerted${existing ? ` (alert ${existing.alert_id})` : ''}; awaiting acknowledgement, not sent again`
      );
      return { incident: incidentSummary(store, incident_id), steps, briefing, alert: existing };
    }

    let alert: NotifyResult | null = null;
    try {
      alert = await notifyOperator(incident_id, 'SMS', actor, briefing);
      steps.push({
        step: 'notify_operator',
        ok: alert.delivery_status !== 'FAILED',
        detail: `alert ${alert.alert_id}: ${alert.delivery_status}`,
      });
    } catch (error) {
      // notifyOperator already logged the failure; the run still reports back.
      if (!(error instanceof ApiError) || error.code === 'NOT_FOUND') throw error;
      steps.push({ step: 'notify_operator', ok: false, detail: `${error.code}: ${error.message}` });
    }
    return { incident: incidentSummary(store, incident_id), steps, briefing, alert };
  }

  return {
    async get_open_incidents(input) {
      const body = fields(input ?? {});
      const limit = optional(body, 'limit', () => {
        const value = body.limit;
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
          throw new ApiError('VALIDATION_ERROR', 'limit must be a positive integer');
        }
        return value;
      });
      const open = openIncidents(store);
      return limit === undefined ? open : open.slice(0, limit);
    },

    async get_incident(input) {
      return incidentDetail(store, text(fields(input), 'incident_id'));
    },

    async get_asset(input) {
      const asset_id = text(fields(input), 'asset_id');
      const asset = store.assets().find(a => a.asset_id === asset_id);
      if (!asset) throw new ApiError('NOT_FOUND', `asset ${asset_id} not found`);
      return { asset, contact: store.contacts().find(c => c.contact_id === asset.site_manager_contact_id) ?? null };
    },

    async get_evidence(input) {
      return evidence(store, text(fields(input), 'incident_id'));
    },

    async get_escalation_policy(input) {
      const body = fields(input);
      if (body.incident_id !== undefined) return escalationPolicy(store, { incident_id: text(body, 'incident_id') });
      if (body.asset_id !== undefined) return escalationPolicy(store, { asset_id: text(body, 'asset_id') });
      throw new ApiError('VALIDATION_ERROR', 'asset_id or incident_id is required');
    },

    async get_asset_history(input) {
      return assetHistory(store, text(fields(input), 'incident_id'));
    },

    async acknowledge_incident(input) {
      const body = fields(input);
      const incident_id = text(body, 'incident_id');
      const contact_id = text(body, 'contact_id');
      const channel = choice(body, 'channel', ALERT_CHANNELS);
      const then_status = optional(body, 'then_status', () => choice(body, 'then_status', ['INVESTIGATING'] as const));
      // Relay is the only non-dashboard surface an operator answers on.
      const actor: Actor = channel === 'DASHBOARD' ? 'DASHBOARD' : 'RELAY_AGENT';
      await store.acknowledgeIncident({ incident_id, contact_id, channel, actor });
      if (then_status) await store.setIncidentStatus({ incident_id, status: then_status, actor, note: null });
      return incidentSummary(store, incident_id);
    },

    async set_incident_status(input) {
      const body = fields(input);
      const incident_id = text(body, 'incident_id');
      const status = choice(body, 'status', INCIDENT_STATUSES);
      const actor = choice(body, 'actor', ACTORS);
      const note = optional(body, 'note', () => text(body, 'note')) ?? null;
      await store.setIncidentStatus({ incident_id, status, actor, note });
      return incidentSummary(store, incident_id);
    },

    async generate_briefing(input) {
      const body = fields(input);
      return generateBriefing(text(body, 'incident_id'), choice(body, 'kind', BRIEFING_KINDS));
    },

    async notify_operator(input) {
      const body = fields(input);
      const incident_id = text(body, 'incident_id');
      const channel = choice(body, 'channel', NOTIFY_CHANNELS);
      const actor = optional(body, 'actor', () => choice(body, 'actor', ACTORS)) ?? 'SYSTEM';
      return notifyOperator(incident_id, channel, actor);
    },

    async record_action(input) {
      const body = fields(input);
      return recordAction(
        text(body, 'incident_id'),
        choice(body, 'actor', ACTORS),
        text(body, 'action_name'),
        typeof body.detail === 'string' ? body.detail : ''
      );
    },

    async handle_highest_priority(input) {
      return handleHighestPriority(choice(fields(input), 'actor', ACTORS));
    },
  };
}

// Compile-time check that the inputs documented in contracts stay in sync.
export type { ActionInput };
