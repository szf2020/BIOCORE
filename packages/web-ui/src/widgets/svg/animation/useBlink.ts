import { useEffect, useState } from 'react';
import type { SvgAnimation } from './types';

const BLINK_INTERVAL_MS = 500;

export function useBlink(animations: SvgAnimation[] | undefined): boolean {
  const hasBlink = !!animations?.some((a) => a.type === 'blink');
  const [phase, setPhase] = useState(true);
  useEffect(() => {
    if (!hasBlink) return;
    const id = setInterval(() => setPhase((p) => !p), BLINK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasBlink]);
  return phase;
}
