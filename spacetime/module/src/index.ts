// CH4SE SpacetimeDB module (TRACK_BACKEND.md §3.2-§3.4).
//
// All operational state lives here and every mutation goes through a reducer.
// Enum-valued columns are stored as strings and validated against
// packages/contracts, so the state machine has a single definition.
//
// Reducer failures throw SenderError('<CODE>: <message>') where <CODE> is one
// of the Core API error codes (§3.7); the Core API maps it onto the envelope.
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import {
  ACTORS,
  ALERT_CHANNELS,
  BRIEFING_SOURCES,
  DELIVERY_STATUSES,
  INCIDENT_STATUSES,
  MATCH_RESULTS,
  PRIORITIES,
  canTransition,
  type IncidentStatus,
} from '../../../packages/contracts/src/enums.ts';

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const methaneEvent = table(
  { name: 'methane_event', public: true },
  {
    eventId: t.string().primaryKey(), // [DER] never source_name
    plumeId: t.string().unique(), // [OBS]
    sceneId: t.string(), // [OBS]
    sceneTimestamp: t.string(), // [OBS] verbatim provider string
    plumeLatitude: t.f64(), // [OBS]
    plumeLongitude: t.f64(), // [OBS]
    instrument: t.string(), // [OBS]
    ipccSector: t.option(t.string()), // [OBS]
    emissionAuto: t.f64(), // [OBS] kg CH4/hr
    emissionUncertaintyAuto: t.option(t.f64()), // [OBS]
    windSpeedAvgAuto: t.option(t.f64()), // [OBS]
    windDirectionAvgAuto: t.option(t.f64()), // [OBS]
    windSourceAuto: t.option(t.string()), // [OBS]
    plumeQuality: t.option(t.string()), // [OBS]
    plumePng: t.option(t.string()), // [OBS] URL or fixture path
    sourceName: t.string(), // [OBS] reference only, not a key
    provider: t.string(), // [DER]
    isReplay: t.bool(), // [DER]
    ingestedAt: t.timestamp(), // [DER] replay time, not observation time
  }
);

const providerSource = table(
  { name: 'provider_source', public: true },
  {
    sourceName: t.string().primaryKey(), // [OBS]
    persistence: t.option(t.f64()), // [OBS]
    emissionAuto: t.option(t.f64()), // [OBS]
    emissionUncertaintyAuto: t.option(t.f64()), // [OBS]
    observationDates: t.array(t.string()), // [OBS]
    detectionDates: t.array(t.string()), // [OBS]
    explanation: t.option(t.string()), // [OBS]
  }
);

const asset = table(
  { name: 'asset', public: true },
  {
    assetId: t.string().primaryKey(),
    facilityType: t.string(),
    latitude: t.f64(),
    longitude: t.f64(),
    operatorName: t.string(), // fictional company, never the OGIM operator
    siteManagerContactId: t.string(),
    areaId: t.string(),
    policyId: t.string(),
  }
);

const contact = table(
  { name: 'contact', public: true },
  {
    contactId: t.string().primaryKey(),
    name: t.string(),
    role: t.string(),
    phone: t.string(),
    areaId: t.string(),
  }
);

const PolicyThresholds = t.object('PolicyThresholds', {
  emissionCriticalKgh: t.f64(),
  emissionHighKgh: t.f64(),
  recurrenceMinDetections: t.u32(),
});

// A condition left at its "empty" value (none / []) is not checked.
const PolicyRuleConditions = t.object('PolicyRuleConditions', {
  minEmission: t.option(t.string()), // threshold name, e.g. EMISSION_CRITICAL_KGH
  minDetections: t.option(t.string()), // threshold name, e.g. RECURRENCE_MIN_DETECTIONS
  matchResults: t.array(t.string()),
  facilityTypes: t.array(t.string()),
});

const PolicyRule = t.object('PolicyRule', {
  ruleId: t.string(),
  conditions: PolicyRuleConditions,
  priority: t.string(),
  notifyRole: t.string(),
});

const escalationPolicy = table(
  { name: 'escalation_policy', public: true },
  {
    policyId: t.string().primaryKey(),
    thresholds: PolicyThresholds,
    rules: t.array(PolicyRule),
    ambiguousRouteRole: t.string(),
    noAssetRouteRole: t.string(),
  }
);

const MatchCandidate = t.object('MatchCandidate', {
  assetId: t.string(),
  distanceM: t.f64(),
});

const incident = table(
  { name: 'incident', public: true },
  {
    incidentId: t.string().primaryKey(),
    eventId: t.string().unique(), // one incident per event
    matchResult: t.string(),
    assetId: t.option(t.string()),
    distanceM: t.option(t.f64()),
    candidates: t.array(MatchCandidate),
    priority: t.string(),
    policyId: t.string(), // addition (flagged): which policy policy_rule_id belongs to
    policyRuleId: t.string(),
    status: t.string(),
    assignedContactId: t.option(t.string()),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const alert = table(
  { name: 'alert', public: true },
  {
    alertId: t.string().primaryKey(),
    incidentId: t.string().index('btree'),
    contactId: t.string(),
    channel: t.string(),
    sentAt: t.timestamp(),
    deliveryStatus: t.string(),
    messageText: t.string(), // [LLM]
    briefingSource: t.string(),
  }
);

const acknowledgement = table(
  { name: 'acknowledgement', public: true },
  {
    incidentId: t.string().primaryKey(),
    contactId: t.string(),
    channel: t.string(),
    at: t.timestamp(),
  }
);

const action = table(
  { name: 'action', public: true },
  {
    actionId: t.string().primaryKey(),
    incidentId: t.string().index('btree'),
    actor: t.string(),
    actionName: t.string(),
    detail: t.string(),
    at: t.timestamp(),
  }
);

const spacetimedb = schema({
  methaneEvent,
  providerSource,
  asset,
  contact,
  escalationPolicy,
  incident,
  alert,
  acknowledgement,
  action,
});
export default spacetimedb;

// ---------------------------------------------------------------------------
// Helpers (not exported: named exports are reserved for reducers)
// ---------------------------------------------------------------------------

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function fail(code: string, message: string): never {
  throw new SenderError(`${code}: ${message}`);
}

function requireEnum(values: readonly string[], value: string, field: string): void {
  if (!values.includes(value)) {
    fail('VALIDATION_ERROR', `${field} must be one of ${values.join(' | ')}; got "${value}"`);
  }
}

function requireNonEmpty(value: string, field: string): void {
  if (value.trim() === '') fail('VALIDATION_ERROR', `${field} must not be empty`);
}

function requireIncident(ctx: Ctx, incidentId: string) {
  const row = ctx.db.incident.incidentId.find(incidentId);
  if (!row) fail('NOT_FOUND', `incident ${incidentId} not found`);
  return row;
}

function newActionId(ctx: Ctx): string {
  for (;;) {
    const id = `ACT-${ctx.random.integerInRange(0, 0xffffffff).toString(16).padStart(8, '0')}`;
    if (!ctx.db.action.actionId.find(id)) return id;
  }
}

function logAction(ctx: Ctx, incidentId: string, actor: string, actionName: string, detail: string): void {
  ctx.db.action.insert({
    actionId: newActionId(ctx),
    incidentId,
    actor,
    actionName,
    detail,
    at: ctx.timestamp,
  });
}

function transition(ctx: Ctx, incidentId: string, to: IncidentStatus) {
  const row = requireIncident(ctx, incidentId);
  const from = row.status as IncidentStatus;
  if (!canTransition(from, to)) {
    fail('INVALID_TRANSITION', `incident ${incidentId} cannot go from ${from} to ${to}`);
  }
  ctx.db.incident.incidentId.update({ ...row, status: to, updatedAt: ctx.timestamp });
  return from;
}

// ---------------------------------------------------------------------------
// Seed reducers (addition, flagged). Startup only; upsert so reseeding is safe.
// ---------------------------------------------------------------------------

export const seedAssets = spacetimedb.reducer({ assets: t.array(asset.rowType) }, (ctx, { assets }) => {
  for (const row of assets) {
    requireNonEmpty(row.assetId, 'asset_id');
    if (ctx.db.asset.assetId.find(row.assetId)) ctx.db.asset.assetId.update(row);
    else ctx.db.asset.insert(row);
  }
});

export const seedContacts = spacetimedb.reducer({ contacts: t.array(contact.rowType) }, (ctx, { contacts }) => {
  for (const row of contacts) {
    requireNonEmpty(row.contactId, 'contact_id');
    if (ctx.db.contact.contactId.find(row.contactId)) ctx.db.contact.contactId.update(row);
    else ctx.db.contact.insert(row);
  }
});

export const seedPolicies = spacetimedb.reducer(
  { policies: t.array(escalationPolicy.rowType) },
  (ctx, { policies }) => {
    for (const row of policies) {
      requireNonEmpty(row.policyId, 'policy_id');
      for (const rule of row.rules) requireEnum(PRIORITIES, rule.priority, `rule ${rule.ruleId} priority`);
      if (ctx.db.escalationPolicy.policyId.find(row.policyId)) ctx.db.escalationPolicy.policyId.update(row);
      else ctx.db.escalationPolicy.insert(row);
    }
  }
);

// ---------------------------------------------------------------------------
// Event + incident reducers
// ---------------------------------------------------------------------------

const MethaneEventInput = t.object('MethaneEventInput', {
  eventId: t.string(),
  plumeId: t.string(),
  sceneId: t.string(),
  sceneTimestamp: t.string(),
  plumeLatitude: t.f64(),
  plumeLongitude: t.f64(),
  instrument: t.string(),
  ipccSector: t.option(t.string()),
  emissionAuto: t.f64(),
  emissionUncertaintyAuto: t.option(t.f64()),
  windSpeedAvgAuto: t.option(t.f64()),
  windDirectionAvgAuto: t.option(t.f64()),
  windSourceAuto: t.option(t.string()),
  plumeQuality: t.option(t.string()),
  plumePng: t.option(t.string()),
  sourceName: t.string(),
  provider: t.string(),
  isReplay: t.bool(),
});

// Addition (flagged). Used by the replay command. ingested_at is the reducer
// time; the ProviderSource snapshot is stored once per source_name.
export const insertEvent = spacetimedb.reducer(
  { event: MethaneEventInput, source: t.option(providerSource.rowType) },
  (ctx, { event, source }) => {
    requireNonEmpty(event.eventId, 'event_id');
    requireNonEmpty(event.plumeId, 'plume_id');
    if (ctx.db.methaneEvent.eventId.find(event.eventId) || ctx.db.methaneEvent.plumeId.find(event.plumeId)) {
      fail('VALIDATION_ERROR', `event ${event.eventId} (plume ${event.plumeId}) already ingested`);
    }
    ctx.db.methaneEvent.insert({ ...event, ingestedAt: ctx.timestamp });
    if (source) {
      if (source.sourceName !== event.sourceName) {
        fail('VALIDATION_ERROR', 'source.source_name does not match event.source_name');
      }
      if (!ctx.db.providerSource.sourceName.find(source.sourceName)) ctx.db.providerSource.insert(source);
    }
  }
);

// Match + priority are computed by the caller (packages/rules); the incident
// is born ANALYZED. incident_id is assigned here: INC-0001, INC-0002, ...
export const createIncident = spacetimedb.reducer(
  {
    eventId: t.string(),
    matchResult: t.string(),
    assetId: t.option(t.string()),
    distanceM: t.option(t.f64()),
    candidates: t.array(MatchCandidate),
    priority: t.string(),
    policyId: t.string(),
    policyRuleId: t.string(),
    assignedContactId: t.option(t.string()),
  },
  (ctx, args) => {
    requireEnum(MATCH_RESULTS, args.matchResult, 'match_result');
    requireEnum(PRIORITIES, args.priority, 'priority');
    if (!ctx.db.methaneEvent.eventId.find(args.eventId)) fail('NOT_FOUND', `event ${args.eventId} not found`);
    if (ctx.db.incident.eventId.find(args.eventId)) {
      fail('VALIDATION_ERROR', `event ${args.eventId} already has an incident`);
    }
    if (args.assetId !== undefined && !ctx.db.asset.assetId.find(args.assetId)) {
      fail('NOT_FOUND', `asset ${args.assetId} not found`);
    }
    if (args.assignedContactId !== undefined && !ctx.db.contact.contactId.find(args.assignedContactId)) {
      fail('NOT_FOUND', `contact ${args.assignedContactId} not found`);
    }
    const incidentId = `INC-${String(Number(ctx.db.incident.count()) + 1).padStart(4, '0')}`;
    ctx.db.incident.insert({
      incidentId,
      eventId: args.eventId,
      matchResult: args.matchResult,
      assetId: args.assetId,
      distanceM: args.distanceM,
      candidates: args.candidates,
      priority: args.priority,
      policyId: args.policyId,
      policyRuleId: args.policyRuleId,
      assignedContactId: args.assignedContactId,
      status: 'ANALYZED',
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    logAction(
      ctx,
      incidentId,
      'SYSTEM',
      'create_incident',
      `${args.matchResult}; priority ${args.priority} (rule ${args.policyRuleId})`
    );
  }
);

// Validated transition (§3.4). ACKNOWLEDGED must go through
// acknowledge_incident so an Acknowledgement row always exists.
export const setIncidentStatus = spacetimedb.reducer(
  { incidentId: t.string(), status: t.string(), actor: t.string(), note: t.option(t.string()) },
  (ctx, { incidentId, status, actor, note }) => {
    requireEnum(INCIDENT_STATUSES, status, 'status');
    requireEnum(ACTORS, actor, 'actor');
    requireIncident(ctx, incidentId);
    if (status === 'ACKNOWLEDGED') {
      fail('VALIDATION_ERROR', 'use acknowledge_incident to set ACKNOWLEDGED');
    }
    const from = transition(ctx, incidentId, status as IncidentStatus);
    logAction(ctx, incidentId, actor, 'set_incident_status', `${from} -> ${status}${note ? `: ${note}` : ''}`);
  }
);

export const acknowledgeIncident = spacetimedb.reducer(
  { incidentId: t.string(), contactId: t.string(), channel: t.string(), actor: t.string() },
  (ctx, { incidentId, contactId, channel, actor }) => {
    requireEnum(ALERT_CHANNELS, channel, 'channel');
    requireEnum(ACTORS, actor, 'actor');
    requireIncident(ctx, incidentId);
    if (!ctx.db.contact.contactId.find(contactId)) fail('NOT_FOUND', `contact ${contactId} not found`);
    const from = transition(ctx, incidentId, 'ACKNOWLEDGED');
    ctx.db.acknowledgement.insert({ incidentId, contactId, channel, at: ctx.timestamp });
    logAction(ctx, incidentId, actor, 'acknowledge_incident', `${from} -> ACKNOWLEDGED by ${contactId} via ${channel}`);
  }
);

// Writes the Alert. A successful send moves ANALYZED -> ALERT_SENT; any other
// current status is left alone (e.g. a re-notify after ALERT_SENT).
export const recordAlert = spacetimedb.reducer(
  {
    alertId: t.string(),
    incidentId: t.string(),
    contactId: t.string(),
    channel: t.string(),
    deliveryStatus: t.string(),
    messageText: t.string(),
    briefingSource: t.string(),
    actor: t.string(),
  },
  (ctx, { actor, ...row }) => {
    requireNonEmpty(row.alertId, 'alert_id');
    requireEnum(ALERT_CHANNELS, row.channel, 'channel');
    requireEnum(DELIVERY_STATUSES, row.deliveryStatus, 'delivery_status');
    requireEnum(BRIEFING_SOURCES, row.briefingSource, 'briefing_source');
    requireEnum(ACTORS, actor, 'actor');
    const current = requireIncident(ctx, row.incidentId);
    if (!ctx.db.contact.contactId.find(row.contactId)) fail('NOT_FOUND', `contact ${row.contactId} not found`);
    if (ctx.db.alert.alertId.find(row.alertId)) fail('VALIDATION_ERROR', `alert ${row.alertId} already exists`);
    ctx.db.alert.insert({ ...row, sentAt: ctx.timestamp });
    if (row.deliveryStatus !== 'FAILED' && current.status === 'ANALYZED') {
      transition(ctx, row.incidentId, 'ALERT_SENT');
    }
    logAction(ctx, row.incidentId, actor, 'record_alert', `${row.channel} to ${row.contactId}: ${row.deliveryStatus}`);
  }
);

export const recordAction = spacetimedb.reducer(
  {
    actionId: t.string(),
    incidentId: t.string(),
    actor: t.string(),
    actionName: t.string(),
    detail: t.string(),
  },
  (ctx, row) => {
    requireNonEmpty(row.actionId, 'action_id');
    requireNonEmpty(row.actionName, 'action_name');
    requireEnum(ACTORS, row.actor, 'actor');
    requireIncident(ctx, row.incidentId);
    if (ctx.db.action.actionId.find(row.actionId)) fail('VALIDATION_ERROR', `action ${row.actionId} already exists`);
    ctx.db.action.insert({ ...row, at: ctx.timestamp });
  }
);
