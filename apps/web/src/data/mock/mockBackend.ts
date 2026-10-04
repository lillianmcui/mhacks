import type {
  Actor,
  ActionInputs,
  ActionName,
  ActionOutputs,
  AlertChannel,
  Envelope,
  Incident,
  IncidentStatus,
  IncidentSummary,
} from '@ch4se/contracts';
import { PRIORITIES } from '@ch4se/contracts';
import type { DbStore } from '../store';
import { MockSync } from './mockSync';
import type { TableName, TableRows } from '../store';
import { MOCK_MATCH, mockAssets, mockContacts, mockEvent, mockProviderSource } from './fixtures';

/**
 * In-browser fake of "Core API + SpacetimeDB reducers", for working before CP0.
 * It writes rows into the same DbStore the live adapter uses, so components
 * only ever see subscription-driven updates. Throwaway code: none of this logic
 * belongs in the real frontend.
 */

const LATENCY_MS = 350;
const STEP_MS = 600;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

// Mirrors TRACK_BACKEND §3.4 so the mock rejects what the backend would.
const ALLOWED: Record<IncidentStatus, IncidentStatus[]> = {
  DETECTED: ['ANALYZED'],
  ANALYZED: ['ALERT_SENT', 'ACKNOWLEDGED'],
  ALERT_SENT: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['INVESTIGATING'],
  INVESTIGATING: ['RESOLVED'],
  RESOLVED: [],
};

class MockError extends Error {
  constructor(public code: Extract<Envelope<never>, { ok: false }>['error']['code'], message: string) {
    super(message);
  }
}

export class MockBackend {
  private seq = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  private sync: MockSync;

  constructor(private store: DbStore) {
    this.sync = new MockSync(store);
    this.sync.onCall = (name, body) => this.call(name as ActionName, body as never);
    this.sync.onCmd = (name) => void this[name]();
  }

  async start(): Promise<void> {
    this.store.setConnection('connecting');
    if (!(await this.sync.elect())) return;
    this.timers.push(
      setTimeout(() => {
        this.seed();
        this.store.setConnection('connected');
      }, LATENCY_MS),
      setTimeout(() => this.replay(), 2500),
    );
  }

  reset(): void {
    if (this.sync.role === 'follower') return this.sync.forwardCmd('reset');
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.store.clear();
    this.sync.broadcast({ type: 'clear' });
    this.seed();
  }

  private put<K extends TableName>(table: K, row: TableRows[K]): void {
    this.store.upsert(table, row);
    this.sync.broadcast({ type: 'upsert', table, row });
  }

  seed(): void {
    mockContacts.forEach((c) => this.put('Contact', c));
    mockAssets.forEach((a) => this.put('Asset', a));
  }

  /** Stand-in for the backend `replay` command: insert_event, then create_incident. */
  replay(): void {
    if (this.sync.role === 'follower') return this.sync.forwardCmd('replay');
    const ev = mockEvent(now());
    this.put('ProviderSource', mockProviderSource);
    this.put('MethaneEvent', ev);
    this.action('', 'SYSTEM', 'insert_event', `Replayed ${ev.plume_id}`);
    this.timers.push(
      setTimeout(() => {
        const asset = mockAssets.find((a) => a.asset_id === MOCK_MATCH.asset_id)!;
        const t = now();
        const incident: Incident = {
          incident_id: `INC-${++this.seq}`,
          event_id: ev.event_id,
          match_result: 'MATCHED',
          asset_id: asset.asset_id,
          distance_m: MOCK_MATCH.distance_m,
          candidates: [MOCK_MATCH],
          priority: 'HIGH',
          policy_rule_id: 'MOCK-RULE-HIGH-RECURRING',
          status: 'ANALYZED',
          assigned_contact_id: asset.site_manager_contact_id,
          created_at: t,
          updated_at: t,
        };
        this.put('Incident', incident);
        this.action(incident.incident_id, 'SYSTEM', 'create_incident', `Matched ${asset.asset_id}; priority ${incident.priority}`);
      }, 1500),
    );
  }

  /** Simulates an inbound Relay "acknowledge and mark investigating". */
  async simulateRelayAck(): Promise<void> {
    if (this.sync.role === 'follower') return this.sync.forwardCmd('simulateRelayAck');
    const inc = this.openIncidents()[0];
    if (!inc) return;
    await this.call('acknowledge_incident', {
      incident_id: inc.incident_id,
      contact_id: inc.assigned_contact_id,
      channel: 'SMS',
      then_status: 'INVESTIGATING',
    });
  }

  async call<N extends ActionName>(name: N, body: ActionInputs[N]): Promise<Envelope<ActionOutputs[N]>> {
    if (this.sync.role === 'follower') {
      return (await this.sync.forwardCall(name, body)) as Envelope<ActionOutputs[N]>;
    }
    await sleep(LATENCY_MS);
    try {
      const data = await this.dispatch(name, body);
      return { ok: true, data: data as ActionOutputs[N] };
    } catch (e) {
      if (e instanceof MockError) return { ok: false, error: { code: e.code, message: e.message } };
      throw e;
    }
  }

  private async dispatch(name: ActionName, body: unknown): Promise<unknown> {
    switch (name) {
      case 'get_open_incidents':
        return this.openIncidents().map(summary);
      case 'generate_briefing': {
        const { incident_id } = body as ActionInputs['generate_briefing'];
        return { text: this.briefing(this.get(incident_id)), source: 'TEMPLATE' };
      }
      case 'acknowledge_incident': {
        const b = body as ActionInputs['acknowledge_incident'];
        const actor: Actor = b.channel === 'DASHBOARD' ? 'DASHBOARD' : 'RELAY_AGENT';
        this.transition(b.incident_id, 'ACKNOWLEDGED', actor);
        this.put('Acknowledgement', { incident_id: b.incident_id, contact_id: b.contact_id, channel: b.channel, at: now() });
        if (b.then_status) {
          await sleep(STEP_MS);
          this.transition(b.incident_id, b.then_status, actor);
        }
        return summary(this.get(b.incident_id));
      }
      case 'set_incident_status': {
        const b = body as ActionInputs['set_incident_status'];
        this.transition(b.incident_id, b.status, b.actor, b.note);
        return summary(this.get(b.incident_id));
      }
      case 'handle_highest_priority': {
        const { actor } = body as ActionInputs['handle_highest_priority'];
        return this.handleHighest(actor);
      }
    }
  }

  private async handleHighest(actor: Actor) {
    const inc = this.openIncidents().find((i) => i.status === 'ANALYZED');
    if (!inc) throw new MockError('NO_OPEN_INCIDENTS', 'No open incidents awaiting action');
    const steps = ['get_open_incidents', 'get_incident', 'get_asset', 'get_escalation_policy', 'generate_briefing'];
    for (const step of steps) {
      this.action(inc.incident_id, actor, step, '');
      await sleep(STEP_MS);
    }
    const channel: AlertChannel = 'SMS';
    const alert_id = `ALT-${++this.seq}`;
    this.put('Alert', {
      alert_id,
      incident_id: inc.incident_id,
      contact_id: inc.assigned_contact_id,
      channel,
      sent_at: now(),
      delivery_status: 'SENT',
      message_text: this.briefing(inc),
      briefing_source: 'TEMPLATE',
    });
    this.action(inc.incident_id, actor, 'notify_operator', `${channel} to ${inc.assigned_contact_id}`);
    this.transition(inc.incident_id, 'ALERT_SENT', 'SYSTEM');
    return { incident_id: inc.incident_id, alert_id, delivery_status: 'SENT', steps: [...steps, 'notify_operator'] };
  }

  private briefing(inc: Incident): string {
    return `[MOCK TEMPLATE] Replayed historical observation. ${inc.priority} priority methane plume; associated asset ${inc.asset_id ?? 'none'}. Rule ${inc.policy_rule_id}.`;
  }

  private openIncidents(): Incident[] {
    return this.store
      .rows('Incident')
      .filter((i) => i.status !== 'RESOLVED')
      .sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || a.created_at.localeCompare(b.created_at));
  }

  private get(id: string): Incident {
    const inc = this.store.rows('Incident').find((i) => i.incident_id === id);
    if (!inc) throw new MockError('NOT_FOUND', `Incident ${id} not found`);
    return inc;
  }

  private transition(id: string, to: IncidentStatus, actor: Actor, note?: string): void {
    const inc = this.get(id);
    if (!ALLOWED[inc.status].includes(to)) {
      throw new MockError('INVALID_TRANSITION', `${inc.status} -> ${to} not allowed`);
    }
    this.put('Incident', { ...inc, status: to, updated_at: now() });
    this.action(id, actor, 'set_incident_status', `${inc.status} -> ${to}${note ? ` (${note})` : ''}`);
  }

  private action(incident_id: string, actor: Actor, action_name: string, detail: string): void {
    this.put('Action', { action_id: `ACT-${String(++this.seq).padStart(6, '0')}`, incident_id, actor, action_name, detail, at: now() });
  }
}

function summary(i: Incident): IncidentSummary {
  return { incident_id: i.incident_id, status: i.status, priority: i.priority, asset_id: i.asset_id, updated_at: i.updated_at };
}
