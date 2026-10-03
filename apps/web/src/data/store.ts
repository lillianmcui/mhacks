import type {
  Acknowledgement,
  Action,
  Alert,
  Asset,
  Contact,
  Incident,
  MethaneEvent,
  ProviderSource,
} from '@ch4se/contracts';

export interface TableRows {
  MethaneEvent: MethaneEvent;
  ProviderSource: ProviderSource;
  Asset: Asset;
  Contact: Contact;
  Incident: Incident;
  Alert: Alert;
  Acknowledgement: Acknowledgement;
  Action: Action;
}
export type TableName = keyof TableRows;

export const TABLE_NAMES: TableName[] = [
  'MethaneEvent',
  'ProviderSource',
  'Asset',
  'Contact',
  'Incident',
  'Alert',
  'Acknowledgement',
  'Action',
];

const PRIMARY_KEY: { [K in TableName]: (row: TableRows[K]) => string } = {
  MethaneEvent: (r) => r.event_id,
  ProviderSource: (r) => r.source_name,
  Asset: (r) => r.asset_id,
  Contact: (r) => r.contact_id,
  Incident: (r) => r.incident_id,
  Alert: (r) => r.alert_id,
  Acknowledgement: (r) => `${r.incident_id}|${r.contact_id}|${r.at}`,
  Action: (r) => r.action_id,
};

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface DbSnapshot {
  connection: ConnectionStatus;
  connectionError?: string;
  tables: { [K in TableName]: TableRows[K][] };
}

/**
 * Client-side mirror of the subscribed SpacetimeDB tables. Both the live adapter
 * and the mock backend write into this; React reads it via useSyncExternalStore.
 */
export class DbStore {
  private maps: { [K in TableName]: Map<string, TableRows[K]> } = Object.fromEntries(
    TABLE_NAMES.map((t) => [t, new Map()]),
  ) as never;
  private listeners = new Set<() => void>();
  private snapshot: DbSnapshot = this.build('connecting');
  private dirty = false;

  getSnapshot = (): DbSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Synchronous read of current rows (the snapshot lags by a microtask). */
  rows<K extends TableName>(table: K): TableRows[K][] {
    return Array.from(this.maps[table].values());
  }

  upsert<K extends TableName>(table: K, row: TableRows[K]): void {
    this.maps[table].set(PRIMARY_KEY[table](row), row);
    this.schedule();
  }

  delete<K extends TableName>(table: K, row: TableRows[K]): void {
    this.maps[table].delete(PRIMARY_KEY[table](row));
    this.schedule();
  }

  clear(): void {
    TABLE_NAMES.forEach((t) => this.maps[t].clear());
    this.schedule();
  }

  setConnection(status: ConnectionStatus, error?: string): void {
    this.snapshot = { ...this.snapshot, connection: status, connectionError: error };
    this.emit();
  }

  private build(connection: ConnectionStatus, connectionError?: string): DbSnapshot {
    const tables = Object.fromEntries(
      TABLE_NAMES.map((t) => [t, this.maps ? this.rows(t) : []]),
    ) as unknown as DbSnapshot['tables'];
    return { connection, connectionError, tables };
  }

  // Batch bursts of row callbacks (e.g. initial subscription) into one render.
  private schedule(): void {
    if (this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => {
      this.dirty = false;
      this.snapshot = this.build(this.snapshot.connection, this.snapshot.connectionError);
      this.emit();
    });
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}
