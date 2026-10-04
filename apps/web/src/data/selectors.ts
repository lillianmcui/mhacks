import type {
  Acknowledgement,
  Alert,
  Asset,
  Contact,
  Incident,
  MethaneEvent,
  ProviderSource,
} from '@ch4se/contracts';
import { PRIORITIES } from '@ch4se/contracts';
import type { DbSnapshot } from './store';

export interface IncidentView {
  incident: Incident;
  event: MethaneEvent | undefined;
  providerSource: ProviderSource | undefined;
  asset: Asset | undefined;
  contact: Contact | undefined;
  candidates: { asset: Asset | undefined; asset_id: string; distance_m: number }[];
  /** Candidates arrive nearest first; this is the one shown when the match is ambiguous. */
  nearestCandidate: { asset: Asset | undefined; asset_id: string; distance_m: number } | undefined;
  alerts: Alert[];
  latestAlert: Alert | undefined;
  acknowledgements: Acknowledgement[];
}

const newestFirst = (a: string, b: string) => b.localeCompare(a);

/** Open incidents by priority then created_at (same order as get_open_incidents); resolved last. */
export function rankIncidents(incidents: Incident[]): Incident[] {
  return [...incidents].sort(
    (a, b) =>
      Number(a.status === 'RESOLVED') - Number(b.status === 'RESOLVED') ||
      PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
      a.created_at.localeCompare(b.created_at),
  );
}

export function selectIncidentView(snap: DbSnapshot, incidentId?: string | null): IncidentView | null {
  const t = snap.tables;
  const incident = incidentId
    ? t.Incident.find((i) => i.incident_id === incidentId)
    : rankIncidents(t.Incident)[0];
  if (!incident) return null;

  const event = t.MethaneEvent.find((e) => e.event_id === incident.event_id);
  const alerts = t.Alert.filter((a) => a.incident_id === incident.incident_id).sort((a, b) =>
    newestFirst(a.sent_at, b.sent_at),
  );
  const candidates = incident.candidates.map((c) => ({ ...c, asset: t.Asset.find((a) => a.asset_id === c.asset_id) }));
  return {
    incident,
    event,
    providerSource: event && t.ProviderSource.find((p) => p.source_name === event.source_name),
    asset: incident.asset_id ? t.Asset.find((a) => a.asset_id === incident.asset_id) : undefined,
    contact: t.Contact.find((c) => c.contact_id === incident.assigned_contact_id),
    candidates,
    nearestCandidate: candidates[0],
    alerts,
    latestAlert: alerts[0],
    acknowledgements: t.Acknowledgement.filter((a) => a.incident_id === incident.incident_id),
  };
}

/** The event shown on the map/banner when no incident exists yet (replay just inserted it). */
export function latestEvent(snap: DbSnapshot): MethaneEvent | undefined {
  return [...snap.tables.MethaneEvent].sort((a, b) => newestFirst(a.ingested_at, b.ingested_at))[0];
}

export function contactName(snap: DbSnapshot, id: string): string {
  return snap.tables.Contact.find((c) => c.contact_id === id)?.name ?? id;
}
