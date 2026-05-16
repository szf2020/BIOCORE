import type { SvgWidgetItem } from '@/widgets/svg/types';

export type ResizeHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type HandleId = ResizeHandleId | 'rotation';

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ResizeModifiers {
  aspect: boolean;
  centered: boolean;
}

export interface RotateModifiers {
  snap15: boolean;
}

export type SelectMode = 'replace' | 'toggle' | 'add';

export type GestureType = 'move' | 'resize' | 'rotate' | 'rubberband';

export interface EditorGesture {
  type: GestureType;
  handle?: ResizeHandleId;
  startPoint: { x: number; y: number };
  startBboxes: Record<string, AABB>;
  startRotations: Record<string, number>;
  rubberRect?: AABB;
}

export type WidgetItemMap = Record<string, SvgWidgetItem>;
