import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatProvenance } from '@ch4se/contracts';
import { Attribution } from '../components/Attribution';
import { ConnectionIndicator } from '../components/ConnectionIndicator';
import { ReplayBanner } from '../components/ReplayBanner';
import { StatusHeadline } from '../components/card/StatusHeadline';
import { selectIncidentView } from '../data/selectors';
import { useDb } from '../data/source';
import { canAcknowledge, canMarkInvestigating } from '../display/status';
import { useAction } from '../hooks/useAction';

/**
 * Relay fallback (Product Direction §14): a phone-sized page using exactly the
 * same Core API actions the Relay agent uses.
 */
export function Operator() {
  const snap = useDb();
  const [params] = useSearchParams();
  const view = useMemo(() => selectIncidentView(snap, params.get('incident')), [snap, params]);
  const incidentId = view?.incident.incident_id;

  const briefing = useAction('generate_briefing');
  const ack = useAction('acknowledge_incident');
  const investigate = useAction('set_incident_status');
  const runBriefing = briefing.run;

  useEffect(() => {
    if (incidentId) void runBriefing({ incident_id: incidentId, kind: 'operator' });
  }, [incidentId, runBriefing]);

  const err = ack.error ?? investigate.error ?? briefing.error;
  // The backend needs a contact to record the acknowledgement against.
  const contactId = view?.incident.assigned_contact_id ?? null;

  return (
    <div className="operator">
      <div className="phone">
        <header className="phone__top">
          <Link className="phone__back" to="/">
            ← Dashboard
          </Link>
          <span className="brand brand--sm">
            CH<sub>4</sub>SE · Operator
          </span>
          <ConnectionIndicator status={snap.connection} error={snap.connectionError} />
        </header>
        <ReplayBanner event={view?.event} />

        {!view ? (
          <p className="phone__empty">No open incidents.</p>
        ) : (
          <div className="phone__body">
            <StatusHeadline status={view.incident.status} priority={view.incident.priority} />
            {view.event && (
              <p className="card__muted">
                {formatProvenance(view.event)}
              </p>
            )}

            <section className="phone__briefing">
              <div className="card__briefing-head">
                Briefing
                {briefing.result && (
                  <span className={`badge badge--${briefing.result.source.toLowerCase()}`}>{briefing.result.source}</span>
                )}
              </div>
              <p>{briefing.pending && !briefing.result ? 'Generating…' : briefing.result?.text}</p>
            </section>

            <div className="phone__actions">
              <button
                className="btn btn--primary btn--lg"
                disabled={ack.pending || contactId === null || !canAcknowledge(view.incident.status)}
                onClick={() => {
                  if (contactId === null) return;
                  void ack.run({ incident_id: view.incident.incident_id, contact_id: contactId, channel: 'DASHBOARD' });
                }}
              >
                {ack.pending ? 'Acknowledging…' : 'Acknowledge'}
              </button>
              <button
                className="btn btn--lg"
                disabled={investigate.pending || !canMarkInvestigating(view.incident.status)}
                onClick={() =>
                  investigate.run({
                    incident_id: view.incident.incident_id,
                    status: 'INVESTIGATING',
                    actor: 'DASHBOARD',
                  })
                }
              >
                {investigate.pending ? 'Updating…' : 'Mark investigating'}
              </button>
            </div>
            {contactId === null && (
              <p className="card__muted">No contact is assigned to this incident, so it cannot be acknowledged here.</p>
            )}
            {err && (
              <p className="fallback__error">
                {err.code}: {err.message}
              </p>
            )}
          </div>
        )}
        <footer className="phone__footer">
          <Attribution />
        </footer>
      </div>
    </div>
  );
}
