import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Contact, EscalationPolicy } from '@ch4se/contracts';
import { PolicyError, evaluatePriority, resolveAssignedContact, validatePolicy, type PriorityInput } from './priority.ts';

// Test-only thresholds; the real ones live in data/fixtures/company/policies.json.
const policy: EscalationPolicy = {
  policy_id: 'POL-TEST',
  thresholds: { EMISSION_CRITICAL_KGH: 1000, EMISSION_HIGH_KGH: 100, RECURRENCE_MIN_DETECTIONS: 3 },
  rules: [
    {
      rule_id: 'R1-critical-recurring',
      conditions: { min_emission: 'EMISSION_CRITICAL_KGH', min_detections: 'RECURRENCE_MIN_DETECTIONS' },
      priority: 'CRITICAL',
      notify_role: 'area_supervisor',
    },
    { rule_id: 'R2-critical', conditions: { min_emission: 'EMISSION_CRITICAL_KGH' }, priority: 'HIGH', notify_role: 'site_manager' },
    {
      rule_id: 'R3-compressor-high',
      conditions: { min_emission: 'EMISSION_HIGH_KGH', facility_types: ['compressor_station'] },
      priority: 'HIGH',
      notify_role: 'site_manager',
    },
    {
      rule_id: 'R4-matched-recurring',
      conditions: { min_detections: 'RECURRENCE_MIN_DETECTIONS', match_results: ['MATCHED'] },
      priority: 'MEDIUM',
      notify_role: 'site_manager',
    },
    { rule_id: 'R5-default', conditions: {}, priority: 'LOW', notify_role: 'site_manager' },
  ],
  ambiguous_route_role: 'area_supervisor',
  no_asset_route_role: 'environmental_lead',
};

const base: PriorityInput = { emission_auto: 10, detection_count: 1, match_result: 'MATCHED', facility_type: 'well' };

test('R1: emission and recurrence both at threshold (inclusive)', () => {
  assert.deepEqual(evaluatePriority({ ...base, emission_auto: 1000, detection_count: 3 }, policy), {
    priority: 'CRITICAL',
    policy_rule_id: 'R1-critical-recurring',
    notify_role: 'area_supervisor',
  });
});

test('R2: critical emission without recurrence', () => {
  const result = evaluatePriority({ ...base, emission_auto: 5000, detection_count: 2 }, policy);
  assert.equal(result.policy_rule_id, 'R2-critical');
  assert.equal(result.priority, 'HIGH');
});

test('R3: facility type condition', () => {
  const input = { ...base, emission_auto: 100, facility_type: 'compressor_station' };
  assert.equal(evaluatePriority(input, policy).policy_rule_id, 'R3-compressor-high');
  assert.equal(evaluatePriority({ ...input, facility_type: 'well' }, policy).policy_rule_id, 'R5-default');
  assert.equal(evaluatePriority({ ...input, facility_type: null }, policy).policy_rule_id, 'R5-default');
});

test('R4: match_result condition', () => {
  const input = { ...base, detection_count: 4 };
  assert.equal(evaluatePriority(input, policy).policy_rule_id, 'R4-matched-recurring');
  assert.equal(evaluatePriority({ ...input, match_result: 'AMBIGUOUS' }, policy).policy_rule_id, 'R5-default');
});

test('R5: catch-all', () => {
  assert.deepEqual(evaluatePriority(base, policy), {
    priority: 'LOW',
    policy_rule_id: 'R5-default',
    notify_role: 'site_manager',
  });
});

test('just below a threshold does not fire the rule', () => {
  assert.equal(evaluatePriority({ ...base, emission_auto: 999.99, detection_count: 3 }, policy).policy_rule_id, 'R4-matched-recurring');
});

test('first match wins over later rules that also match', () => {
  const input = { ...base, emission_auto: 2000, detection_count: 9, facility_type: 'compressor_station' };
  assert.equal(evaluatePriority(input, policy).policy_rule_id, 'R1-critical-recurring');
});

test('AMBIGUOUS and NO_REGISTERED_ASSET override the notify role, not the priority', () => {
  const hot = { ...base, emission_auto: 5000 };
  assert.deepEqual(evaluatePriority({ ...hot, match_result: 'AMBIGUOUS' }, policy), {
    priority: 'HIGH',
    policy_rule_id: 'R2-critical',
    notify_role: 'area_supervisor',
  });
  assert.deepEqual(evaluatePriority({ ...hot, match_result: 'NO_REGISTERED_ASSET', facility_type: null }, policy), {
    priority: 'HIGH',
    policy_rule_id: 'R2-critical',
    notify_role: 'environmental_lead',
  });
});

test('evaluation is deterministic', () => {
  const input = { ...base, emission_auto: 1500, detection_count: 5 };
  assert.deepEqual(evaluatePriority(input, policy), evaluatePriority(input, policy));
});

test('a policy with no matching rule throws instead of guessing', () => {
  const noCatchAll = { ...policy, rules: policy.rules.slice(0, 1) };
  assert.throws(() => evaluatePriority(base, noCatchAll), PolicyError);
});

test('validatePolicy accepts the test policy and reports problems', () => {
  assert.deepEqual(validatePolicy(policy), []);
  const broken = {
    ...policy,
    thresholds: { ...policy.thresholds, EMISSION_HIGH_KGH: undefined as unknown as number },
    rules: policy.rules.slice(0, 2),
  };
  const problems = validatePolicy(broken);
  assert.ok(problems.some(p => p.includes('EMISSION_HIGH_KGH')));
  assert.ok(problems.some(p => p.includes('catch-all')));
});

const contacts: Contact[] = [
  { contact_id: 'C-3', name: 'Supervisor B', role: 'area_supervisor', phone: 'x', area_id: 'AREA-2' },
  { contact_id: 'C-1', name: 'Manager', role: 'site_manager', phone: 'x', area_id: 'AREA-1' },
  { contact_id: 'C-2', name: 'Supervisor A', role: 'area_supervisor', phone: 'x', area_id: 'AREA-1' },
  { contact_id: 'C-4', name: 'Other manager', role: 'site_manager', phone: 'x', area_id: 'AREA-1' },
];

test('resolveAssignedContact prefers the site manager, then the area, then any holder of the role', () => {
  const asset = { site_manager_contact_id: 'C-4', area_id: 'AREA-1' };
  assert.equal(resolveAssignedContact('site_manager', asset, contacts)?.contact_id, 'C-4');
  assert.equal(resolveAssignedContact('area_supervisor', asset, contacts)?.contact_id, 'C-2');
  assert.equal(resolveAssignedContact('area_supervisor', null, contacts)?.contact_id, 'C-2');
  assert.equal(resolveAssignedContact('area_supervisor', { ...asset, area_id: 'AREA-9' }, contacts)?.contact_id, 'C-2');
  assert.equal(resolveAssignedContact('environmental_lead', asset, contacts), null);
});
