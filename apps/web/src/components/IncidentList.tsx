import type { Incident } from '@ch4se/contracts';
import { statusHeadline } from '../display/status';

/** P1: multiple incidents ranked by priority. Only rendered when there's more than one. */
export function IncidentList({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: Incident[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="incident-list">
      {incidents.map((i) => {
        const { tone } = statusHeadline(i.status, i.priority);
        return (
          <button
            key={i.incident_id}
            className={`incident-list__item tone--${tone}${i.incident_id === selectedId ? ' is-selected' : ''}`}
            onClick={() => onSelect(i.incident_id)}
          >
            <span className={`pill pill--${i.priority.toLowerCase()}`}>{i.priority}</span>
            <span>{i.asset_id ?? i.match_result}</span>
            <span className="incident-list__status">{i.status}</span>
          </button>
        );
      })}
    </nav>
  );
}
