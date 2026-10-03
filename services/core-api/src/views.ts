// Read models: Store rows -> the action outputs of §3.6. Every display string
// comes from packages/contracts/format.ts.
import {
  ATTRIBUTION,
  PRIORITIES,
  REPLAY_NOTICE,
  formatAssetMatch,
  formatDistance,
  formatEmission,
  formatHistory,
  formatPersistence,
  formatPreviousIncidents,
  formatProvenance,
  formatStatusHeadline,
  formatTimestamp,
  formatWind,
  type Asset,
  type AssetHistory,
  type BriefingInput,
  type CandidateDetail,
  type Contact,
  type EscalationPolicy,
  type EscalationPolicyResult,
  type Evidence,
  type Incident,
  type IncidentDetail,
  type IncidentSummary,
  type MethaneEvent,
  type PolicyRule,
  type ProviderSource,
} from '@ch4se/contracts';
import { ApiError } from './errors.ts';
import type { Store } from './store.ts';

interface Loaded {
  incident: Incident;
  event: MethaneEvent;
  /** Matched asset, or the nearest candidate when AMBIGUOUS. */
  asset: Asset | null;
  /** Distance to `asset`. */
  distance_m: number | null;
  assigned_contact: Contact | null;
  source: ProviderSource | null;
}

function load(store: Store, incident: Incident): Loaded {
  const event = store.events().find(e => e.event_id === incident.event_id);
  // The reducer guarantees the event exists; a miss means the cache is broken.
  if (!event) throw new ApiError('UPSTREAM_UNAVAILABLE', `event ${incident.event_id} missing for ${incident.incident_id}`);
  const nearest = incident.candidates[0] ?? null;
  const assetId = incident.asset_id ?? nearest?.asset_id ?? null;
  const asset = assetId === null ? null : (store.assets().find(a => a.asset_id === assetId) ?? null);
  const distance_m = incident.asset_id !== null ? incident.distance_m : (nearest?.distance_m ?? null);
  return {
    incident,
    event,
    asset,
    distance_m,
    assigned_contact: store.contacts().find(c => c.contact_id === incident.assigned_contact_id) ?? null,
    source: store.providerSources().find(s => s.source_name === event.source_name) ?? null,
  };
}

export function requireIncident(store: Store, incident_id: string): Incident {
  const incident = store.incidents().find(i => i.incident_id === incident_id);
  if (!incident) throw new ApiError('NOT_FOUND', `incident ${incident_id} not found`);
  return incident;
}

function assetLine({ incident, asset, distance_m }: Loaded): string {
  return formatAssetMatch({
    match_result: incident.match_result,
    asset:
      asset && distance_m !== null
        ? { asset_id: asset.asset_id, facility_type: asset.facility_type, distance_m }
        : null,
    candidate_count: incident.candidates.length,
  });
}

function summarize(loaded: Loaded): IncidentSummary {
  const { incident, event, asset, distance_m } = loaded;
  return {
    incident_id: incident.incident_id,
    event_id: incident.event_id,
    status: incident.status,
    priority: incident.priority,
    policy_rule_id: incident.policy_rule_id,
    match_result: incident.match_result,
    asset_id: incident.asset_id,
    facility_type: asset?.facility_type ?? null,
    distance_m,
    assigned_contact_id: incident.assigned_contact_id,
    emission_auto: event.emission_auto,
    emission_uncertainty_auto: event.emission_uncertainty_auto,
    scene_timestamp: event.scene_timestamp,
    is_replay: event.is_replay,
    created_at: incident.created_at,
    updated_at: incident.updated_at,
    display: {
      headline: formatStatusHeadline(incident.status, incident.priority),
      asset: assetLine(loaded),
      emission: formatEmission(event.emission_auto, event.emission_uncertainty_auto),
      provenance: formatProvenance(event),
    },
  };
}

export function incidentSummary(store: Store, incident_id: string): IncidentSummary {
  return summarize(load(store, requireIncident(store, incident_id)));
}

/** Unresolved incidents: most urgent priority first, then oldest first. */
export function openIncidents(store: Store): IncidentSummary[] {
  return store
    .incidents()
    .filter(incident => incident.status !== 'RESOLVED')
    .sort(
      (a, b) =>
        PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
        a.created_at.localeCompare(b.created_at) ||
        a.incident_id.localeCompare(b.incident_id)
    )
    .map(incident => summarize(load(store, incident)));
}

export function incidentDetail(store: Store, incident_id: string): IncidentDetail {
  const loaded = load(store, requireIncident(store, incident_id));
  const assets = store.assets();
  const candidates: CandidateDetail[] = loaded.incident.candidates.map(candidate => ({
    ...candidate,
    facility_type: assets.find(a => a.asset_id === candidate.asset_id)?.facility_type ?? null,
    display: { distance: formatDistance(candidate.distance_m) },
  }));
  return {
    incident: loaded.incident,
    event: loaded.event,
    asset: loaded.asset,
    candidates,
    assigned_contact: loaded.assigned_contact,
    status: loaded.incident.status,
    display: {
      ...summarize(loaded).display,
      distance: loaded.distance_m === null ? null : formatDistance(loaded.distance_m),
      wind: formatWind(loaded.event),
      replay_notice: REPLAY_NOTICE,
      attribution: ATTRIBUTION,
    },
  };
}

export function evidence(store: Store, incident_id: string): Evidence {
  const { incident, event } = load(store, requireIncident(store, incident_id));
  const provenance = formatProvenance(event);
  return {
    incident_id: incident.incident_id,
    event,
    is_replay: event.is_replay,
    provenance,
    display: {
      emission: formatEmission(event.emission_auto, event.emission_uncertainty_auto),
      provenance,
      scene_timestamp: formatTimestamp(event.scene_timestamp),
      wind: formatWind(event),
      replay_notice: REPLAY_NOTICE,
      attribution: ATTRIBUTION,
    },
  };
}

function requirePolicy(store: Store, policy_id: string): EscalationPolicy {
  const policy = store.policies().find(p => p.policy_id === policy_id);
  if (!policy) throw new ApiError('NOT_FOUND', `escalation policy ${policy_id} not found`);
  return policy;
}

function firedRule(policy: EscalationPolicy, incident: Incident): PolicyRule | null {
  return policy.rules.find(rule => rule.rule_id === incident.policy_rule_id) ?? null;
}

/** Where the incident was routed: the route role overrides the rule's for non-MATCHED. */
function routedRole(policy: EscalationPolicy, incident: Incident, rule: PolicyRule | null): string | null {
  if (incident.match_result === 'AMBIGUOUS') return policy.ambiguous_route_role;
  if (incident.match_result === 'NO_REGISTERED_ASSET') return policy.no_asset_route_role;
  return rule?.notify_role ?? null;
}

export function escalationPolicy(
  store: Store,
  by: { asset_id: string } | { incident_id: string }
): EscalationPolicyResult {
  if ('incident_id' in by) {
    const incident = requireIncident(store, by.incident_id);
    const policy = requirePolicy(store, incident.policy_id);
    const fired_rule = firedRule(policy, incident);
    return { policy, fired_rule, notify_role: routedRole(policy, incident, fired_rule) };
  }
  const asset = store.assets().find(a => a.asset_id === by.asset_id);
  if (!asset) throw new ApiError('NOT_FOUND', `asset ${by.asset_id} not found`);
  return { policy: requirePolicy(store, asset.policy_id), fired_rule: null, notify_role: null };
}

function previousIncidents(store: Store, loaded: Loaded): Incident[] {
  const events = store.events();
  return store
    .incidents()
    .filter(other => {
      if (other.incident_id === loaded.incident.incident_id) return false;
      if (other.created_at > loaded.incident.created_at) return false;
      const sameAsset = loaded.incident.asset_id !== null && other.asset_id === loaded.incident.asset_id;
      const otherEvent = events.find(e => e.event_id === other.event_id);
      return sameAsset || otherEvent?.source_name === loaded.event.source_name;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function assetHistory(store: Store, incident_id: string): AssetHistory {
  const loaded = load(store, requireIncident(store, incident_id));
  const previous = previousIncidents(store, loaded);
  return {
    incident_id,
    source: loaded.source,
    previous_incidents: previous.map(incident => summarize(load(store, incident))),
    display: {
      history: formatHistory(loaded.source),
      persistence: formatPersistence(loaded.source?.persistence ?? null),
      previous_incidents: formatPreviousIncidents(previous.length),
    },
  };
}

export function briefingInput(store: Store, incident_id: string): BriefingInput {
  const loaded = load(store, requireIncident(store, incident_id));
  const { incident, event, asset, assigned_contact, source } = loaded;
  const policy = requirePolicy(store, incident.policy_id);
  const rule = firedRule(policy, incident);
  const previousCount = previousIncidents(store, loaded).length;
  return {
    incident: {
      incident_id: incident.incident_id,
      status: incident.status,
      priority: incident.priority,
      match_result: incident.match_result,
      distance_m: loaded.distance_m,
      candidates: incident.candidates,
    },
    event,
    asset: asset && {
      asset_id: asset.asset_id,
      facility_type: asset.facility_type,
      operator_name: asset.operator_name,
      area_id: asset.area_id,
    },
    assigned_contact: assigned_contact && { name: assigned_contact.name, role: assigned_contact.role },
    policy_rule: {
      policy_id: policy.policy_id,
      rule_id: incident.policy_rule_id,
      priority: incident.priority,
      notify_role: routedRole(policy, incident, rule) ?? '',
    },
    history: { source, previous_incident_count: previousCount },
    display: {
      emission: formatEmission(event.emission_auto, event.emission_uncertainty_auto),
      provenance: formatProvenance(event),
      scene_timestamp: formatTimestamp(event.scene_timestamp),
      asset: assetLine(loaded),
      distance: loaded.distance_m === null ? null : formatDistance(loaded.distance_m),
      history: formatHistory(source),
      persistence: formatPersistence(source?.persistence ?? null),
      wind: formatWind(event),
      previous_incidents: formatPreviousIncidents(previousCount),
      replay_notice: REPLAY_NOTICE,
      attribution: ATTRIBUTION,
    },
  };
}
