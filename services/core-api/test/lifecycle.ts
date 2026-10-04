// One end-to-end pass over a clean Store: seed, replay, then every acceptance
// check of TRACK_BACKEND.md §6. Runs against the in-memory store in the unit
// tests and against a real SpacetimeDB module in e2e.stdb.test.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createActions } from '../src/actions.ts';
import { SAMPLE_FIXTURES_DIR } from '../src/config.ts';
import { loadEventFixtures } from '../src/fixtures.ts';
import { replayEvent } from '../src/ingest.ts';
import { standinMatchAsset } from '../src/standins/match.ts';
import type { Store } from '../src/store.ts';
import { codeOf, ports, seedAndReplay } from './helpers.ts';

export async function runLifecycle(store: Store): Promise<void> {
  assert.equal(store.incidents().length, 0, 'lifecycle needs a clean database');
  await seedAndReplay(store);

  // --- seed + replay: exactly one incident, numbers straight from the fixture
  const raw = JSON.parse(readFileSync(join(SAMPLE_FIXTURES_DIR, 'carbon_mapper/main/plume.json'), 'utf8'));
  assert.equal(store.incidents().length, 1);
  const [event] = store.events();
  assert.ok(event);
  for (const field of [
    'plume_id',
    'plume_latitude',
    'plume_longitude',
    'emission_auto',
    'emission_uncertainty_auto',
    'wind_speed_avg_auto',
    'wind_direction_avg_auto',
  ] as const) {
    assert.strictEqual(event[field], raw[field], field);
  }
  assert.equal(event.scene_timestamp, '2026-01-01T00:00:00Z', 'joined from scenes.geojson');
  assert.equal(event.is_replay, true);
  assert.notEqual(event.event_id, event.source_name);

  const incident = store.incidents()[0]!;
  const id = incident.incident_id;
  assert.equal(id, 'INC-0001');
  assert.equal(incident.status, 'ANALYZED');
  assert.equal(incident.match_result, 'MATCHED');
  assert.equal(incident.asset_id, 'SAMPLE-101');
  assert.equal(incident.priority, 'HIGH');
  assert.equal(incident.policy_rule_id, 'SAMPLE-R2');
  assert.equal(incident.assigned_contact_id, 'SAMPLE-C1');

  // --- replaying again is a no-op
  const again = await replayEvent(store, loadEventFixtures(SAMPLE_FIXTURES_DIR, 'main'), standinMatchAsset);
  assert.equal(again.created, false);
  assert.equal(store.incidents().length, 1);
  assert.equal(store.events().length, 1);

  // --- Relay disabled: UPSTREAM_UNAVAILABLE, incident stays ANALYZED, failure is on the timeline
  const offline = createActions({ store, ports: ports({ relay: null }) });
  assert.equal(await codeOf(offline.notify_operator({ incident_id: id, channel: 'SMS' })), 'UPSTREAM_UNAVAILABLE');
  assert.equal(store.incidents()[0]!.status, 'ANALYZED');
  assert.equal(store.alerts().length, 0);
  assert.ok(store.actions().some(a => a.action_name === 'notify_operator_failed'));

  // --- illegal transition: INVALID_TRANSITION and the row is unchanged
  const actions = createActions({ store, ports: ports() });
  const before = store.incidents()[0]!;
  const actionCount = store.actions().length;
  assert.equal(
    await codeOf(actions.set_incident_status({ incident_id: id, status: 'RESOLVED', actor: 'DASHBOARD' })),
    'INVALID_TRANSITION'
  );
  assert.deepEqual(store.incidents()[0], before);
  assert.equal(store.actions().length, actionCount, 'a rejected call writes nothing');
  assert.equal(await codeOf(actions.get_incident({ incident_id: 'INC-9999' })), 'NOT_FOUND');

  // --- Grok off: TEMPLATE
  const briefing = await actions.generate_briefing({ incident_id: id, kind: 'operator' });
  assert.equal(briefing.source, 'TEMPLATE');
  assert.match(briefing.text, /432 ± 99 kg CH4\/hr \(Carbon Mapper estimate\)/);

  // --- the Fetch sequence: one Action row per step, alert sent, status moves
  const handled = await actions.handle_highest_priority({ actor: 'FETCH_AGENT' });
  assert.deepEqual(
    handled.steps.map(s => [s.step, s.ok]),
    [
      ['get_open_incidents', true],
      ['get_incident', true],
      ['get_asset', true],
      ['get_escalation_policy', true],
      ['generate_briefing', true],
      ['notify_operator', true],
    ]
  );
  assert.equal(handled.incident.status, 'ALERT_SENT');
  assert.equal(handled.alert?.delivery_status, 'SENT');
  const fetchRows = store.actions().filter(a => a.actor === 'FETCH_AGENT').map(a => a.action_name);
  for (const step of ['get_open_incidents', 'get_incident', 'get_asset', 'get_escalation_policy', 'generate_briefing', 'record_alert']) {
    assert.ok(fetchRows.includes(step), `Action row for ${step}`);
  }
  const [alert] = store.alerts();
  assert.equal(alert?.contact_id, 'SAMPLE-C1');
  assert.equal(alert?.briefing_source, 'TEMPLATE');

  // --- "acknowledge it and mark my team as investigating"
  const acked = await actions.acknowledge_incident({
    incident_id: id,
    contact_id: 'SAMPLE-C1',
    channel: 'SMS',
    then_status: 'INVESTIGATING',
  });
  assert.equal(acked.status, 'INVESTIGATING');
  assert.equal(acked.display.headline, 'ACKNOWLEDGED — INVESTIGATION UNDERWAY');
  assert.equal(store.acknowledgements().length, 1);
  const relayRows = store.actions().filter(a => a.actor === 'RELAY_AGENT').map(a => a.action_name);
  assert.deepEqual(relayRows.sort(), ['acknowledge_incident', 'set_incident_status']);
  assert.equal(
    await codeOf(actions.acknowledge_incident({ incident_id: id, contact_id: 'SAMPLE-C1', channel: 'SMS' })),
    'INVALID_TRANSITION'
  );

  // --- resolve; nothing is open afterwards
  const resolved = await actions.set_incident_status({ incident_id: id, status: 'RESOLVED', actor: 'DASHBOARD', note: 'valve replaced' });
  assert.equal(resolved.status, 'RESOLVED');
  assert.deepEqual(await actions.get_open_incidents({}), []);
  assert.equal(await codeOf(actions.handle_highest_priority({ actor: 'DASHBOARD' })), 'NO_OPEN_INCIDENTS');
}
