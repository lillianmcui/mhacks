import type { ReactNode } from 'react';
import type { MethaneEvent } from '@ch4se/contracts';
import { MATCH_RADIUS_M } from '@ch4se/contracts';
import {
  formatDistance,
  formatEmission,
  formatHistory,
  formatPersistence,
  formatProvenance,
  formatTimestamp,
  formatWind,
} from '@ch4se/contracts/format';
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

  return (
    <article className={`card card--${incident.match_result.toLowerCase()}`}>
      <StatusHeadline status={incident.status} priority={incident.priority} />

      {incident.status === 'ALERT_SENT' && latestAlert && (
        <p className="card__subline">
          Alert sent to {contact?.name ?? latestAlert.contact_id} via {latestAlert.channel} at{' '}
          {formatTimestamp(latestAlert.sent_at)}
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
          <Row label="Provider">{formatProvenance(event.provider, event.instrument, event.scene_timestamp)}</Row>
          <Row label="Emissions">{formatEmission(event.emission_auto, event.emission_uncertainty_auto)}</Row>
          {event.wind_speed_avg_auto != null && event.wind_direction_avg_auto != null && (
            <Row label="Wind">
              {formatWind(event.wind_speed_avg_auto, event.wind_direction_avg_auto, event.wind_source_auto)}
            </Row>
          )}
          {providerSource && (
            <Row label="History">{formatHistory(providerSource.detection_dates, providerSource.observation_dates)}</Row>
          )}
          {providerSource?.persistence != null && (
            <Row label="Persistence">{formatPersistence(providerSource.persistence)}</Row>
          )}
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

function MatchLine({ view }: { view: IncidentView }) {
  const { incident, asset, contact } = view;
  switch (incident.match_result) {
    case 'MATCHED':
      return (
        <p className="card__asset">
          Associated asset: <strong>{incident.asset_id}</strong> {asset?.facility_type}
          {incident.distance_m != null && <> ({formatDistance(incident.distance_m)} from plume origin)</>}
        </p>
      );
    case 'AMBIGUOUS':
      return (
        <div>
          <p className="card__asset">
            Ambiguous: {view.candidates.length} registered assets within {formatDistance(MATCH_RADIUS_M)} of plume origin
          </p>
          <ul className="card__candidates">
            {view.candidates.map((c) => (
              <li key={c.asset_id}>
                <strong>{c.asset_id}</strong> {c.asset?.facility_type} · {formatDistance(c.distance_m)}
              </li>
            ))}
          </ul>
          {contact && <p className="card__muted">Routed to: {contact.role}</p>}
        </div>
      );
    case 'NO_REGISTERED_ASSET':
      return (
        <div>
          <p className="card__asset">No registered asset within {formatDistance(MATCH_RADIUS_M)} of plume origin</p>
          {contact && <p className="card__muted">Routed to: {contact.role}</p>}
        </div>
      );
  }
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
        <p className="card__muted">{formatProvenance(event.provider, event.instrument, event.scene_timestamp)}</p>
      )}
      <footer className="card__footer">
        <Attribution />
      </footer>
    </article>
  );
}
