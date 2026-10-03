// Seed loader CLI. Talks to SpacetimeDB through reducers only.
//
//   seed                  load the synthetic company (assets, contacts, policies)
//   replay [event]        insert one Carbon Mapper event (default: main), then
//                         match -> priority -> create_incident
//
//   --sample              read services/core-api/sample-fixtures (invented data)
//                         instead of data/fixtures
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MatchAsset } from '@ch4se/contracts';
import { REPO_ROOT, SAMPLE_FIXTURES_DIR, loadConfig } from '@ch4se/core-api/config.ts';
import { loadCompanyFixtures, loadEventFixtures } from '@ch4se/core-api/fixtures.ts';
import { replayEvent, seedCompany } from '@ch4se/core-api/ingest.ts';
import { importIfPresent } from '@ch4se/core-api/ports.ts';
import { standinMatchAsset } from '@ch4se/core-api/standins/match.ts';
import { connectStdbStore } from '@ch4se/core-api/store-stdb.ts';

const USAGE = 'usage: cli.ts <seed | replay [event-name]> [--sample]';

async function loadMatchAsset(): Promise<MatchAsset> {
  const rules = pathToFileURL(join(REPO_ROOT, 'packages/rules/')).href;
  const { value, note } = await importIfPresent<MatchAsset>('./match.ts', 'matchAsset', rules);
  if (value) return value;
  console.warn(`[seed] packages/rules/match.ts ${note}; using the backend stand-in matcher`);
  return standinMatchAsset;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sample = args.includes('--sample');
  const [command, eventName = 'main'] = args.filter(arg => !arg.startsWith('--'));
  if (command !== 'seed' && command !== 'replay') {
    console.error(USAGE);
    process.exit(2);
  }

  const config = loadConfig();
  const fixturesDir = sample ? SAMPLE_FIXTURES_DIR : config.fixturesDir;
  if (sample) console.warn('[seed] --sample: loading INVENTED sample fixtures, not real data');

  // Read and validate fixtures before touching the database.
  const company = command === 'seed' ? loadCompanyFixtures(fixturesDir) : null;
  const event = command === 'replay' ? loadEventFixtures(fixturesDir, eventName) : null;

  const store = await connectStdbStore({
    uri: config.stdbUri,
    databaseName: config.stdbDatabase,
    token: config.stdbToken,
  });
  try {
    if (company) {
      await seedCompany(store, company);
      console.log(
        `[seed] seeded ${company.assets.length} assets, ${company.contacts.length} contacts, ` +
          `${company.policies.length} policies into "${config.stdbDatabase}"`
      );
    }
    if (event) {
      const { incident, created } = await replayEvent(store, event, await loadMatchAsset(), config.matchRadiusM);
      console.log(
        created
          ? `[seed] replayed ${event.event.plume_id}: ${incident.incident_id} ${incident.status} ` +
              `${incident.match_result} ${incident.priority} (rule ${incident.policy_rule_id})`
          : `[seed] ${event.event.plume_id} was already replayed as ${incident.incident_id}; nothing changed`
      );
    }
  } finally {
    store.close();
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(`[seed] ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.name === 'FixtureError' && !process.argv.includes('--sample')) {
      console.error("[seed] Track C's fixtures live in data/fixtures/. To try the pipeline with invented data, add --sample.");
    }
    process.exit(1);
  }
);
