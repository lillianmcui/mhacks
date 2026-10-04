import { TABLE_NAMES, type DbStore, type TableName, type TableRows } from '../store';

/**
 * Cross-tab sync for mock mode so /operator in another tab sees the same rows
 * as the dashboard. The first tab becomes leader and owns the fake backend;
 * later tabs mirror its rows and forward calls to it.
 */

export type SyncMsg =
  | { type: 'hello' }
  | { type: 'leader'; rows: { [K in TableName]?: TableRows[K][] } }
  | { type: 'upsert'; table: TableName; row: unknown }
  | { type: 'delete'; table: TableName; row: unknown }
  | { type: 'clear' }
  | { type: 'call'; id: string; name: string; body: unknown }
  | { type: 'result'; id: string; env: unknown }
  | { type: 'cmd'; name: 'replay' | 'reset' | 'simulateRelayAck' };

const LEADER_WAIT_MS = 250;

export class MockSync {
  private ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ch4se-mock') : null;
  private pending = new Map<string, (env: unknown) => void>();
  role: 'unknown' | 'leader' | 'follower' = 'unknown';
  onCall?: (name: string, body: unknown) => Promise<unknown>;
  onCmd?: (name: Extract<SyncMsg, { type: 'cmd' }>['name']) => void;

  constructor(private store: DbStore) {
    this.ch?.addEventListener('message', (e: MessageEvent<SyncMsg>) => this.receive(e.data));
  }

  /** Resolves to true if this tab should run the fake backend. */
  elect(): Promise<boolean> {
    if (!this.ch) return Promise.resolve((this.role = 'leader') === 'leader');
    this.ch.postMessage({ type: 'hello' } satisfies SyncMsg);
    return new Promise((resolve) =>
      setTimeout(() => {
        if (this.role === 'unknown') this.role = 'leader';
        resolve(this.role === 'leader');
      }, LEADER_WAIT_MS),
    );
  }

  broadcast(msg: SyncMsg): void {
    if (this.role === 'leader') this.ch?.postMessage(msg);
  }

  forwardCall(name: string, body: unknown): Promise<unknown> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ch!.postMessage({ type: 'call', id, name, body } satisfies SyncMsg);
    });
  }

  forwardCmd(name: Extract<SyncMsg, { type: 'cmd' }>['name']): void {
    this.ch?.postMessage({ type: 'cmd', name } satisfies SyncMsg);
  }

  private async receive(msg: SyncMsg) {
    const s = this.store;
    if (this.role === 'leader') {
      if (msg.type === 'hello') this.ch!.postMessage({ type: 'leader', rows: Object.fromEntries(TABLE_NAMES.map((t) => [t, s.rows(t)])) } satisfies SyncMsg);
      if (msg.type === 'call' && this.onCall) {
        const env = await this.onCall(msg.name, msg.body);
        this.ch!.postMessage({ type: 'result', id: msg.id, env } satisfies SyncMsg);
      }
      if (msg.type === 'cmd') this.onCmd?.(msg.name);
      return;
    }
    switch (msg.type) {
      case 'leader':
        if (this.role === 'unknown') {
          this.role = 'follower';
          s.clear();
          for (const [table, rows] of Object.entries(msg.rows)) {
            (rows as unknown[]).forEach((r) => s.upsert(table as TableName, r as never));
          }
          s.setConnection('connected');
        }
        break;
      case 'upsert':
        s.upsert(msg.table, msg.row as never);
        break;
      case 'delete':
        s.delete(msg.table, msg.row as never);
        break;
      case 'clear':
        s.clear();
        break;
      case 'result':
        this.pending.get(msg.id)?.(msg.env);
        this.pending.delete(msg.id);
        break;
    }
  }
}
