import type { IncidentStatus, Priority } from '@ch4se/contracts';

export type Tone = 'unacked' | 'acked' | 'investigating' | 'resolved';

/** TRACK_FRONTEND §3: display-only mapping from Incident.status to headline. */
export function statusHeadline(status: IncidentStatus, priority: Priority): { text: string; tone: Tone } {
  switch (status) {
    case 'DETECTED':
    case 'ANALYZED':
    case 'ALERT_SENT':
      return { text: `${priority} — UNACKNOWLEDGED`, tone: 'unacked' };
    case 'ACKNOWLEDGED':
      return { text: 'ACKNOWLEDGED', tone: 'acked' };
    case 'INVESTIGATING':
      return { text: 'ACKNOWLEDGED — INVESTIGATION UNDERWAY', tone: 'investigating' };
    case 'RESOLVED':
      return { text: 'RESOLVED', tone: 'resolved' };
  }
}

/** Purely to grey out buttons; the backend is still the authority (INVALID_TRANSITION). */
export const canAcknowledge = (s: IncidentStatus) => s === 'ANALYZED' || s === 'ALERT_SENT';
export const canMarkInvestigating = (s: IncidentStatus) => s === 'ACKNOWLEDGED';
