import { useTag, type TagSnapshot } from '@/hooks/useTag';
import type { SvgAnimation } from './types';

const EMPTY: SvgAnimation[] = [];

export function useAnimationTagStates(animations: SvgAnimation[] | undefined): TagSnapshot[] {
  const list = animations ?? EMPTY;
  // Calling useTag inside .map() depends on `animations` array length being stable across renders.
  // View JSON is immutable per render; editors that modify animations must remount the consuming
  // component (e.g. by changing its React key). See spec §"Tag-State Hook" for details.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return list.map((a) => useTag(a.tag));
}
