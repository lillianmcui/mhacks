import {
  DbConnection,
  toAcknowledgement,
  toAction,
  toAlert,
  toAsset,
  toContact,
  toIncident,
  toMethaneEvent,
  toProviderSource,
} from '@ch4se/stdb-bindings';
import { config } from '../config';
import type { DbStore, TableName, TableRows } from './store';
import { TABLE_NAMES } from './store';

/**
 * SpacetimeDB -> DbStore adapter over the backend's generated bindings
 * (packages/stdb-bindings). Rows are converted to contract shape (snake_case,
 * ISO timestamps, null for none) by the backend's own `to*` mappers.
 */
type Mapper<K extends TableName> = (row: never) => TableRows[K];
const TABLES: { [K in TableName]: { sql: string; accessor: string; map: Mapper<K> } } = {
  MethaneEvent: { sql: 'methane_event', accessor: 'methaneEvent', map: toMethaneEvent },
  ProviderSource: { sql: 'provider_source', accessor: 'providerSource', map: toProviderSource },
  Asset: { sql: 'asset', accessor: 'asset', map: toAsset },
  Contact: { sql: 'contact', accessor: 'contact', map: toContact },
  Incident: { sql: 'incident', accessor: 'incident', map: toIncident },
  Alert: { sql: 'alert', accessor: 'alert', map: toAlert },
  Acknowledgement: { sql: 'acknowledgement', accessor: 'acknowledgement', map: toAcknowledgement },
  Action: { sql: 'action', accessor: 'action', map: toAction },
};

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 10000;

// The slice of the generated connection this adapter uses, so tables can be
// bound in a loop instead of one hand-written block per table.
type RowCb = (ctx: unknown, ...rows: unknown[]) => void;
interface TableHandle {
  onInsert(cb: RowCb): void;
  onUpdate?(cb: RowCb): void;
  onDelete(cb: RowCb): void;
}
interface Conn {
  db: Record<string, TableHandle>;
  subscriptionBuilder(): {
    onApplied(cb: () => void): ReturnType<Conn['subscriptionBuilder']>;
    onError(cb: (ctx: unknown, err?: unknown) => void): ReturnType<Conn['subscriptionBuilder']>;
    subscribe(queries: string[]): unknown;
  };
  disconnect(): void;
}
interface Builder {
  withUri(uri: string): Builder;
  withDatabaseName(name: string): Builder;
  withToken(token?: string): Builder;
  onConnect(cb: (conn: Conn, identity: unknown, token: string) => void): Builder;
  onDisconnect(cb: (ctx: unknown, err?: unknown) => void): Builder;
  onConnectError(cb: (ctx: unknown, err: unknown) => void): Builder;
  build(): Conn;
}

const TOKEN_KEY = 'ch4se.stdb.token';

export function connectLive(store: DbStore): () => void {
  const Db = DbConnection as unknown as { builder(): Builder };

  let conn: Conn | null = null;
  let attempt = 0;
  let stopped = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const retry = (why: string) => {
    if (stopped) return;
    store.setConnection('reconnecting', why);
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempt++, RETRY_MAX_MS);
    retryTimer = setTimeout(open, delay);
  };

  function open() {
    conn = Db.builder()
      .withUri(config.stdbUri)
      .withDatabaseName(config.stdbModule)
      .withToken(localStorage.getItem(TOKEN_KEY) ?? undefined)
      .onConnect((c, _identity, token) => {
        localStorage.setItem(TOKEN_KEY, token);
        // A fresh subscription re-delivers every row, so drop stale state first.
        store.clear();
        bindTables(c, store);
        c.subscriptionBuilder()
          .onApplied(() => {
            attempt = 0;
            store.setConnection('connected');
          })
          .onError((_ctx, err) => store.setConnection('error', String(err ?? 'subscription error')))
          .subscribe(TABLE_NAMES.map((t) => `SELECT * FROM ${TABLES[t].sql}`));
      })
      .onDisconnect((_ctx, err) => retry(err ? String(err) : 'disconnected'))
      .onConnectError((_ctx, err) => retry(String(err)))
      .build();
  }

  store.setConnection('connecting');
  open();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    conn?.disconnect();
  };
}

function bindTables(conn: Conn, store: DbStore) {
  for (const t of TABLE_NAMES) {
    const handle = conn.db[TABLES[t].accessor];
    if (!handle) {
      console.warn(`[stdb] no table accessor "${TABLES[t].accessor}" on conn.db`);
      continue;
    }
    const map = TABLES[t].map as (row: unknown) => TableRows[typeof t];
    const up = (row: unknown) => store.upsert(t, map(row));
    handle.onInsert((_ctx, row) => up(row));
    handle.onUpdate?.((_ctx, _old, row) => up(row));
    handle.onDelete((_ctx, row) => store.delete(t, map(row)));
  }
}
