// Seeding and replay logic over a Store. services/seed is the CLI around this;
// the stub Core API uses it to build its canned state.
import {
  DEFAULT_MATCH_RADIUS_M,
  type Asset,
  type Contact,
  type EscalationPolicy,
  type Incident,
  type MatchAsset,
  type ProviderSource,
} from '@ch4se/contracts';
import { evaluatePriority, resolveAssignedContact, validatePolicy } from '@ch4se/rules/priority.ts';
import { ApiError } from './errors.ts';
import type { EventInput, Store } from './store.ts';

export interface CompanyFixtures {
  assets: Asset[];
  contacts: Contact[];
  policies: EscalationPolicy[];
}

export interface EventFixtures {
  event: EventInput;
  source: ProviderSource | null;
}

/** Cross-reference problems that would break routing later. Empty means valid. */
export function validateCompany({ assets, contacts, policies }: CompanyFixtures): string[] {
  const problems = policies.flatMap(validatePolicy);
  const contactIds = new Set(contacts.map(c => c.contact_id));
  const policyIds = new Set(policies.map(p => p.policy_id));
  for (const asset of assets) {
    if (!contactIds.has(asset.site_manager_contact_id)) {
      problems.push(`asset ${asset.asset_id}: site_manager_contact_id ${asset.site_manager_contact_id} is not a contact`);
    }
    if (!policyIds.has(asset.policy_id)) {
      problems.push(`asset ${asset.asset_id}: policy_id ${asset.policy_id} is not a policy`);
    }
  }
  if (policies.length === 0) problems.push('at least one escalation policy is required');
  return problems;
}

/** Loads the synthetic company. Upserts, so it is safe to run again. */
export async function seedCompany(store: Store, company: CompanyFixtures): Promise<void> {
  const problems = validateCompany(company);
  if (problems.length > 0) {
    throw new ApiError('VALIDATION_ERROR', `company fixtures are invalid:\n- ${problems.join('\n- ')}`);
  }
  // Contacts and policies first: assets reference both.
  await store.seedContacts(company.contacts);
  await store.seedPolicies(company.policies);
  await store.seedAssets(company.assets);
}

export function eventIdFor(plume_id: string): string {
  return `EVT-${plume_id}`;
}

export interface ReplayResult {
  incident: Incident;
  /** false when this event had already been replayed; nothing was written. */
  created: boolean;
}

/**
 * Replays one provider event: insert_event, then match (Track C's rule), then
 * priority (packages/rules/priority.ts), then create_incident. Running it
 * twice for the same plume changes nothing the second time.
 */
export async function replayEvent(
  store: Store,
  { event, source }: EventFixtures,
  matchAsset: MatchAsset,
  radius_m: number = DEFAULT_MATCH_RADIUS_M
): Promise<ReplayResult> {
  const existing = store.incidents().find(i => i.event_id === event.event_id);
  if (existing) return { incident: existing, created: false };

  const assets = store.assets();
  const policies = store.policies();
  if (policies.length === 0) throw new ApiError('VALIDATION_ERROR', 'no escalation policy is seeded; run seed first');

  if (!store.events().some(e => e.event_id === event.event_id)) await store.insertEvent(event, source);

  const match = matchAsset({ latitude: event.plume_latitude, longitude: event.plume_longitude }, assets, radius_m);
  // The matched asset, or the nearest candidate when AMBIGUOUS, decides the
  // policy and the routing area. With no asset the lowest policy_id applies.
  const nearestId = match.asset_id ?? match.candidates[0]?.asset_id ?? null;
  const nearest = nearestId === null ? null : (assets.find(a => a.asset_id === nearestId) ?? null);
  const policy =
    (nearest && policies.find(p => p.policy_id === nearest.policy_id)) ??
    [...policies].sort((a, b) => a.policy_id.localeCompare(b.policy_id))[0]!;

  const storedSource = source ?? store.providerSources().find(s => s.source_name === event.source_name) ?? null;
  const { priority, policy_rule_id, notify_role } = evaluatePriority(
    {
      emission_auto: event.emission_auto,
      detection_count: storedSource?.detection_dates.length ?? 0,
      match_result: match.match_result,
      facility_type: nearest?.facility_type ?? null,
    },
    policy
  );
  const contact = resolveAssignedContact(notify_role, nearest, store.contacts());

  await store.createIncident({
    event_id: event.event_id,
    match_result: match.match_result,
    asset_id: match.match_result === 'MATCHED' ? (match.asset_id ?? null) : null,
    distance_m: match.match_result === 'MATCHED' ? (match.distance_m ?? null) : null,
    candidates: match.candidates,
    priority,
    policy_id: policy.policy_id,
    policy_rule_id,
    assigned_contact_id: contact?.contact_id ?? null,
  });
  const incident = store.incidents().find(i => i.event_id === event.event_id);
  if (!incident) throw new ApiError('UPSTREAM_UNAVAILABLE', `incident for ${event.event_id} was not visible after create_incident`);
  return { incident, created: true };
}
