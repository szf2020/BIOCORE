import { useTag, type TagSnapshot } from '@/hooks/useTag';
import type { SvgAnimation } from './types';

const EMPTY: SvgAnimation[] = [];

export function useAnimationTagStates(animations: SvgAnimation[] | undefined): TagSnapshot[] {
  const list = animations ?? EMPTY;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return list.map((a) => useTag(a.tag));
}
