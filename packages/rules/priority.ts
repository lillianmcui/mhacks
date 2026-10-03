// Deterministic priority + escalation evaluation (TRACK_BACKEND.md §3.5).
// Pure functions, no I/O, no LLM. Rules are evaluated in order and the first
// match wins.
import type { Asset, Contact, EscalationPolicy, MatchResult, PolicyRule, Priority } from '@ch4se/contracts';
import { MATCH_RESULTS, PRIORITIES } from '@ch4se/contracts';

export interface PriorityInput {
  emission_auto: number;
  /** len(detection_dates) of the event's ProviderSource; 0 when there is none. */
  detection_count: number;
  match_result: MatchResult;
  /** Matched asset's type, or the nearest candidate's when AMBIGUOUS; null when no asset. */
  facility_type: string | null;
}

export interface PriorityResult {
  priority: Priority;
  policy_rule_id: string;
  notify_role: string;
}

export class PolicyError extends Error {
  override name = 'PolicyError';
}

const EMISSION_THRESHOLDS = ['EMISSION_CRITICAL_KGH', 'EMISSION_HIGH_KGH'];
const RECURRENCE_THRESHOLDS = ['RECURRENCE_MIN_DETECTIONS'];

export function ruleMatches(rule: PolicyRule, input: PriorityInput, policy: EscalationPolicy): boolean {
  const { min_emission, min_detections, match_results, facility_types } = rule.conditions;
  if (min_emission !== undefined && !(input.emission_auto >= policy.thresholds[min_emission])) return false;
  if (min_detections !== undefined && !(input.detection_count >= policy.thresholds[min_detections])) return false;
  if (match_results !== undefined && match_results.length > 0 && !match_results.includes(input.match_result)) {
    return false;
  }
  if (facility_types !== undefined && facility_types.length > 0) {
    if (input.facility_type === null || !facility_types.includes(input.facility_type)) return false;
  }
  return true;
}

/**
 * The first matching rule sets the priority. The rule's notify_role applies
 * only to a MATCHED incident: AMBIGUOUS routes to ambiguous_route_role and
 * NO_REGISTERED_ASSET to no_asset_route_role.
 */
export function evaluatePriority(input: PriorityInput, policy: EscalationPolicy): PriorityResult {
  const rule = policy.rules.find(candidate => ruleMatches(candidate, input, policy));
  if (!rule) {
    throw new PolicyError(`policy ${policy.policy_id} has no rule matching the incident; add a catch-all last rule`);
  }
  let notify_role = rule.notify_role;
  if (input.match_result === 'AMBIGUOUS') notify_role = policy.ambiguous_route_role;
  if (input.match_result === 'NO_REGISTERED_ASSET') notify_role = policy.no_asset_route_role;
  return { priority: rule.priority, policy_rule_id: rule.rule_id, notify_role };
}

/** Problems that would make a policy unusable. Empty means valid. */
export function validatePolicy(policy: EscalationPolicy): string[] {
  const problems: string[] = [];
  const where = `policy ${policy.policy_id}`;
  for (const name of [...EMISSION_THRESHOLDS, ...RECURRENCE_THRESHOLDS]) {
    const value = (policy.thresholds as unknown as Record<string, unknown> | undefined)?.[name];
    if (typeof value !== 'number' || !Number.isFinite(value)) problems.push(`${where}: threshold ${name} must be a number`);
  }
  if (!policy.ambiguous_route_role) problems.push(`${where}: ambiguous_route_role is required`);
  if (!policy.no_asset_route_role) problems.push(`${where}: no_asset_route_role is required`);
  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    problems.push(`${where}: at least one rule is required`);
    return problems;
  }
  const seen = new Set<string>();
  for (const rule of policy.rules) {
    const at = `${where} rule ${rule.rule_id}`;
    if (!rule.rule_id) problems.push(`${where}: every rule needs a rule_id`);
    if (seen.has(rule.rule_id)) problems.push(`${at}: duplicate rule_id`);
    seen.add(rule.rule_id);
    if (!PRIORITIES.includes(rule.priority)) problems.push(`${at}: priority must be one of ${PRIORITIES.join(' | ')}`);
    if (!rule.notify_role) problems.push(`${at}: notify_role is required`);
    const c = rule.conditions ?? {};
    if (c.min_emission !== undefined && !EMISSION_THRESHOLDS.includes(c.min_emission)) {
      problems.push(`${at}: min_emission must name one of ${EMISSION_THRESHOLDS.join(' | ')}`);
    }
    if (c.min_detections !== undefined && !RECURRENCE_THRESHOLDS.includes(c.min_detections)) {
      problems.push(`${at}: min_detections must name ${RECURRENCE_THRESHOLDS.join(' | ')}`);
    }
    for (const result of c.match_results ?? []) {
      if (!MATCH_RESULTS.includes(result)) problems.push(`${at}: unknown match_result ${String(result)}`);
    }
  }
  const last = policy.rules[policy.rules.length - 1]!;
  const lc = last.conditions ?? {};
  const unconditional =
    lc.min_emission === undefined &&
    lc.min_detections === undefined &&
    (lc.match_results ?? []).length === 0 &&
    (lc.facility_types ?? []).length === 0;
  if (!unconditional) problems.push(`${where}: the last rule must have no conditions (catch-all)`);
  return problems;
}

/**
 * Who gets the incident. `asset` is the matched asset, or the nearest
 * candidate when AMBIGUOUS, or null. Preference order: the asset's own site
 * manager if they hold the role, then a contact with the role in the asset's
 * area, then any contact with the role (lowest contact_id, for determinism).
 */
export function resolveAssignedContact(
  notify_role: string,
  asset: Pick<Asset, 'site_manager_contact_id' | 'area_id'> | null,
  contacts: readonly Contact[]
): Contact | null {
  const withRole = contacts
    .filter(contact => contact.role === notify_role)
    .sort((a, b) => (a.contact_id < b.contact_id ? -1 : a.contact_id > b.contact_id ? 1 : 0));
  if (asset) {
    const manager = withRole.find(contact => contact.contact_id === asset.site_manager_contact_id);
    if (manager) return manager;
    const inArea = withRole.find(contact => contact.area_id === asset.area_id);
    if (inArea) return inArea;
  }
  return withRole[0] ?? null;
}
