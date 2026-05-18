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
  applyMultiRotate, applyGroupResize, anchorOf,
  type Box, type Point, type HandleId,
} from './geometry';

// SP-FX-4 shell exports
export { EditorShell, type EditorShellProps } from './editor-shell';
export { Palette } from './palette/Palette';
export { PALETTE_ITEMS, makeWidget, type PaletteItem, type PaletteItemType } from './palette/palette-items';
export { Toolbar, type ToolbarProps } from './toolbar/Toolbar';
export { executeSave, type CommandContext } from './toolbar/commands';
export { PropertiesPlaceholder } from './properties/PropertiesPlaceholder';

// SP-FX-5
export { ShapePicker } from './palette/ShapePicker';
export { makeShapeWidget } from './palette/palette-items';
export { SHAPE_CATALOG, type PaletteShape } from './palette/shape-catalog';
