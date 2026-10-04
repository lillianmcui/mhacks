// Generated rows (camelCase, Timestamp, undefined for none) <-> contract
// shapes (snake_case, ISO strings, null for none). The dashboard can use the
// to* functions to feed subscribed rows into packages/contracts/format.ts.
import type {
  Acknowledgement,
  Action,
  Actor,
  Alert,
  AlertChannel,
  Asset,
  BriefingSource,
  Contact,
  DeliveryStatus,
  EmissionThresholdName,
  EscalationPolicy,
  Incident,
  IncidentStatus,
  MatchResult,
  MethaneEvent,
  Priority,
  ProviderSource,
  RecurrenceThresholdName,
} from '@ch4se/contracts';
import type { Timestamp } from 'spacetimedb';
import type * as Row from './generated/types.ts';

const iso = (timestamp: Timestamp): string => timestamp.toDate().toISOString();
const orNull = <T>(value: T | undefined): T | null => (value === undefined ? null : value);
const orUndefined = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);

export function toMethaneEvent(row: Row.MethaneEvent): MethaneEvent {
  return {
    event_id: row.eventId,
    plume_id: row.plumeId,
    scene_id: row.sceneId,
    scene_timestamp: row.sceneTimestamp,
    plume_latitude: row.plumeLatitude,
    plume_longitude: row.plumeLongitude,
    instrument: row.instrument,
    ipcc_sector: orNull(row.ipccSector),
    emission_auto: row.emissionAuto,
    emission_uncertainty_auto: orNull(row.emissionUncertaintyAuto),
    wind_speed_avg_auto: orNull(row.windSpeedAvgAuto),
    wind_direction_avg_auto: orNull(row.windDirectionAvgAuto),
    wind_source_auto: orNull(row.windSourceAuto),
    plume_quality: orNull(row.plumeQuality),
    plume_png: orNull(row.plumePng),
    source_name: row.sourceName,
    provider: row.provider,
    is_replay: row.isReplay,
    ingested_at: iso(row.ingestedAt),
  };
}

export function fromMethaneEventInput(event: Omit<MethaneEvent, 'ingested_at'>): Row.MethaneEventInput {
  return {
    eventId: event.event_id,
    plumeId: event.plume_id,
    sceneId: event.scene_id,
    sceneTimestamp: event.scene_timestamp,
    plumeLatitude: event.plume_latitude,
    plumeLongitude: event.plume_longitude,
    instrument: event.instrument,
    ipccSector: orUndefined(event.ipcc_sector),
    emissionAuto: event.emission_auto,
    emissionUncertaintyAuto: orUndefined(event.emission_uncertainty_auto),
    windSpeedAvgAuto: orUndefined(event.wind_speed_avg_auto),
    windDirectionAvgAuto: orUndefined(event.wind_direction_avg_auto),
    windSourceAuto: orUndefined(event.wind_source_auto),
    plumeQuality: orUndefined(event.plume_quality),
    plumePng: orUndefined(event.plume_png),
    sourceName: event.source_name,
    provider: event.provider,
    isReplay: event.is_replay,
  };
}

export function toProviderSource(row: Row.ProviderSource): ProviderSource {
  return {
    source_name: row.sourceName,
    persistence: orNull(row.persistence),
    emission_auto: orNull(row.emissionAuto),
    emission_uncertainty_auto: orNull(row.emissionUncertaintyAuto),
    observation_dates: [...row.observationDates],
    detection_dates: [...row.detectionDates],
    explanation: orNull(row.explanation),
  };
}

export function fromProviderSource(source: ProviderSource): Row.ProviderSource {
  return {
    sourceName: source.source_name,
    persistence: orUndefined(source.persistence),
    emissionAuto: orUndefined(source.emission_auto),
    emissionUncertaintyAuto: orUndefined(source.emission_uncertainty_auto),
    observationDates: [...source.observation_dates],
    detectionDates: [...source.detection_dates],
    explanation: orUndefined(source.explanation),
  };
}

export function toAsset(row: Row.Asset): Asset {
  return {
    asset_id: row.assetId,
    facility_type: row.facilityType,
    latitude: row.latitude,
    longitude: row.longitude,
    operator_name: row.operatorName,
    site_manager_contact_id: row.siteManagerContactId,
    area_id: row.areaId,
    policy_id: row.policyId,
  };
}

export function fromAsset(asset: Asset): Row.Asset {
  return {
    assetId: asset.asset_id,
    facilityType: asset.facility_type,
    latitude: asset.latitude,
    longitude: asset.longitude,
    operatorName: asset.operator_name,
    siteManagerContactId: asset.site_manager_contact_id,
    areaId: asset.area_id,
    policyId: asset.policy_id,
  };
}

export function toContact(row: Row.Contact): Contact {
  return { contact_id: row.contactId, name: row.name, role: row.role, phone: row.phone, area_id: row.areaId };
}

export function fromContact(contact: Contact): Row.Contact {
  return {
    contactId: contact.contact_id,
    name: contact.name,
    role: contact.role,
    phone: contact.phone,
    areaId: contact.area_id,
  };
}

export function toEscalationPolicy(row: Row.EscalationPolicy): EscalationPolicy {
  return {
    policy_id: row.policyId,
    thresholds: {
      EMISSION_CRITICAL_KGH: row.thresholds.emissionCriticalKgh,
      EMISSION_HIGH_KGH: row.thresholds.emissionHighKgh,
      RECURRENCE_MIN_DETECTIONS: row.thresholds.recurrenceMinDetections,
    },
    rules: row.rules.map(rule => ({
      rule_id: rule.ruleId,
      conditions: {
        ...(rule.conditions.minEmission !== undefined && {
          min_emission: rule.conditions.minEmission as EmissionThresholdName,
        }),
        ...(rule.conditions.minDetections !== undefined && {
          min_detections: rule.conditions.minDetections as RecurrenceThresholdName,
        }),
        ...(rule.conditions.matchResults.length > 0 && {
          match_results: rule.conditions.matchResults as MatchResult[],
        }),
        ...(rule.conditions.facilityTypes.length > 0 && { facility_types: [...rule.conditions.facilityTypes] }),
      },
      priority: rule.priority as Priority,
      notify_role: rule.notifyRole,
    })),
    ambiguous_route_role: row.ambiguousRouteRole,
    no_asset_route_role: row.noAssetRouteRole,
  };
}

export function fromEscalationPolicy(policy: EscalationPolicy): Row.EscalationPolicy {
  return {
    policyId: policy.policy_id,
    thresholds: {
      emissionCriticalKgh: policy.thresholds.EMISSION_CRITICAL_KGH,
      emissionHighKgh: policy.thresholds.EMISSION_HIGH_KGH,
      recurrenceMinDetections: policy.thresholds.RECURRENCE_MIN_DETECTIONS,
    },
    rules: policy.rules.map(rule => ({
      ruleId: rule.rule_id,
      conditions: {
        minEmission: rule.conditions.min_emission,
        minDetections: rule.conditions.min_detections,
        matchResults: [...(rule.conditions.match_results ?? [])],
        facilityTypes: [...(rule.conditions.facility_types ?? [])],
      },
      priority: rule.priority,
      notifyRole: rule.notify_role,
    })),
    ambiguousRouteRole: policy.ambiguous_route_role,
    noAssetRouteRole: policy.no_asset_route_role,
  };
}

export function toIncident(row: Row.Incident): Incident {
  return {
    incident_id: row.incidentId,
    event_id: row.eventId,
    match_result: row.matchResult as MatchResult,
    asset_id: orNull(row.assetId),
    distance_m: orNull(row.distanceM),
    candidates: row.candidates.map(candidate => ({ asset_id: candidate.assetId, distance_m: candidate.distanceM })),
    priority: row.priority as Priority,
    policy_id: row.policyId,
    policy_rule_id: row.policyRuleId,
    status: row.status as IncidentStatus,
    assigned_contact_id: orNull(row.assignedContactId),
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

export function toAlert(row: Row.Alert): Alert {
  return {
    alert_id: row.alertId,
    incident_id: row.incidentId,
    contact_id: row.contactId,
    channel: row.channel as AlertChannel,
    sent_at: iso(row.sentAt),
    delivery_status: row.deliveryStatus as DeliveryStatus,
    message_text: row.messageText,
    briefing_source: row.briefingSource as BriefingSource,
  };
}

export function toAcknowledgement(row: Row.Acknowledgement): Acknowledgement {
  return {
    incident_id: row.incidentId,
    contact_id: row.contactId,
    channel: row.channel as AlertChannel,
    at: iso(row.at),
  };
}

export function toAction(row: Row.Action): Action {
  return {
    action_id: row.actionId,
    incident_id: row.incidentId,
    actor: row.actor as Actor,
    action_name: row.actionName,
    detail: row.detail,
    at: iso(row.at),
  };
}
