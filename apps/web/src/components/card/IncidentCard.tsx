import type { ReactNode } from 'react';
import type { MethaneEvent } from '@ch4se/contracts';
import {
  formatAlertSent,
  formatAssetMatch,
  formatDistance,
  formatEmission,
  formatHistory,
  formatPersistence,
  formatProvenance,
  formatWind,
} from '@ch4se/contracts';
import type { IncidentView } from '../../data/selectors';
import { Attribution } from '../Attribution';
import { StatusHeadline } from './StatusHeadline';

/**
 * Incident card (TRACK_FRONTEND §2.1.3). Every value comes from subscribed rows
 * or `format.ts`. No numeric literals in this folder (see scripts/check-card-literals.mjs).
 * Wording rule: "associated asset" / "nearest registered asset", never "source" / "caused by".
 */
export function IncidentCard({ view, pendingEvent }: { view: IncidentView | null; pendingEvent?: MethaneEvent }) {
  if (!view) return <EmptyCard event={pendingEvent} />;
  const { incident, event, asset, contact, providerSource, latestAlert } = view;
  const wind = event ? formatWind(event) : null;
  const persistence = formatPersistence(providerSource?.persistence ?? null);

  return (
    <article className={`card card--${incident.match_result.toLowerCase()}`}>
      <StatusHeadline status={incident.status} priority={incident.priority} />

      {incident.status === 'ALERT_SENT' && latestAlert && (
        <p className="card__subline">
          {formatAlertSent(contact?.name ?? latestAlert.contact_id, latestAlert.channel, latestAlert.sent_at)}
        </p>
      )}

      <section className="card__section">
        <MatchLine view={view} />
        {asset && <p className="card__muted">Operator: {asset.operator_name}</p>}
        {contact && (
          <p className="card__muted">
            Assigned: {contact.name} ({contact.role})
          </p>
        )}
      </section>

      {event && (
        <section className="card__section">
          <Row label="Provider">{formatProvenance(event)}</Row>
          <Row label="Emissions">{formatEmission(event.emission_auto, event.emission_uncertainty_auto)}</Row>
          {wind && <Row label="Wind">{wind}</Row>}
          {providerSource && <Row label="History">{formatHistory(providerSource)}</Row>}
          {persistence && <Row label="Persistence">{persistence}</Row>}
        </section>
      )}

      <section className="card__section">
        <Row label="Priority">
          <span className={`pill pill--${incident.priority.toLowerCase()}`}>{incident.priority}</span>
          <span className="card__rule">rule {incident.policy_rule_id}</span>
        </Row>
      </section>

      {latestAlert && (
        <section className="card__section card__briefing">
          <div className="card__briefing-head">
            Latest briefing
            <span className={`badge badge--${latestAlert.briefing_source.toLowerCase()}`}>
              {latestAlert.briefing_source}
            </span>
          </div>
          <p>{latestAlert.message_text}</p>
        </section>
      )}

      <footer className="card__footer">
        <Attribution />
      </footer>
    </article>
  );
}

/** The same sentence the briefings use: the matched asset, or the nearest candidate when ambiguous. */
function assetLine({ incident, asset, candidates, nearestCandidate: nearest }: IncidentView): string {
  const shown = incident.match_result === 'MATCHED' ? asset : nearest?.asset;
  const distance_m = incident.match_result === 'MATCHED' ? incident.distance_m : (nearest?.distance_m ?? null);
  return formatAssetMatch({
    match_result: incident.match_result,
    asset:
      shown && distance_m !== null
        ? { asset_id: shown.asset_id, facility_type: shown.facility_type, distance_m }
        : null,
    candidate_count: candidates.length,
  });
}

function MatchLine({ view }: { view: IncidentView }) {
  const { incident, contact } = view;
  return (
    <div>
      <p className="card__asset">{assetLine(view)}</p>
      {incident.match_result === 'AMBIGUOUS' && (
        <ul className="card__candidates">
          {view.candidates.map((c) => (
            <li key={c.asset_id}>
              <strong>{c.asset_id}</strong> {c.asset?.facility_type} · {formatDistance(c.distance_m)}
            </li>
          ))}
        </ul>
      )}
      {incident.match_result !== 'MATCHED' && contact && <p className="card__muted">Routed to: {contact.role}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="row">
      <span className="row__label">{label}</span>
      <span className="row__value">{children}</span>
    </div>
  );
}

function EmptyCard({ event }: { event?: MethaneEvent }) {
  return (
    <article className="card card--empty">
      <h2 className="headline headline--waiting">{event ? 'Analyzing replayed observation…' : 'Waiting for replay…'}</h2>
      {event && (
        <p className="card__muted">{formatProvenance(event)}</p>
      )}
      <footer className="card__footer">
        <Attribution />
      </footer>
    </article>
  );
}
