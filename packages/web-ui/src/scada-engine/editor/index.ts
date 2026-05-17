// SP-FX-3a editor barrel
export { EditorCanvas } from './EditorCanvas';
export { CanvasController, type CanvasOpts } from './canvas-svg';
export { TransformHandles, SnapGuides, RotateTooltip } from './transform-handles';
export { PointerTools, type PointerState, type PointerToolsCallbacks } from './pointer-tools';
export {
  clientToSvg, handlePositions, handleFromPoint, applyHandleDrag,
  snap, snapPoint,
  computeBbox, intersectsBox, applyMultiDrag,
  applyRotate,
  type Box, type Point, type HandleId,
} from './geometry';
