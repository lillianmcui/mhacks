import { useSyncExternalStore } from 'react';
import type { ActionInputs, ActionName, ActionOutputs, Envelope } from '@ch4se/contracts';
import { config } from '../config';
import { connectLive } from './live';
import { MockBackend } from './mock/mockBackend';
import { DbStore, type DbSnapshot } from './store';

/**
 * The one switch between mock and real backends (VITE_DATA_SOURCE / VITE_CORE_API).
 * Components import `useDb` and `callAction` from here and nothing else.
 */

export const store = new DbStore();
export const mock = config.dataSource === 'mock' || config.coreApi === 'mock' ? new MockBackend(store) : null;

let started = false;
export function startDataSource(): void {
  if (started) return;
  started = true;
  if (config.dataSource === 'live') connectLive(store);
  else mock!.start();
}

export function useDb(): DbSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

export class CoreApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Core API write path. Never mutate local state after this resolves; wait for the subscription. */
export async function callAction<N extends ActionName>(name: N, body: ActionInputs[N]): Promise<ActionOutputs[N]> {
  let env: Envelope<ActionOutputs[N]>;
  if (config.coreApi === 'mock') {
    env = await mock!.call(name, body);
  } else {
    const res = await fetch(`${config.coreApiUrl}/actions/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.coreApiToken ? { Authorization: `Bearer ${config.coreApiToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    try {
      env = (await res.json()) as Envelope<ActionOutputs[N]>;
    } catch {
      throw new CoreApiError('HTTP_' + res.status, `Core API returned non-JSON (${res.status})`);
    }
  }
  if (!env.ok) throw new CoreApiError(env.error.code, env.error.message);
  return env.data;
}

if (mock && typeof window !== 'undefined') {
  (window as unknown as { __ch4seMock: MockBackend }).__ch4seMock = mock;
}
