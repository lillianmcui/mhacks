import type { GrokBriefing, RelaySend } from '@ch4se/contracts';
import { createActions, type Actions } from '../src/actions.ts';
import { SAMPLE_FIXTURES_DIR } from '../src/config.ts';
import { ApiError } from '../src/errors.ts';
import { loadCompanyFixtures, loadEventFixtures } from '../src/fixtures.ts';
import { replayEvent, seedCompany } from '../src/ingest.ts';
import type { Ports } from '../src/ports.ts';
import { standinTemplateBriefing } from '../src/standins/briefing.ts';
import { standinMatchAsset } from '../src/standins/match.ts';
import { createMemoryStore } from '../src/store-memory.ts';
import type { Store } from '../src/store.ts';

export const fakeRelay: RelaySend = async () => ({ delivery_status: 'SENT', provider_ref: 'test' });

export function ports(overrides: { grok?: GrokBriefing | null; relay?: RelaySend | null } = {}): Ports {
  return {
    renderTemplateBriefing: standinTemplateBriefing,
    grokBriefing: overrides.grok ?? null,
    relaySend: overrides.relay === undefined ? fakeRelay : overrides.relay,
    describe: { template: 'test', grok: 'test', relay: 'disabled in test' },
  };
}

export async function seedAndReplay(store: Store): Promise<void> {
  await seedCompany(store, loadCompanyFixtures(SAMPLE_FIXTURES_DIR));
  await replayEvent(store, loadEventFixtures(SAMPLE_FIXTURES_DIR, 'main'), standinMatchAsset);
}

/** A memory store advancing one second per write, so created_at ordering is stable. */
export function tickingStore(): Store {
  let tick = Date.UTC(2026, 9, 3, 12, 0, 0);
  return createMemoryStore(() => new Date((tick += 1000)));
}

export async function setup(overrides: Parameters<typeof ports>[0] = {}): Promise<{ store: Store; actions: Actions }> {
  const store = tickingStore();
  await seedAndReplay(store);
  return { store, actions: createActions({ store, ports: ports(overrides) }) };
}

export async function codeOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    if (error instanceof ApiError) return error.code;
    throw error;
  }
  return 'OK';
}
