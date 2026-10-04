import type { MethaneEvent } from '@ch4se/contracts';

/** Shown unless the displayed event is explicitly not a replay. */
export function ReplayBanner({ event }: { event: MethaneEvent | undefined }) {
  if (event && !event.is_replay) return null;
  return (
    <div className="replay-banner" role="status">
      <span className="replay-banner__dot" aria-hidden />
      Real historical observation, replayed through CH4SE.
    </div>
  );
}
