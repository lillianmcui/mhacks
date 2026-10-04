import { Link } from 'react-router-dom';
import { config } from '../config';
import { mock } from '../data/source';
import { useAction } from '../hooks/useAction';

/**
 * Product Direction §14 fallbacks. "Handle highest priority" is the Fetch fallback;
 * the operator view is the Relay fallback. Both call the same Core API actions the
 * agents use, and the dashboard only updates once the subscription delivers rows.
 */
export function FallbackControls({ incidentId }: { incidentId?: string }) {
  const handle = useAction('handle_highest_priority');
  // The run can succeed while a step inside it fails (e.g. Relay is down).
  const failedSteps = handle.result?.steps.filter((step) => !step.ok) ?? [];
  const notify = handle.result?.steps.find((step) => step.step === 'notify_operator');

  return (
    <aside className="fallback">
      <div className="fallback__head">
        Fallback controls <kbd>Shift</kbd>+<kbd>F</kbd>
      </div>
      <button className="btn btn--primary" disabled={handle.pending} onClick={() => handle.run({ actor: 'DASHBOARD' })}>
        {handle.pending ? 'Handling…' : 'Handle highest priority'}
      </button>
      {handle.error && (
        <p className="fallback__error">
          {handle.error.code}: {handle.error.message}
        </p>
      )}
      {!handle.error &&
        failedSteps.map((step) => (
          <p key={step.step} className="fallback__error">
            {step.step} failed: {step.detail}
          </p>
        ))}
      {!handle.error && failedSteps.length === 0 && notify && (
        <p className="card__muted">
          {handle.result!.incident.incident_id}: {notify.detail}
        </p>
      )}
      <Link
        className="btn"
        to={`/operator${incidentId ? `?incident=${encodeURIComponent(incidentId)}` : ''}`}
        target="_blank"
      >
        Open operator view ↗
      </Link>

      {mock && config.dataSource === 'mock' && (
        <div className="fallback__mock">
          <div className="fallback__head">Mock only</div>
          <button className="btn btn--ghost" onClick={() => mock!.replay()}>
            Replay event
          </button>
          <button className="btn btn--ghost" onClick={() => mock!.simulateRelayAck()}>
            Simulate Relay ack + investigating
          </button>
          <button className="btn btn--ghost" onClick={() => mock!.reset()}>
            Reset
          </button>
        </div>
      )}
    </aside>
  );
}
