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
let tools: PointerTools;

beforeEach(() => {
  canvas = makeMockCanvas();
  mockGetCTM(canvas._svgRoot, identityMatrix());
  handles = makeMockHandles();
  onWidgetTransformed = vi.fn();
  onSelect = vi.fn();
  getWidgetAt = vi.fn();
  getSnapEnabled = vi.fn(() => false);
  tools = new PointerTools(canvas as any, handles as any, {
    getWidgetAt: (pt) => getWidgetAt(pt) as { id: string; box: Box } | null,
    onWidgetTransformed: (id, box) => onWidgetTransformed(id, box),
    onSelect: (id) => onSelect(id),
    getSnapEnabled: () => getSnapEnabled() as boolean,
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

  it('mousedown on empty area: onSelect(null), stays idle', () => {
    getWidgetAt.mockReturnValue(null);
    tools.handleMouseDown(md(50, 50));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(tools.state.kind).toBe('idle');
  });

  it('mousedown on widget body: onSelect + transitions to drag-body', () => {
    const box: Box = { x: 10, y: 10, w: 50, h: 30 };
    getWidgetAt.mockReturnValue({ id: 'w1', box });
    tools.handleMouseDown(md(30, 25));
    expect(onSelect).toHaveBeenCalledWith('w1');
    expect(tools.state.kind).toBe('drag-body');
    if (tools.state.kind === 'drag-body') {
      expect(tools.state.widgetId).toBe('w1');
      expect(tools.state.startBox).toEqual(box);
    }
  });

  it('mousedown on handle: transitions to drag-handle', () => {
    const box: Box = { x: 100, y: 100, w: 80, h: 60 };
    handles.hitTest.mockReturnValue('se');
    getWidgetAt.mockReturnValue({ id: 'w1', box });
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

  it('drag-body mouseup fires onWidgetTransformed and returns to idle', () => {
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 10, y: 10, w: 50, h: 30 } });
    tools.handleMouseDown(md(20, 20));
    tools.handleMouseMove(mm(30, 25));
    tools.handleMouseUp(mu(30, 25));
    expect(onWidgetTransformed).toHaveBeenCalledWith('w1', { x: 20, y: 15, w: 50, h: 30 });
    expect(tools.state.kind).toBe('idle');
  });

  it('drag-handle SE: mousemove applies handle delta', () => {
    handles.hitTest.mockReturnValue('se');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 100, y: 100, w: 80, h: 60 } });
    tools.handleMouseDown(md(180, 160));
    tools.handleMouseMove(mm(200, 175));
    const lastCall = canvas.upsertWidget.mock.calls[canvas.upsertWidget.mock.calls.length - 1][0];
    expect(lastCall.w).toBe(100);
    expect(lastCall.h).toBe(75);
  });

  it('drag-handle mouseup fires onWidgetTransformed with resized box', () => {
    handles.hitTest.mockReturnValue('se');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 100, y: 100, w: 80, h: 60 } });
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
    if (tools.state.kind === 'drag-body') expect(tools.state.widgetId).toBe('w2');
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
    getSnapEnabled.mockReturnValue(true);
    handles.hitTest.mockReturnValue('se');
    getWidgetAt.mockReturnValue({ id: 'w1', box: { x: 50, y: 50, w: 120, h: 80 } });
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
