import { DbConnection } from '@ch4se/stdb-bindings';
import { config } from '../config';
import type { DbStore, TableName, TableRows } from './store';
import { TABLE_NAMES } from './store';

/**
 * SpacetimeDB -> DbStore adapter. Written against the SpacetimeDB TS SDK's
 * generated-bindings shape (DbConnection.builder(), conn.db.<table>.onInsert...).
 * VERIFY at CP0 against the actual generated bindings:
 *   - SQL table names and `conn.db` accessor names below
 *   - builder method for the module (withModuleName vs withDatabaseName)
 *   - row field casing (codegen emits camelCase; contracts are snake_case)
 */
const TABLES: Record<TableName, { sql: string; accessor: string }> = {
  MethaneEvent: { sql: 'methane_event', accessor: 'methaneEvent' },
  ProviderSource: { sql: 'provider_source', accessor: 'providerSource' },
  Asset: { sql: 'asset', accessor: 'asset' },
  Contact: { sql: 'contact', accessor: 'contact' },
  Incident: { sql: 'incident', accessor: 'incident' },
  Alert: { sql: 'alert', accessor: 'alert' },
  Acknowledgement: { sql: 'acknowledgement', accessor: 'acknowledgement' },
  Action: { sql: 'action', accessor: 'action' },
};

const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 10000;

// Minimal structural types so this compiles before bindings are generated.
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
  withModuleName?(name: string): Builder;
  withDatabaseName?(name: string): Builder;
  withToken(token?: string): Builder;
  onConnect(cb: (conn: Conn, identity: unknown, token: string) => void): Builder;
  onDisconnect(cb: (ctx: unknown, err?: unknown) => void): Builder;
  onConnectError(cb: (ctx: unknown, err: unknown) => void): Builder;
  build(): Conn;
}

const TOKEN_KEY = 'ch4se.stdb.token';

export function connectLive(store: DbStore): () => void {
  const Db = DbConnection as { builder(): Builder } | null;
  if (!Db) {
    store.setConnection('error', 'packages/stdb-bindings not generated yet');
    return () => {};
  }

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
    let b = Db!.builder().withUri(config.stdbUri);
    b = b.withDatabaseName ? b.withDatabaseName(config.stdbModule) : b.withModuleName!(config.stdbModule);
    conn = b
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
    const up = (row: unknown) => store.upsert(t, normalizeRow(row) as TableRows[typeof t]);
    handle.onInsert((_ctx, row) => up(row));
    handle.onUpdate?.((_ctx, _old, row) => up(row));
    handle.onDelete((_ctx, row) => store.delete(t, normalizeRow(row) as TableRows[typeof t]));
  }
}

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Generated row -> contract shape: snake_case keys, ISO timestamps, string ids, null for None. */
export function normalizeRow(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(normalizeRow);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown> & { toDate?: () => Date; tag?: string; value?: unknown };
    if (typeof o.toDate === 'function') return o.toDate().toISOString();
    // Sum-type enums come through as { tag: 'ANALYZED' } in the TS SDK.
    if (typeof o.tag === 'string' && Object.keys(o).every((k) => k === 'tag' || k === 'value')) {
      const unit = o.value === undefined || (typeof o.value === 'object' && o.value !== null && Object.keys(o.value).length === 0);
      if (o.tag === 'none') return null;
      if (o.tag === 'some') return normalizeRow(o.value);
      return unit ? o.tag : normalizeRow(o.value);
    }
    return Object.fromEntries(Object.entries(o).map(([k, val]) => [snake(k), normalizeRow(val)]));
  }
  return v;
}
