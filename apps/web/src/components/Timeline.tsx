import type { Actor } from '@ch4se/contracts';
import { formatClock } from '@ch4se/contracts/format';
import { contactName } from '../data/selectors';
import type { DbSnapshot } from '../data/store';

interface Entry {
  key: string;
  at: string;
  actor: Actor;
  title: string;
  detail: string;
  kind: 'action' | 'alert' | 'ack';
}

/**
 * Live activity timeline: Action + Alert + Acknowledgement rows, newest first.
 * Alert and Acknowledgement rows carry no actor field, so the actor shown for
 * them is inferred (alerts: SYSTEM; acks: DASHBOARD channel -> DASHBOARD, else RELAY_AGENT).
 */
export function Timeline({ snap, incidentId }: { snap: DbSnapshot; incidentId?: string }) {
  const t = snap.tables;
  const scoped = <T extends { incident_id: string }>(rows: T[]) =>
    incidentId ? rows.filter((r) => r.incident_id === incidentId || r.incident_id === '') : rows;

  const entries: Entry[] = [
    ...scoped(t.Action).map((a) => ({
      key: `act-${a.action_id}`,
      at: a.at,
      actor: a.actor,
      title: a.action_name,
      detail: a.detail,
      kind: 'action' as const,
    })),
    ...scoped(t.Alert).map((a) => ({
      key: `alert-${a.alert_id}`,
      at: a.sent_at,
      actor: 'SYSTEM' as const,
      title: `Alert ${a.delivery_status.toLowerCase()}`,
      detail: `${a.channel} to ${contactName(snap, a.contact_id)}`,
      kind: 'alert' as const,
    })),
    ...scoped(t.Acknowledgement).map((a) => ({
      key: `ack-${a.incident_id}-${a.contact_id}-${a.at}`,
      at: a.at,
      actor: (a.channel === 'DASHBOARD' ? 'DASHBOARD' : 'RELAY_AGENT') as Actor,
      title: 'Acknowledged',
      detail: `by ${contactName(snap, a.contact_id)} via ${a.channel}`,
      kind: 'ack' as const,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));

  return (
    <section className="timeline">
      <h3 className="panel-title">Activity</h3>
      {entries.length === 0 ? (
        <p className="card__muted">No activity yet.</p>
      ) : (
        <ol className="timeline__list">
          {entries.map((e) => (
            <li key={e.key} className={`timeline__item timeline__item--${e.kind}`}>
              <time className="timeline__time">{formatClock(e.at)}</time>
              <span className={`actor actor--${e.actor.toLowerCase()}`}>{e.actor}</span>
              <span className="timeline__title">{e.title}</span>
              {e.detail && <span className="timeline__detail">{e.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
