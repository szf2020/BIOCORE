import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PointerTools } from '../pointer-tools';
import { makeMockCanvas, makeMockHandles, type MockCanvas, type MockHandles } from '@/test/canvasMock';
import { mockGetCTM, identityMatrix } from '@/test/svgDomHelpers';
import type { Box } from '../geometry';

let canvas: MockCanvas;
let handles: MockHandles;
let onWidgetTransformed: ReturnType<typeof vi.fn>;
let onSelect: ReturnType<typeof vi.fn>;
let getWidgetAt: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getSnapEnabled: ReturnType<typeof vi.fn<any[], any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getSelectedIds: ReturnType<typeof vi.fn<any[], any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getWidgetBoxes: ReturnType<typeof vi.fn<any[], any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getAllWidgetBoxes: ReturnType<typeof vi.fn<any[], any>>;
let onBoxSelect: ReturnType<typeof vi.fn>;
let onWidgetTransformedBatch: ReturnType<typeof vi.fn>;
let onDragVisualUpdate: ReturnType<typeof vi.fn>;
let onBoxSelectMove: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getCurrentRotate: ReturnType<typeof vi.fn<any[], any>>;
let onRotated: ReturnType<typeof vi.fn>;
let onRotateMove: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getCurrentRotates: ReturnType<typeof vi.fn<any[], any>>;
let onGroupRotated: ReturnType<typeof vi.fn>;
let tools: PointerTools;

beforeEach(() => {
  canvas = makeMockCanvas();
  mockGetCTM(canvas._svgRoot, identityMatrix());
  handles = makeMockHandles();
  onWidgetTransformed = vi.fn();
  onSelect = vi.fn();
  getWidgetAt = vi.fn();
  getSnapEnabled = vi.fn(() => false);
  getSelectedIds = vi.fn(() => [] as string[]);
  getWidgetBoxes = vi.fn(() => new Map<string, Box>());
  getAllWidgetBoxes = vi.fn(() => new Map<string, Box>());
  onBoxSelect = vi.fn();
  onWidgetTransformedBatch = vi.fn();
  onDragVisualUpdate = vi.fn();
  onBoxSelectMove = vi.fn();
  getCurrentRotate = vi.fn(() => undefined);
  onRotated = vi.fn();
  onRotateMove = vi.fn();
  getCurrentRotates = vi.fn(() => new Map<string, number>());
  onGroupRotated = vi.fn();
  tools = new PointerTools(canvas as any, handles as any, {
    getWidgetAt: (pt) => getWidgetAt(pt) as { id: string; box: Box } | null,
    onWidgetTransformed: (id, box) => onWidgetTransformed(id, box),
    onSelect: (id, additive) => onSelect(id, additive),
    getSnapEnabled: () => getSnapEnabled() as boolean,
    getSelectedIds: () => getSelectedIds() as string[],
    getWidgetBoxes: (ids) => getWidgetBoxes(ids) as Map<string, Box>,
    getAllWidgetBoxes: () => getAllWidgetBoxes() as Map<string, Box>,
    onBoxSelect: (ids, additive) => onBoxSelect(ids, additive),
    onWidgetTransformedBatch: (entries) => onWidgetTransformedBatch(entries),
    onDragVisualUpdate: (box) => onDragVisualUpdate(box),
    onBoxSelectMove: (rect) => onBoxSelectMove(rect),
    getCurrentRotate: (id) => getCurrentRotate(id) as number | undefined,
    onRotated: (id, rotate) => onRotated(id, rotate),
    onRotateMove: (deg, pivot) => onRotateMove(deg, pivot),
    getCurrentRotates: (ids) => getCurrentRotates(ids) as Map<string, number>,
    onGroupRotated: (entries) => onGroupRotated(entries),
  });
});

afterEach(() => {
  tools.destroy();
  canvas._svgRoot.remove();
});

function md(x: number, y: number): MouseEvent {
  return new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true });
}
function mm(x: number, y: number): MouseEvent {
  return new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true });
}
function mu(x: number, y: number): MouseEvent {
  return new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true });
}

describe('PointerTools (SP-FX-3a)', () => {
  it('starts in idle state', () => {
    expect(tools.state.kind).toBe('idle');
  });

  it('mousedown on empty area transitions to box-select (onSelect deferred to mouseup)', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    expect(onSelect).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('box-select');
  });

  it('mousedown on widget body: onSelect + transitions to drag-body', () => {
    const box: Box = { x: 10, y: 10, w: 50, h: 30 };
    getWidgetAt.mockReturnValue({ id: 'w1', box });
    tools.handleMouseDown(md(30, 25));
    expect(onSelect).toHaveBeenCalledWith('w1', false);
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') {
      expect(tools.state.widgetIds[0]).toBe('w1');
      expect(tools.state.startBoxes.get('w1')).toEqual(box);
    }
  });

  it('mousedown on handle: transitions to drag-handle', () => {
    const box: Box = { x: 100, y: 100, w: 80, h: 60 };
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    tools.handleMouseDown(md(180, 160));
    expect(tools.state.kind).toBe('drag-handle');
    if (tools.state.kind === 'drag-handle') {
      expect(tools.state.handle).toBe('se');
    }
  });

  it('drag-body mousemove updates canvas + handles with translated box', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 25));
    expect(canvas.upsertWidget).toHaveBeenCalled();
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.x).toBe(20);
    expect(lastCall.y).toBe(15);
    expect(handles.updateBox).toHaveBeenCalledWith({ x: 20, y: 15, w: 50, h: 30 });
  });

  it('drag-body mouseup fires onWidgetTransformedBatch and returns to idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 25));
    tools.handleMouseUp(mu(30, 25));
    expect(onWidgetTransformedBatch).toHaveBeenCalledWith([
      { id: 'w1', newBox: { x: 20, y: 15, w: 50, h: 30 } },
    ]);
    expect(tools.state.kind).toBe('idle');
  });

  it('drag-handle SE: mousemove applies handle delta', () => {
    const box: Box = { x: 100, y: 100, w: 80, h: 60 };
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    tools.handleMouseDown(md(180, 160));
    tools.handleMouseMove(mm(200, 175));
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.w).toBe(100);
    expect(lastCall.h).toBe(75);
  });

  it('drag-handle mouseup fires onWidgetTransformed with resized box', () => {
    const box: Box = { x: 100, y: 100, w: 80, h: 60 };
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    tools.handleMouseDown(md(180, 160));
    tools.handleMouseUp(mu(200, 175));
    expect(onWidgetTransformed).toHaveBeenCalledWith('w1', expect.objectContaining({ w: 100, h: 75 }));
    expect(tools.state.kind).toBe('idle');
  });

  it('mousemove in idle does not throw', () => {
    expect(() => tools.handleMouseMove(mm(10, 10))).not.toThrow();
  });

  it('mouseup in idle does not throw', () => {
    expect(() => tools.handleMouseUp(mu(10, 10))).not.toThrow();
  });

  it('destroy makes subsequent calls no-op', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.destroy();
    tools.handleMouseDown(md(20, 20));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('re-mousedown after mouseup starts a fresh drag', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseUp(mu(20, 20));
    expect(tools.state.kind).toBe('idle');
    getWidgetAt.mockReturnValue({ id: 'w2', box: { x: 100, y: 100, w: 60, h: 40 } });
    tools.handleMouseDown(md(110, 110));
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') expect(tools.state.widgetIds[0]).toBe('w2');
  });
});

describe('PointerTools snap + cancel (SP-FX-3b.1)', () => {
  it('drag-body with snap ON: mousemove snaps newBox to 10px grid', () => {
    getSnapEnabled.mockReturnValue(true);
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 120, h: 80 } });
    tools.handleMouseDown(md(60, 60));
    tools.handleMouseMove(mm(73, 78));  // dx=13, dy=18 → newBox=(63,68,120,80) → snap → (60,70,120,80)
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.x).toBe(60);
    expect(lastCall.y).toBe(70);
    expect(lastCall.w).toBe(120);
    expect(lastCall.h).toBe(80);
  });

  it('drag-body with snap OFF: raw delta passes through', () => {
    getSnapEnabled.mockReturnValue(false);
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 120, h: 80 } });
    tools.handleMouseDown(md(60, 60));
    tools.handleMouseMove(mm(73, 78));
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.x).toBe(63);
    expect(lastCall.y).toBe(68);
  });

  it('drag-handle SE with snap: w/h snapped to 10', () => {
    const box: Box = { x: 50, y: 50, w: 120, h: 80 };
    getSnapEnabled.mockReturnValue(true);
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    tools.handleMouseDown(md(170, 130));
    tools.handleMouseMove(mm(188, 147));  // dx=18, dy=17 → newBox w=138 h=97 → snap → 140,100
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.w).toBe(140);
    expect(lastCall.h).toBe(100);
  });

  it('cancel() in drag-body restores startBox and returns to idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 120, h: 80 } });
    tools.handleMouseDown(md(60, 60));
    tools.handleMouseMove(mm(73, 78));
    canvas.upsertWidget.mockClear();
    handles.updateBox.mockClear();
    tools.cancel();
    expect(canvas.upsertWidget).toHaveBeenCalledTimes(1);
    const restored = canvas.upsertWidget.mock.calls[0][0];
    expect(restored.x).toBe(50);
    expect(restored.y).toBe(50);
    expect(handles.updateBox).toHaveBeenCalledWith({ x: 50, y: 50, w: 120, h: 80 });
    expect(tools.state.kind).toBe('idle');
    expect(onWidgetTransformed).not.toHaveBeenCalled();
  });

  it('cancel() in idle is no-op', () => {
    canvas.upsertWidget.mockClear();
    handles.updateBox.mockClear();
    tools.cancel();
    expect(canvas.upsertWidget).not.toHaveBeenCalled();
    expect(handles.updateBox).not.toHaveBeenCalled();
  });
});

describe('PointerTools multi-drag + box-select + threshold (SP-FX-3b.2.1)', () => {
  it('drag-body single widget: widgetIds=[id], startBoxes 1 entry (regression)', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') {
      expect(tools.state.widgetIds).toEqual(['w1']);
      expect(tools.state.startBoxes.size).toBe(1);
    }
  });

  it('drag-body multi widget: mousemove updates N canvas calls; mouseup fires onWidgetTransformedBatch with N entries', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 50, h: 30 }],
      ['w2', { x: 100, y: 100, w: 60, h: 40 }],
    ]));
    tools.handleMouseDown(md(20, 20));
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') expect(tools.state.widgetIds).toEqual(['w1', 'w2']);
    tools.handleMouseMove(mm(30, 30));
    expect(canvas.upsertWidget.mock.calls.length).toBeGreaterThanOrEqual(2);
    tools.handleMouseUp(mu(30, 30));
    expect(onWidgetTransformedBatch).toHaveBeenCalledTimes(1);
    const entries = onWidgetTransformedBatch.mock.calls[0][0];
    expect(entries.length).toBe(2);
  });

  it('drag-body multi cancel() restores all widgets, no batch fire', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 50, h: 30 }],
      ['w2', { x: 100, y: 100, w: 60, h: 40 }],
    ]));
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 30));
    canvas.upsertWidget.mockClear();
    tools.cancel();
    expect(onWidgetTransformedBatch).not.toHaveBeenCalled();
    expect(canvas.upsertWidget.mock.calls.length).toBe(2);
    expect(tools.state.kind).toBe('idle');
  });

  it('Shift+click on widget body: onSelect(id, true), state stays idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    const shiftDown = new MouseEvent('mousedown', { clientX: 20, clientY: 20, shiftKey: true, bubbles: true });
    tools.handleMouseDown(shiftDown);
    expect(onSelect).toHaveBeenCalledWith('w1', true);
    expect(tools.state.kind).toBe('idle');
  });

  it('mousedown empty area enters box-select; mousemove >= 3px fires onBoxSelectMove', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    expect(tools.state.kind).toBe('box-select');
    tools.handleMouseMove(mm(60, 80));
    expect(onBoxSelectMove).toHaveBeenCalled();
    const rect = onBoxSelectMove.mock.calls[onBoxSelectMove.mock.calls.length - 1][0];
    expect(rect).toEqual({ x: 50, y: 50, w: 10, h: 30 });
  });

  it('mousedown empty + mouseup within 3px: onSelect(null, false)', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    tools.handleMouseUp(mu(51, 50));
    expect(onSelect).toHaveBeenCalledWith(null, false);
    expect(onBoxSelect).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('idle');
  });

  it('box-select Shift+drag: onBoxSelect(idsInBox, additive=true)', () => {
    getWidgetAt.mockReturnValue(null);
    getAllWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 60, y: 60, w: 30, h: 30 }],
      ['w2', { x: 200, y: 200, w: 30, h: 30 }],
    ]));
    const shiftDown = new MouseEvent('mousedown', { clientX: 50, clientY: 50, shiftKey: true, bubbles: true });
    tools.handleMouseDown(shiftDown);
    tools.handleMouseMove(mm(100, 100));
    tools.handleMouseUp(mu(100, 100));
    expect(onBoxSelect).toHaveBeenCalledWith(['w1'], true);
    expect(tools.state.kind).toBe('idle');
  });

  it('drag-body dx=dy=0 mouseup: short-circuit (no onWidgetTransformedBatch)', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseUp(mu(20, 20));
    expect(onWidgetTransformedBatch).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('idle');
  });
});

describe('PointerTools drag-rotate (SP-FX-3b.2.2)', () => {
  it('mousedown on rotate handle: state=drag-rotate with pivot=center, startRotate=0', () => {
    const box: Box = { x: 50, y: 50, w: 100, h: 60 };
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    getCurrentRotate.mockReturnValue(undefined);
    tools.handleMouseDown(md(100, 30));
    expect(tools.state.kind).toBe('drag-rotate');
    if (tools.state.kind === 'drag-rotate') {
      expect(tools.state.widgetId).toBe('w1');
      expect(tools.state.pivot).toEqual({ x: 100, y: 80 });
      expect(tools.state.startRotate).toBe(0);
    }
  });

  it('drag-rotate mousemove free: fires canvas.applyRotate + onRotateMove with computed deg', () => {
    const box: Box = { x: 50, y: 50, w: 100, h: 60 };
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    getCurrentRotate.mockReturnValue(0);
    tools.handleMouseDown(md(150, 80));  // startPt at angle 0 from pivot (100,80)
    tools.handleMouseMove(mm(100, 130));  // currentPt at angle 90 from pivot
    expect(canvas.applyRotate).toHaveBeenCalled();
    const lastApply = canvas.applyRotate.mock.calls[canvas.applyRotate.mock.calls.length - 1];
    expect(lastApply[1]).toBeCloseTo(90, 0);  // deg
    expect(lastApply[2]).toEqual({ x: 100, y: 80 });
    expect(onRotateMove).toHaveBeenCalled();
  });

  it('drag-rotate mousemove with Shift: snaps to 15 step', () => {
    const box: Box = { x: 50, y: 50, w: 100, h: 60 };
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    getCurrentRotate.mockReturnValue(0);
    tools.handleMouseDown(md(150, 80));
    const shiftMove = new MouseEvent('mousemove', {
      clientX: 100 + 50 * Math.cos(23 * Math.PI / 180),
      clientY: 80 + 50 * Math.sin(23 * Math.PI / 180),
      shiftKey: true,
      bubbles: true,
    });
    tools.handleMouseMove(shiftMove);
    const lastApply = canvas.applyRotate.mock.calls[canvas.applyRotate.mock.calls.length - 1];
    expect(lastApply[1]).toBe(30);
  });

  it('drag-rotate mouseup commits via onRotated; state idle; onRotateMove(null,null)', () => {
    const box: Box = { x: 50, y: 50, w: 100, h: 60 };
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    getCurrentRotate.mockReturnValue(0);
    tools.handleMouseDown(md(150, 80));
    tools.handleMouseUp(mu(100, 130));
    expect(onRotated).toHaveBeenCalled();
    const [id, deg] = onRotated.mock.calls[0];
    expect(id).toBe('w1');
    expect(deg).toBeCloseTo(90, 0);
    expect(tools.state.kind).toBe('idle');
    expect(onRotateMove).toHaveBeenLastCalledWith(null, null);
  });

  it('drag-rotate mouseup with deg===startRotate: no onRotated fire (short-circuit)', () => {
    const box: Box = { x: 50, y: 50, w: 100, h: 60 };
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    getCurrentRotate.mockReturnValue(45);
    tools.handleMouseDown(md(150, 80));
    tools.handleMouseUp(mu(150, 80));  // same pt → deg=45=startRotate
    expect(onRotated).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('idle');
  });

  it('cancel() in drag-rotate: canvas.applyRotate(startRotate); tooltip hide; idle; no onRotated', () => {
    const box: Box = { x: 50, y: 50, w: 100, h: 60 };
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    getCurrentRotate.mockReturnValue(30);
    tools.handleMouseDown(md(150, 80));
    tools.handleMouseMove(mm(100, 130));
    canvas.applyRotate.mockClear();
    tools.cancel();
    expect(canvas.applyRotate).toHaveBeenCalledWith('w1', 30, { x: 100, y: 80 });
    expect(onRotated).not.toHaveBeenCalled();
    expect(onRotateMove).toHaveBeenLastCalledWith(null, null);
    expect(tools.state.kind).toBe('idle');
  });

  it('mousedown on rotate handle but no single selection: stays idle (defensive)', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue([]);  // no selection → stays idle
    tools.handleMouseDown(md(100, 30));
    expect(tools.state.kind).toBe('idle');
  });

  it('drag-rotate state preserves startBox unchanged', () => {
    handles.hitTest.mockReturnValue('rotate');
    const box: Box = { x: 50, y: 50, w: 100, h: 60 };
    getSelectedIds.mockReturnValue(['w1']);
    getWidgetBoxes.mockReturnValue(new Map([['w1', box]]));
    getCurrentRotate.mockReturnValue(15);
    tools.handleMouseDown(md(100, 30));
    if (tools.state.kind === 'drag-rotate') {
      expect(tools.state.startBox).toEqual(box);
      expect(tools.state.startRotate).toBe(15);
    }
  });
});

describe('PointerTools group-rotate + group-resize (SP-FX-3b.2.3)', () => {
  it('mousedown rotate handle in bbox mode (selectedIds≥2): state=group-rotate with pivot=bbox center', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 200, y: 100, w: 100, h: 60 }],
    ]));
    getCurrentRotates.mockReturnValue(new Map<string, number>([['w1', 10], ['w2', 20]]));
    tools.handleMouseDown(md(150, 60));
    expect(tools.state.kind).toBe('group-rotate');
    if (tools.state.kind === 'group-rotate') {
      expect(tools.state.pivot).toEqual({ x: 150, y: 80 });
      expect(tools.state.widgetIds).toEqual(['w1', 'w2']);
      expect(tools.state.startRotates.get('w1')).toBe(10);
      expect(tools.state.startRotates.get('w2')).toBe(20);
    }
  });

  it('mousedown SE corner in bbox mode: state=group-resize with anchor at NW', () => {
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 200, y: 100, w: 100, h: 60 }],
    ]));
    tools.handleMouseDown(md(300, 160));
    expect(tools.state.kind).toBe('group-resize');
    if (tools.state.kind === 'group-resize') {
      expect(tools.state.handle).toBe('se');
      expect(tools.state.anchor).toEqual({ x: 0, y: 0 });
    }
  });

  it('mousedown N edge in bbox mode: state=group-resize with anchor at S edge midpoint', () => {
    handles.hitTest.mockReturnValue('n');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 200, y: 100, w: 100, h: 60 }],
    ]));
    tools.handleMouseDown(md(150, 0));
    expect(tools.state.kind).toBe('group-resize');
    if (tools.state.kind === 'group-resize') {
      expect(tools.state.handle).toBe('n');
      expect(tools.state.anchor).toEqual({ x: 150, y: 160 });
    }
  });

  it('group-rotate mousemove 90°: canvas.upsertWidget fires per widget with rotated coords + rotate field', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 100, y: 100, w: 20, h: 20 }],
      ['w2', { x: 200, y: 200, w: 20, h: 20 }],
    ]));
    getCurrentRotates.mockReturnValue(new Map<string, number>());
    tools.handleMouseDown(md(220, 160));
    canvas.upsertWidget.mockClear();
    tools.handleMouseMove(mm(160, 220));
    expect(canvas.upsertWidget.mock.calls.length).toBeGreaterThanOrEqual(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Call = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Call).toBeDefined();
    expect(w1Call![0].rotate).toBeCloseTo(90, 0);
  });

  it('group-rotate mouseup commits via onGroupRotated with N entries', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 100, y: 100, w: 20, h: 20 }],
      ['w2', { x: 200, y: 200, w: 20, h: 20 }],
    ]));
    getCurrentRotates.mockReturnValue(new Map<string, number>());
    tools.handleMouseDown(md(220, 160));
    tools.handleMouseUp(mu(160, 220));
    expect(onGroupRotated).toHaveBeenCalledTimes(1);
    const entries = onGroupRotated.mock.calls[0][0];
    expect(entries.length).toBe(2);
    expect(entries[0].newRotate).toBeCloseTo(90, 0);
    expect(tools.state.kind).toBe('idle');
  });

  it('cancel() in group-rotate restores all widget startBoxes + startRotates; no onGroupRotated', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    const startBoxes = new Map<string, Box>([
      ['w1', { x: 100, y: 100, w: 20, h: 20 }],
      ['w2', { x: 200, y: 200, w: 20, h: 20 }],
    ]);
    getWidgetBoxes.mockReturnValue(startBoxes);
    getCurrentRotates.mockReturnValue(new Map<string, number>([['w1', 15], ['w2', 0]]));
    tools.handleMouseDown(md(220, 160));
    tools.handleMouseMove(mm(160, 220));
    canvas.upsertWidget.mockClear();
    tools.cancel();
    expect(onGroupRotated).not.toHaveBeenCalled();
    expect(canvas.upsertWidget.mock.calls.length).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Restore = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Restore![0].x).toBe(100);
    expect(w1Restore![0].rotate).toBe(15);
    expect(tools.state.kind).toBe('idle');
  });

  it('group-resize SE corner drag 2x: all widgets x/y/w/h scale from NW anchor', () => {
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 30, h: 20 }],
      ['w2', { x: 60, y: 50, w: 30, h: 20 }],
    ]));
    tools.handleMouseDown(md(90, 70));
    canvas.upsertWidget.mockClear();
    tools.handleMouseMove(mm(170, 130));
    expect(canvas.upsertWidget.mock.calls.length).toBeGreaterThanOrEqual(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Call = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Call![0].x).toBe(10);
    expect(w1Call![0].y).toBe(10);
    expect(w1Call![0].w).toBe(60);
    expect(w1Call![0].h).toBe(40);
  });

  it('group-resize Shift on NE corner: aspect-lock applied (uniform scale = min)', () => {
    handles.hitTest.mockReturnValue('ne');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 100 }],
      ['w2', { x: 110, y: 110, w: 10, h: 10 }],
    ]));
    const shiftDown = new MouseEvent('mousedown', { clientX: 120, clientY: 0, shiftKey: true, bubbles: true });
    tools.handleMouseDown(shiftDown);
    canvas.upsertWidget.mockClear();
    const shiftMove = new MouseEvent('mousemove', { clientX: 320, clientY: -60, shiftKey: true, bubbles: true });
    tools.handleMouseMove(shiftMove);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Call = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Call![0].w).toBe(150);
    expect(w1Call![0].h).toBe(150);
  });

  it('group-resize any widget projects w<5: handleMouseMove no canvas.upsertWidget call', () => {
    handles.hitTest.mockReturnValue('e');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 110, y: 10, w: 50, h: 40 }],
    ]));
    tools.handleMouseDown(md(160, 30));
    canvas.upsertWidget.mockClear();
    tools.handleMouseMove(mm(2, 30));
    expect(canvas.upsertWidget).not.toHaveBeenCalled();
  });

  it('cancel() in group-resize restores all widget startBoxes; no commit', () => {
    handles.hitTest.mockReturnValue('se');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    const startBoxes = new Map<string, Box>([
      ['w1', { x: 10, y: 10, w: 30, h: 20 }],
      ['w2', { x: 60, y: 50, w: 30, h: 20 }],
    ]);
    getWidgetBoxes.mockReturnValue(startBoxes);
    tools.handleMouseDown(md(90, 70));
    tools.handleMouseMove(mm(170, 130));
    canvas.upsertWidget.mockClear();
    tools.cancel();
    expect(onWidgetTransformedBatch).not.toHaveBeenCalled();
    expect(canvas.upsertWidget.mock.calls.length).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w1Restore = canvas.upsertWidget.mock.calls.find((c: any[]) => c[0].id === 'w1');
    expect(w1Restore![0].x).toBe(10);
    expect(w1Restore![0].w).toBe(30);
    expect(tools.state.kind).toBe('idle');
  });

  it('group-rotate mousedown→mouseup with no movement: onGroupRotated NOT called', () => {
    handles.hitTest.mockReturnValue('rotate');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 100, y: 100, w: 20, h: 20 }],
      ['w2', { x: 200, y: 200, w: 20, h: 20 }],
    ]));
    getCurrentRotates.mockReturnValue(new Map<string, number>());
    tools.handleMouseDown(md(220, 160));
    tools.handleMouseUp(mu(220, 160));
    expect(onGroupRotated).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('idle');
  });

  it('group-resize mouseup when applyGroupResize returns null (min-size freeze): onWidgetTransformedBatch NOT called', () => {
    handles.hitTest.mockReturnValue('e');
    getSelectedIds.mockReturnValue(['w1', 'w2']);
    getWidgetBoxes.mockReturnValue(new Map<string, Box>([
      ['w1', { x: 0, y: 0, w: 100, h: 60 }],
      ['w2', { x: 110, y: 10, w: 50, h: 40 }],
    ]));
    tools.handleMouseDown(md(160, 30));
    onWidgetTransformedBatch.mockClear();
    tools.handleMouseUp(mu(2, 30));
    expect(onWidgetTransformedBatch).not.toHaveBeenCalled();
    expect(tools.state.kind).toBe('idle');
  });
});
