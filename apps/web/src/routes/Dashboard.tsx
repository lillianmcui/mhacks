import { useMemo, useState } from 'react';
import { MATCH_RADIUS_M } from '@ch4se/contracts';
import { ConnectionIndicator } from '../components/ConnectionIndicator';
import { FallbackControls } from '../components/FallbackControls';
import { IncidentCard } from '../components/card/IncidentCard';
import { IncidentList } from '../components/IncidentList';
import { ReplayBanner } from '../components/ReplayBanner';
import { Timeline } from '../components/Timeline';
import { latestEvent, rankIncidents, selectIncidentView } from '../data/selectors';
import { useDb } from '../data/source';
import { useFallbackMode } from '../hooks/useFallbackMode';
import { EventMap } from '../map/EventMap';

export function Dashboard() {
  const snap = useDb();
  const fallback = useFallbackMode();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ranked = useMemo(() => rankIncidents(snap.tables.Incident), [snap.tables.Incident]);
  const view = useMemo(() => selectIncidentView(snap, selectedId), [snap, selectedId]);
  const focusEvent = view?.event ?? latestEvent(snap);
  const candidateIds = useMemo(
    () => (view?.incident.match_result === 'AMBIGUOUS' ? view.incident.candidates.map((c) => c.asset_id) : []),
    [view],
  );

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">
          CH<sub>4</sub>SE
        </div>
        <ReplayBanner event={focusEvent} />
        <ConnectionIndicator status={snap.connection} error={snap.connectionError} />
      </header>

      <main className="dashboard__body">
        <div className="dashboard__map">
          <EventMap
            assets={snap.tables.Asset}
            events={snap.tables.MethaneEvent}
            focusEvent={focusEvent}
            highlightAssetId={view?.incident.asset_id}
            candidateAssetIds={candidateIds}
            radiusM={MATCH_RADIUS_M}
          />
          {fallback && <FallbackControls incidentId={view?.incident.incident_id} />}
        </div>

        <div className="dashboard__side">
          {ranked.length > 1 && (
            <IncidentList incidents={ranked} selectedId={view?.incident.incident_id} onSelect={setSelectedId} />
          )}
          <IncidentCard view={view} pendingEvent={focusEvent} />
          <Timeline snap={snap} />
        </div>
      </main>
    </div>
  );
}
