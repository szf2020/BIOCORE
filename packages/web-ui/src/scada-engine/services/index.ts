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
