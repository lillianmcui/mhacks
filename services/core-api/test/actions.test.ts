import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTION_NAMES } from '@ch4se/contracts';
import { createActions } from '../src/actions.ts';
import { loadEventFixtures } from '../src/fixtures.ts';
import { SAMPLE_FIXTURES_DIR } from '../src/config.ts';
import { replayEvent } from '../src/ingest.ts';
import { standinMatchAsset } from '../src/standins/match.ts';
import { codeOf, ports, setup, tickingStore } from './helpers.ts';
import { runLifecycle } from './lifecycle.ts';

const ID = 'INC-0001';

test('lifecycle: seed, replay and every acceptance check (in-memory store)', async () => {
  await runLifecycle(tickingStore());
});

test('every action in the contract has a handler', async () => {
  const { actions } = await setup();
  assert.deepEqual(Object.keys(actions).sort(), [...ACTION_NAMES].sort());
});

test('get_incident returns incident, event, asset, contact and display strings', async () => {
  const { actions } = await setup();
  const detail = await actions.get_incident({ incident_id: ID });
  assert.equal(detail.asset?.asset_id, 'SAMPLE-101');
  assert.equal(detail.assigned_contact?.contact_id, 'SAMPLE-C1');
  assert.equal(detail.status, 'ANALYZED');
  assert.equal(detail.display.headline, 'HIGH — UNACKNOWLEDGED');
  assert.match(detail.display.asset, /^Associated asset: SAMPLE-101 compressor_station \(\d+ m from plume origin\)$/);
  assert.equal(detail.display.provenance, 'Carbon Mapper · Tanager · 2026-01-01 00:00 UTC');
  assert.equal(detail.display.wind, '3.4 m/s from 211° (HRRR)');
});

test('get_evidence carries provenance and the replay flag', async () => {
  const { actions } = await setup();
  const evidence = await actions.get_evidence({ incident_id: ID });
  assert.equal(evidence.is_replay, true);
  assert.equal(evidence.provenance, 'Carbon Mapper · Tanager · 2026-01-01 00:00 UTC');
  assert.equal(evidence.event.emission_auto, 432.1);
  assert.equal(evidence.display.emission, '432 ± 99 kg CH4/hr (Carbon Mapper estimate)');
});

test('get_asset returns the asset with its owning contact', async () => {
  const { actions } = await setup();
  const { asset, contact } = await actions.get_asset({ asset_id: 'SAMPLE-101' });
  assert.equal(asset.operator_name, 'Sample Basin Midstream Co.');
  assert.equal(contact?.role, 'site_manager');
  assert.equal(await codeOf(actions.get_asset({ asset_id: 'nope' })), 'NOT_FOUND');
});

test('get_escalation_policy by incident returns the rule that fired', async () => {
  const { actions } = await setup();
  const byIncident = await actions.get_escalation_policy({ incident_id: ID });
  assert.equal(byIncident.fired_rule?.rule_id, 'SAMPLE-R2');
  assert.equal(byIncident.notify_role, 'site_manager');
  const byAsset = await actions.get_escalation_policy({ asset_id: 'SAMPLE-102' });
  assert.equal(byAsset.policy.policy_id, 'SAMPLE-POL-1');
  assert.equal(byAsset.fired_rule, null);
  assert.equal(await codeOf(actions.get_escalation_policy({})), 'VALIDATION_ERROR');
});

test('get_asset_history quotes detections over observations', async () => {
  const { actions } = await setup();
  const history = await actions.get_asset_history({ incident_id: ID });
  assert.equal(history.display.history, 'detected on 3 of 4 observation dates since 2025-09-14');
  assert.equal(history.display.persistence, 'persistence 0.75 (Carbon Mapper)');
  assert.equal(history.display.previous_incidents, 'no previous CH4SE incidents');
});

test('generate_briefing: Grok text is used, a Grok failure falls back to TEMPLATE', async () => {
  const good = await setup({ grok: async () => ({ text: 'from grok' }) });
  assert.deepEqual(await good.actions.generate_briefing({ incident_id: ID, kind: 'sms' }), { text: 'from grok', source: 'GROK' });

  const bad = await setup({
    grok: async () => {
      throw new Error('number-check failed');
    },
  });
  const briefing = await bad.actions.generate_briefing({ incident_id: ID, kind: 'sms' });
  assert.equal(briefing.source, 'TEMPLATE');
  assert.match(briefing.text, /replayed historical observation/);
  assert.equal(await codeOf(bad.actions.generate_briefing({ incident_id: ID, kind: 'poem' })), 'VALIDATION_ERROR');
});

test('the briefing input never includes a phone number', async () => {
  let seen = '';
  const { actions } = await setup({
    grok: async input => {
      seen = JSON.stringify(input);
      return { text: 'ok' };
    },
  });
  await actions.generate_briefing({ incident_id: ID, kind: 'operator' });
  assert.ok(seen.includes('432 ± 99 kg CH4/hr'));
  assert.ok(!seen.includes('+1555'));
});

test('notify_operator: Relay throwing is UPSTREAM_UNAVAILABLE and the dashboard path still works', async () => {
  const { actions, store } = await setup({
    relay: async () => {
      throw new Error('relay timeout');
    },
  });
  assert.equal(await codeOf(actions.notify_operator({ incident_id: ID, channel: 'CALL' })), 'UPSTREAM_UNAVAILABLE');
  assert.equal(store.incidents()[0]!.status, 'ANALYZED');

  const handled = await actions.handle_highest_priority({ actor: 'DASHBOARD' });
  assert.equal(handled.alert, null);
  assert.equal(handled.steps.at(-1)?.ok, false);
  assert.equal(handled.incident.status, 'ANALYZED');

  const acked = await actions.acknowledge_incident({ incident_id: ID, contact_id: 'SAMPLE-C1', channel: 'DASHBOARD' });
  assert.equal(acked.status, 'ACKNOWLEDGED');
  assert.equal(store.actions().at(-1)?.actor, 'DASHBOARD');
});

test('notify_operator: a FAILED delivery is recorded but does not move the status', async () => {
  const { actions, store } = await setup({ relay: async () => ({ delivery_status: 'FAILED', provider_ref: 'x' }) });
  const result = await actions.notify_operator({ incident_id: ID, channel: 'SMS' });
  assert.equal(result.delivery_status, 'FAILED');
  assert.equal(store.alerts().length, 1);
  assert.equal(store.incidents()[0]!.status, 'ANALYZED');
});

test('set_incident_status cannot acknowledge; that needs acknowledge_incident', async () => {
  const { actions, store } = await setup();
  assert.equal(
    await codeOf(actions.set_incident_status({ incident_id: ID, status: 'ACKNOWLEDGED', actor: 'DASHBOARD' })),
    'VALIDATION_ERROR'
  );
  assert.equal(store.acknowledgements().length, 0);
});

test('record_action appends to the audit log and validates the actor', async () => {
  const { actions, store } = await setup();
  const { action_id } = await actions.record_action({ incident_id: ID, actor: 'FETCH_AGENT', action_name: 'thinking', detail: 'x' });
  assert.ok(store.actions().some(a => a.action_id === action_id && a.actor === 'FETCH_AGENT'));
  assert.equal(await codeOf(actions.record_action({ incident_id: ID, actor: 'HACKER', action_name: 'x', detail: '' })), 'VALIDATION_ERROR');
  assert.equal(await codeOf(actions.record_action({ incident_id: 'INC-404', actor: 'SYSTEM', action_name: 'x', detail: '' })), 'NOT_FOUND');
});

test('input validation rejects missing fields and non-object bodies', async () => {
  const { actions } = await setup();
  assert.equal(await codeOf(actions.get_incident({})), 'VALIDATION_ERROR');
  assert.equal(await codeOf(actions.get_incident('INC-0001')), 'VALIDATION_ERROR');
  assert.equal(await codeOf(actions.get_open_incidents({ limit: 0 })), 'VALIDATION_ERROR');
  assert.equal(await codeOf(actions.notify_operator({ incident_id: ID, channel: 'DASHBOARD' })), 'VALIDATION_ERROR');
});

test('get_open_incidents sorts by priority then age; AMBIGUOUS and no-asset events route by policy', async () => {
  const { actions, store } = await setup();
  const base = loadEventFixtures(SAMPLE_FIXTURES_DIR, 'main');
  const variant = (suffix: string, changes: Partial<typeof base.event>) => ({
    event: { ...base.event, event_id: `EVT-${suffix}`, plume_id: suffix, source_name: `SRC-${suffix}`, ...changes },
    source: null,
  });

  // Far from every asset, large emission: CRITICAL, routed to the no-asset role.
  const far = await replayEvent(store, variant('far', { plume_latitude: 32.4, plume_longitude: -103.1, emission_auto: 5000 }), standinMatchAsset);
  assert.equal(far.incident.match_result, 'NO_REGISTERED_ASSET');
  assert.equal(far.incident.asset_id, null);
  assert.equal(far.incident.priority, 'CRITICAL');
  assert.equal(far.incident.assigned_contact_id, 'SAMPLE-C3');

  // Radius wide enough for both assets: AMBIGUOUS, routed to the supervisor.
  const wide = await replayEvent(store, variant('wide', { emission_auto: 5 }), standinMatchAsset, 20_000);
  assert.equal(wide.incident.match_result, 'AMBIGUOUS');
  assert.equal(wide.incident.candidates.length, 2);
  assert.equal(wide.incident.candidates[0]!.asset_id, 'SAMPLE-101');
  assert.equal(wide.incident.assigned_contact_id, 'SAMPLE-C2');
  assert.equal(wide.incident.priority, 'LOW');

  const open = await actions.get_open_incidents({});
  assert.deepEqual(open.map(i => i.priority), ['CRITICAL', 'HIGH', 'LOW']);
  assert.equal(open[0]!.display.asset, 'No registered asset within range of the plume origin');
  assert.match(open[2]!.display.asset, /^Nearest registered asset: SAMPLE-101 .*; 2 registered assets within range, so the match is ambiguous$/);
  assert.equal((await actions.get_open_incidents({ limit: 1 })).length, 1);

  const handled = await createActions({ store, ports: ports() }).handle_highest_priority({ actor: 'FETCH_AGENT' });
  assert.equal(handled.incident.incident_id, far.incident.incident_id);
  assert.equal((await actions.get_escalation_policy({ incident_id: wide.incident.incident_id })).notify_role, 'area_supervisor');
});
