'use client';
import React, { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useFocusTrap } from './useFocusTrap';
import type { FuxaView } from '../models/hmi';

export interface ViewPropertyPatch {
  name: string;
  width: number;
  height: number;
  background_color?: string;
}

export const ViewPropertyPatchSchema = z.object({
  name: z.string().min(1, '视图名称必填'),
  width: z.number().int().positive('宽度必须 > 0'),
  height: z.number().int().positive('高度必须 > 0'),
  background_color: z.string().optional(),
});

export interface ViewPropertyDialogProps {
  open: boolean;
  view: FuxaView;
  onSave: (patch: ViewPropertyPatch) => void;
  onCancel: () => void;
}

export function ViewPropertyDialog({ open, view, onSave, onCancel }: ViewPropertyDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, open);
  const [name, setName] = useState(view.name);
  const [width, setWidth] = useState(String(view.width));
  const [height, setHeight] = useState(String(view.height));
  const [bg, setBg] = useState((view as any).background_color ?? '');

  // SP-FX-2: resync form state when parent swaps the view prop (e.g. user
  // selects a different view while the dialog stays open). Keyed by view.id
  // to avoid resetting on harmless re-renders.
  useEffect(() => {
    setName(view.name);
    setWidth(String(view.width));
    setHeight(String(view.height));
    setBg((view as any).background_color ?? '');
  }, [view.id, view.name, view.width, view.height, (view as any).background_color]);

  const candidate = {
    name,
    width: Number(width),
    height: Number(height),
    ...(bg ? { background_color: bg } : {}),
  };
  const validation = ViewPropertyPatchSchema.safeParse(candidate);
  const isValid = validation.success;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent ref={dialogRef} className="max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">视图属性</h2>

        <div className="space-y-3">
          <div>
            <label htmlFor="vp-name" className="block text-sm font-medium mb-1">名称</label>
            <input id="vp-name" aria-label="名称" type="text"
              value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-border bg-background text-sm" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="vp-w" className="block text-sm font-medium mb-1">宽度 (px)</label>
              <input id="vp-w" aria-label="宽度" type="number"
                value={width} onChange={(e) => setWidth(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-border bg-background text-sm" />
            </div>
            <div className="flex-1">
              <label htmlFor="vp-h" className="block text-sm font-medium mb-1">高度 (px)</label>
              <input id="vp-h" aria-label="高度" type="number"
                value={height} onChange={(e) => setHeight(e.target.value)}
                className="w-full px-3 py-1.5 rounded border border-border bg-background text-sm" />
            </div>
          </div>
          <div>
            <label htmlFor="vp-bg" className="block text-sm font-medium mb-1">背景色 (可选)</label>
            <div className="flex items-center gap-2">
              <input
                id="vp-bg-picker"
                aria-label="背景色选择器"
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(bg) ? bg : '#ffffff'}
                onChange={(e) => setBg(e.target.value)}
                className="w-10 h-9 rounded border border-border bg-background cursor-pointer"
              />
              <input
                id="vp-bg"
                aria-label="背景色"
                type="text"
                placeholder="#ffffff"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded border border-border bg-background text-sm font-mono"
              />
              {bg && (
                <button
                  type="button"
                  aria-label="清除背景色"
                  className="px-2 py-1 rounded border border-border text-xs hover:bg-muted"
                  onClick={() => setBg('')}
                >清除</button>
              )}
            </div>
          </div>
          {!isValid && (
            <div className="text-xs text-red-600">{validation.error.issues[0]?.message}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button"
            className="px-4 py-2 rounded border border-border text-sm hover:bg-muted"
            onClick={onCancel}>取消</button>
          <button type="button" disabled={!isValid}
            className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => isValid && onSave(validation.data)}>保存</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
