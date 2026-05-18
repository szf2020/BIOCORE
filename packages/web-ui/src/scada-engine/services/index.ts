// SP-FX-2: services barrel
export {
  useTagBinding,
  readTagSnapshot,
  writeTag,
  registerAckHandler,
  type TagSnapshot,
  type WriteOpts,
} from './tag-binding';

export {
  useEditorStore,
  type EditorState,
} from './editor-store';

export {
  boxIntersects,
  diffSelection,
  type Rect,
  type WidgetGeom,
} from './selection';

export {
  evalExpression,
  parseTagsFromExpression,
} from './expression-eval';

// SP-FX-7 additions
export {
  resolveAnimations,
  evalAnimations,
  type AnimationPatch,
  type ResolvedAnimation,
} from './animation-engine';

export { bindGaugesToRealtime } from './tag-binding-bridge';
