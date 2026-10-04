import { DbConnection } from './generated/index.ts';

export interface ConnectOptions {
  /** e.g. ws://127.0.0.1:3000 (local) or wss://maincloud.spacetimedb.com */
  uri: string;
  /** Database name the module was published under, e.g. "ch4se". */
  databaseName: string;
  token?: string;
  onDisconnect?: (error?: Error) => void;
}

/**
 * Connects and subscribes to every public table. Resolves once the initial
 * rows are in the client cache, so `conn.db.<table>.iter()` is complete.
 */
export function connect(options: ConnectOptions): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    let settled = false;
    DbConnection.builder()
      .withUri(options.uri)
      .withDatabaseName(options.databaseName)
      .withToken(options.token)
      .onConnect(conn => {
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            settled = true;
            resolve(conn);
          })
          .onError(ctx => {
            if (!settled) reject(ctx.event ?? new Error('SpacetimeDB subscription failed'));
          })
          .subscribeToAllTables();
      })
      .onConnectError((_ctx, error) => {
        if (!settled) reject(error);
      })
      .onDisconnect((_ctx, error) => {
        if (!settled) reject(error ?? new Error('SpacetimeDB disconnected before the subscription was applied'));
        options.onDisconnect?.(error);
      })
      .build();
  });
}
