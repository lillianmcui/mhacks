import { config } from '../config';
import type { ConnectionStatus } from '../data/store';

const LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  connected: 'Live',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  error: 'Error',
};

export function ConnectionIndicator({ status, error }: { status: ConnectionStatus; error?: string }) {
  const src = config.dataSource === 'mock' ? 'MOCK' : 'SpacetimeDB';
  return (
    <div className={`conn conn--${status}`} title={error ?? `${src}: ${status}`}>
      <span className="conn__dot" aria-hidden />
      <span>
        {src} · {LABEL[status]}
      </span>
    </div>
  );
}
