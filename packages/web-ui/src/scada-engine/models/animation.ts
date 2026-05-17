// packages/web-ui/src/scada-engine/models/animation.ts
//
// FuxaAction is the animation primitive. This file re-exports it under a
// more discoverable name and adds typed discriminators so callers can do
// `if (isMoveAction(a)) { … }` without sprinkling string literals.
import { FuxaAction, FuxaActionType } from './property';

export type { FuxaAction, FuxaActionType };

const make = <T extends FuxaActionType>(t: T) => (a: FuxaAction): a is FuxaAction & { type: T } => a.type === t;

export const isVisibilityAction = make('visibility');
export const isOpacityAction    = make('opacity');
export const isRotateAction     = make('rotate');
export const isScaleAction      = make('scale');
export const isMoveAction       = make('move');
export const isColorAction      = make('color');
export const isTextAction       = make('text');
