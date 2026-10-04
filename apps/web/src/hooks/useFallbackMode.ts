import { useEffect, useState } from 'react';

/** Fallback controls are hidden unless `?fallback=1` is set or Shift+F is pressed. */
export function useFallbackMode(): boolean {
  const [on, setOn] = useState(() => new URLSearchParams(window.location.search).get('fallback') === '1');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.shiftKey && e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) setOn((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return on;
}
