import { useEffect, useRef, useState } from 'react';
import type { IncidentStatus, Priority } from '@ch4se/contracts';
import { statusHeadline } from '../../display/status';

/**
 * The red -> amber flip is the demo's climax. Keyed on tone so a subscription-driven
 * status change remounts the element and replays the CSS flip animation.
 */
export function StatusHeadline({ status, priority }: { status: IncidentStatus; priority: Priority }) {
  const { text, tone } = statusHeadline(status, priority);
  const initialTone = useRef(tone);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (tone !== initialTone.current) setChanged(true);
  }, [tone]);

  return (
    <h2 key={tone} className={`headline headline--${tone}${changed ? ' headline--flip' : ''}`} aria-live="polite">
      {text}
    </h2>
  );
}
