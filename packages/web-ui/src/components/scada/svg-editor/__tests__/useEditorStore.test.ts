import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore, createEmptyView } from '../useEditorStore';
import type { SvgViewJson, SvgWidgetItem } from '@/widgets/svg/types';

function mkItem(id: string, x = 0, y = 0, w = 50, h = 50): SvgWidgetItem {
  return { id, type: 'svg-rect', x, y, w, h };
}

beforeEach(() => {
  useEditorStore.getState().__resetForTests(createEmptyView());
});

describe('useEditorStore', () => {
  describe('selection', () => {
    it('select replace overwrites prior selection', () => {
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().select(['b'], 'replace');
      expect([...useEditorStore.getState().selectedIds]).toEqual(['b']);
    });

    it('select toggle flips membership', () => {
      useEditorStore.getState().select(['a'], 'toggle');
      useEditorStore.getState().select(['a'], 'toggle');
      expect(useEditorStore.getState().selectedIds.size).toBe(0);
    });

    it('select add appends to existing selection', () => {
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().select(['b'], 'add');
      expect([...useEditorStore.getState().selectedIds].sort()).toEqual(['a', 'b']);
    });

    it('selectAll selects every widget in view', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a'), mkItem('b'), mkItem('c')] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().selectAll();
      expect(useEditorStore.getState().selectedIds.size).toBe(3);
    });

    it('clearSelection empties selection', () => {
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().clearSelection();
      expect(useEditorStore.getState().selectedIds.size).toBe(0);
    });
  });

  describe('CRUD', () => {
    it('addWidget appends to view.items', () => {
      useEditorStore.getState().addWidget(mkItem('a', 10, 20));
      expect(useEditorStore.getState().view.items).toHaveLength(1);
      expect(useEditorStore.getState().view.items[0].id).toBe('a');
    });

    it('deleteSelected removes selected and clears selection', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a'), mkItem('b')] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().deleteSelected();
      expect(useEditorStore.getState().view.items.map(i => i.id)).toEqual(['b']);
      expect(useEditorStore.getState().selectedIds.size).toBe(0);
    });

    it('setWidget patches a single item', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 0, 0, 50, 50)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().setWidget('a', { x: 100, y: 200 });
      const it = useEditorStore.getState().view.items.find(i => i.id === 'a')!;
      expect(it.x).toBe(100);
      expect(it.y).toBe(200);
    });
  });

  describe('gesture + move/resize/rotate', () => {
    it('applyMove translates all selected by (dx, dy)', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 20), mkItem('b', 50, 60)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a', 'b'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 10, y: 20, w: 50, h: 50 }, b: { x: 50, y: 60, w: 50, h: 50 } },
        startRotations: { a: 0, b: 0 },
      });
      useEditorStore.getState().applyMove(5, 7);
      const items = useEditorStore.getState().view.items;
      expect(items.find(i => i.id === 'a')!.x).toBe(15);
      expect(items.find(i => i.id === 'a')!.y).toBe(27);
      expect(items.find(i => i.id === 'b')!.x).toBe(55);
      expect(items.find(i => i.id === 'b')!.y).toBe(67);
    });

    it('applyResize resizes single selected via SE handle', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 20, 100, 80)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'resize',
        handle: 'se',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 10, y: 20, w: 100, h: 80 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyResize('se', 20, 10, { aspect: false, centered: false });
      const it = useEditorStore.getState().view.items[0];
      expect(it.w).toBe(120);
      expect(it.h).toBe(90);
    });

    it('applyRotate writes new rotation to selected', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [{ ...mkItem('a', 0, 0, 100, 100), rotation: 0 }] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'rotate',
        startPoint: { x: 50, y: 0 },
        startBboxes: { a: { x: 0, y: 0, w: 100, h: 100 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyRotate({ x: 100, y: 50 }, { snap15: false });
      const it = useEditorStore.getState().view.items[0];
      expect(it.rotation).toBeCloseTo(90, 0);
    });
  });

  describe('undo/redo', () => {
    it('undo restores previous snapshot; redo reapplies', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 10)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 10, y: 10, w: 50, h: 50 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyMove(20, 30);
      useEditorStore.getState().endGesture();
      expect(useEditorStore.getState().view.items[0].x).toBe(30);
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().view.items[0].x).toBe(10);
      useEditorStore.getState().redo();
      expect(useEditorStore.getState().view.items[0].x).toBe(30);
    });

    it('history caps at 50 entries (oldest dropped)', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 0, 0)] };
      useEditorStore.getState().__resetForTests(view);
      for (let i = 0; i < 60; i++) {
        useEditorStore.getState().setWidget('a', { x: i + 1 });
      }
      expect(useEditorStore.getState().history.length).toBe(50);
    });

    it('mutation after undo clears the future stack', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().setWidget('a', { x: 10 });
      useEditorStore.getState().setWidget('a', { x: 20 });
      useEditorStore.getState().undo();
      expect(useEditorStore.getState().future.length).toBe(1);
      useEditorStore.getState().setWidget('a', { x: 99 });
      expect(useEditorStore.getState().future.length).toBe(0);
    });
  });

  describe('grid snap on commit', () => {
    it('endGesture snaps x/y to gridSize when gridSnap enabled', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 10, 10)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().setGridSnap(true);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 10, y: 10, w: 50, h: 50 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyMove(13, 17);
      useEditorStore.getState().endGesture();
      const it = useEditorStore.getState().view.items[0];
      expect(it.x).toBe(20);
      expect(it.y).toBe(30);
    });

    it('endGesture snaps w/h to gridSize on resize gesture', () => {
      const view: SvgViewJson = { width: 800, height: 600, items: [mkItem('a', 0, 0, 50, 50)] };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().setGridSnap(true);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'resize',
        handle: 'se',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 0, y: 0, w: 50, h: 50 } },
        startRotations: { a: 0 },
      });
      useEditorStore.getState().applyResize('se', 13, 7, { aspect: false, centered: false });
      // Pre-snap widget is 63 x 57
      useEditorStore.getState().endGesture();
      const it = useEditorStore.getState().view.items[0];
      expect(it.w).toBe(60);
      expect(it.h).toBe(60);
    });
  });

  describe('cancelGesture', () => {
    it('reverts in-progress move and pops the history entry pushed by beginGesture', () => {
      const view: SvgViewJson = {
        width: 800,
        height: 600,
        items: [mkItem('a', 10, 20, 50, 50), mkItem('b', 100, 100, 50, 50)],
      };
      useEditorStore.getState().__resetForTests(view);
      useEditorStore.getState().select(['a'], 'replace');

      const startBboxes = {
        a: { x: 10, y: 20, w: 50, h: 50 },
      };
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes,
        startRotations: {},
      });
      expect(useEditorStore.getState().history).toHaveLength(1);

      useEditorStore.getState().applyMove(40, 60);
      expect(useEditorStore.getState().view.items[0]).toMatchObject({ x: 50, y: 80 });

      useEditorStore.getState().cancelGesture();

      const s = useEditorStore.getState();
      expect(s.gesture).toBeNull();
      expect(s.view.items[0]).toMatchObject({ x: 10, y: 20, w: 50, h: 50 });
      expect(s.history).toHaveLength(0);
    });

    it('is a no-op when no gesture is active', () => {
      useEditorStore.getState().cancelGesture();
      expect(useEditorStore.getState().gesture).toBeNull();
    });
  });

  describe('loadView', () => {
    it('replaces view items and clears selection + history + gesture', () => {
      const initial: SvgViewJson = { width: 800, height: 600, items: [mkItem('a')] };
      useEditorStore.getState().__resetForTests(initial);
      useEditorStore.getState().select(['a'], 'replace');
      useEditorStore.getState().beginGesture({
        type: 'move',
        startPoint: { x: 0, y: 0 },
        startBboxes: { a: { x: 0, y: 0, w: 50, h: 50 } },
        startRotations: {},
      });
      const fresh: SvgViewJson = { width: 1024, height: 768, items: [mkItem('x'), mkItem('y')] };
      useEditorStore.getState().loadView(fresh);
      const s = useEditorStore.getState();
      expect(s.view.items.map(i => i.id)).toEqual(['x', 'y']);
      expect(s.view.width).toBe(1024);
      expect(s.selectedIds.size).toBe(0);
      expect(s.history).toHaveLength(0);
      expect(s.future).toHaveLength(0);
      expect(s.gesture).toBeNull();
    });

    it('preserves gridSnap and previewAnimations toolbar prefs (unlike __resetForTests)', () => {
      useEditorStore.getState().__resetForTests({ width: 800, height: 600, items: [] });
      useEditorStore.getState().setGridSnap(true);
      useEditorStore.getState().setPreviewAnimations(true);
      useEditorStore.getState().loadView({ width: 800, height: 600, items: [mkItem('a')] });
      const s = useEditorStore.getState();
      expect(s.gridSnap).toBe(true);
      expect(s.previewAnimations).toBe(true);
    });
  });
});
