// TRACK_BACKEND.md §3.1. Plain const arrays + unions (no TS `enum`) so the
// files run under Node's type stripping and in the SpacetimeDB module bundle.

export const INCIDENT_STATUSES = [
  'DETECTED',
  'ANALYZED',
  'ALERT_SENT',
  'ACKNOWLEDGED',
  'INVESTIGATING',
  'RESOLVED',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const MATCH_RESULTS = ['MATCHED', 'AMBIGUOUS', 'NO_REGISTERED_ASSET'] as const;
export type MatchResult = (typeof MATCH_RESULTS)[number];

// Ordered most to least urgent; get_open_incidents sorts by this order.
export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ACTORS = ['FETCH_AGENT', 'RELAY_AGENT', 'DASHBOARD', 'SYSTEM'] as const;
export type Actor = (typeof ACTORS)[number];

export const ALERT_CHANNELS = ['SMS', 'CALL', 'DASHBOARD'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const BRIEFING_SOURCES = ['GROK', 'TEMPLATE'] as const;
export type BriefingSource = (typeof BRIEFING_SOURCES)[number];

// Addition (flagged): §3.2 names Alert.delivery_status without a value set.
export const DELIVERY_STATUSES = ['SENT', 'DELIVERED', 'FAILED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const BRIEFING_KINDS = ['operator', 'sms', 'summary'] as const;
export type BriefingKind = (typeof BRIEFING_KINDS)[number];

export const ERROR_CODES = [
  'NOT_FOUND',
  'INVALID_TRANSITION',
  'VALIDATION_ERROR',
  'UPSTREAM_UNAVAILABLE',
  'NO_OPEN_INCIDENTS',
  'UNAUTHORIZED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// §3.4 incident state machine. Anything not listed is INVALID_TRANSITION.
export const ALLOWED_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  DETECTED: ['ANALYZED'],
  ANALYZED: ['ALERT_SENT', 'ACKNOWLEDGED'],
  ALERT_SENT: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['INVESTIGATING'],
  INVESTIGATING: ['RESOLVED'],
  RESOLVED: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// Statuses the dashboard headlines as UNACKNOWLEDGED.
export const UNACKNOWLEDGED_STATUSES: readonly IncidentStatus[] = ['DETECTED', 'ANALYZED', 'ALERT_SENT'];

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}
