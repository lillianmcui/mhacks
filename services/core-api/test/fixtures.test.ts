import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { SAMPLE_FIXTURES_DIR } from '../src/config.ts';
import { FixtureError, loadCompanyFixtures, loadEventFixtures } from '../src/fixtures.ts';
import { seedCompany, validateCompany } from '../src/ingest.ts';
import { createMemoryStore } from '../src/store-memory.ts';
import { codeOf } from './helpers.ts';

function scratch(edit: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), 'ch4se-fixtures-'));
  cpSync(SAMPLE_FIXTURES_DIR, dir, { recursive: true });
  edit(dir);
  return dir;
}

function editJson(path: string, change: (data: any) => unknown): void {
  writeFileSync(path, JSON.stringify(change(JSON.parse(readFileSync(path, 'utf8')))));
}

test('sample fixtures load and validate', () => {
  const company = loadCompanyFixtures(SAMPLE_FIXTURES_DIR);
  assert.equal(company.assets.length, 2);
  const { event, source } = loadEventFixtures(SAMPLE_FIXTURES_DIR);
  assert.equal(event.event_id, 'EVT-sample20260101t000000-A');
  assert.equal(event.provider, 'Carbon Mapper');
  assert.equal(source?.detection_dates.length, 3);
});

test('CSV-style `datetime` is normalized to scene_timestamp', () => {
  const dir = scratch(d =>
    editJson(join(d, 'carbon_mapper/main/plume.json'), plume => [{ ...plume, datetime: '2026-01-01T00:00:05Z' }])
  );
  assert.equal(loadEventFixtures(dir).event.scene_timestamp, '2026-01-01T00:00:05Z');
  rmSync(dir, { recursive: true });
});

test('the catalog API shapes load: geometry_json origin, `sector`, nested source summary', () => {
  const dir = scratch(d => {
    editJson(join(d, 'carbon_mapper/main/plume.json'), ({ plume_latitude, plume_longitude, ipcc_sector, ...plume }) => ({
      ...plume,
      geometry_json: { type: 'Point', coordinates: [plume_longitude, plume_latitude] },
      sector: ipcc_sector,
    }));
    editJson(join(d, 'carbon_mapper/main/source.json'), ({ persistence, emission_auto, emission_uncertainty_auto, ...source }) => ({
      ...source,
      source: { gas: 'CH4', persistence, emission_auto, emission_uncertainty_auto },
    }));
  });
  const sample = loadEventFixtures(SAMPLE_FIXTURES_DIR);
  const api = loadEventFixtures(dir);
  assert.deepEqual(api.event, sample.event);
  assert.deepEqual(api.source, sample.source);
  rmSync(dir, { recursive: true });
});

test('a plume with no origin in either shape is an error', () => {
  const dir = scratch(d =>
    editJson(join(d, 'carbon_mapper/main/plume.json'), ({ plume_latitude: _lat, ...plume }) => ({
      ...plume,
      geometry_json: { type: 'Point', coordinates: ['-103.8', null] },
    }))
  );
  assert.throws(() => loadEventFixtures(dir), (error: unknown) => error instanceof FixtureError && /plume_latitude must be a number/.test(error.message));
  rmSync(dir, { recursive: true });
});

test('a missing required number is an error, never a default', () => {
  const dir = scratch(d =>
    editJson(join(d, 'carbon_mapper/main/plume.json'), ({ emission_auto: _dropped, ...plume }) => plume)
  );
  assert.throws(() => loadEventFixtures(dir), (error: unknown) => error instanceof FixtureError && /emission_auto must be a number/.test(error.message));
  rmSync(dir, { recursive: true });
});

test('null uncertainty and wind stay null', () => {
  const dir = scratch(d =>
    editJson(join(d, 'carbon_mapper/main/plume.json'), plume => ({ ...plume, emission_uncertainty_auto: null, wind_speed_avg_auto: null }))
  );
  const { event } = loadEventFixtures(dir);
  assert.equal(event.emission_uncertainty_auto, null);
  assert.equal(event.wind_speed_avg_auto, null);
  rmSync(dir, { recursive: true });
});

test('seeding rejects a policy that routes to a role no contact holds', async () => {
  const company = loadCompanyFixtures(SAMPLE_FIXTURES_DIR);
  company.policies[0]!.no_asset_route_role = 'nobody';
  assert.deepEqual(validateCompany(company), ['policy SAMPLE-POL-1: no contact has the role nobody']);
  const store = createMemoryStore();
  assert.equal(await codeOf(seedCompany(store, company)), 'VALIDATION_ERROR');
  assert.equal(store.policies().length, 0);
});

test('seeding rejects a company whose references or policies are broken', async () => {
  const company = loadCompanyFixtures(SAMPLE_FIXTURES_DIR);
  const store = createMemoryStore();
  company.assets[0]!.site_manager_contact_id = 'GHOST';
  company.policies[0]!.rules.pop();
  assert.equal(await codeOf(seedCompany(store, company)), 'VALIDATION_ERROR');
  assert.equal(store.assets().length, 0);
});
