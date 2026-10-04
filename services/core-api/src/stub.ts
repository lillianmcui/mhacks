// Stub Core API (CP0): no SpacetimeDB, no Relay, no Grok. State lives in
// memory, seeded from sample-fixtures/, so every action returns correctly
// shaped data and the transitions behave like the real thing. Nothing is sent
// anywhere: notify_operator reports SENT with provider_ref "stub".
import type { RelaySend } from '@ch4se/contracts';
import { SAMPLE_FIXTURES_DIR } from './config.ts';
import { loadCompanyFixtures, loadEventFixtures } from './fixtures.ts';
import { replayEvent, seedCompany } from './ingest.ts';
import type { Ports } from './ports.ts';
import { standinTemplateBriefing } from './standins/briefing.ts';
import { standinMatchAsset } from './standins/match.ts';
import { createMemoryStore } from './store-memory.ts';
import type { Store } from './store.ts';

const stubRelay: RelaySend = async () => ({ delivery_status: 'SENT', provider_ref: 'stub' });

export async function createStubStore(radius_m: number): Promise<Store> {
  const store = createMemoryStore();
  await seedCompany(store, loadCompanyFixtures(SAMPLE_FIXTURES_DIR));
  await replayEvent(store, loadEventFixtures(SAMPLE_FIXTURES_DIR, 'main'), standinMatchAsset, radius_m);
  return store;
}

export const stubPorts: Ports = {
  renderTemplateBriefing: standinTemplateBriefing,
  grokBriefing: null,
  relaySend: stubRelay,
  describe: { template: 'backend stand-in (stub mode)', grok: 'off (stub mode)', relay: 'fake (stub mode, sends nothing)' },
};
