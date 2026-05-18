import React from 'react';
import { EditorCanvas } from './EditorCanvas';
import { Palette } from './palette/Palette';
import { Toolbar } from './toolbar/Toolbar';
import { PropertyPanel } from './properties/PropertyPanel';
import { WIDGET_SCHEMAS } from './properties/widget-schemas';
import { useEditorStore } from '../services/editor-store';
import { useLocale } from '@/i18n/useLocale';

export interface EditorShellProps {
  viewId: string;
  /** SP-FX-25: override window width for mobile fallback (used in tests) */
  windowWidth?: number;
}

export function EditorShell({ viewId, windowWidth }: EditorShellProps): JSX.Element {
  const { t } = useLocale();
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);

  const selectedWidget = (selection.length === 1 && items)
    ? (items[selection[0]] ?? null)
    : null;

  const schema = selectedWidget ? (WIDGET_SCHEMAS[selectedWidget.type] ?? null) : null;

  // SP-FX-25: mobile fallback — < 768px 显示警告 + read-only canvas
  const effectiveWidth = windowWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const isMobile = effectiveWidth < 768;

  function handleChange(patch: Partial<typeof selectedWidget>) {
    if (!selectedWidget) return;
    useEditorStore.getState().updateWidget(selectedWidget.id, patch as any);
  }

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-zinc-950">
        {/* SP-FX-25: mobile warning banner */}
        <div
          data-testid="editor-mobile-warning"
          className="m-4 p-4 rounded-lg bg-yellow-900/50 border border-yellow-600 text-yellow-200 text-sm"
        >
          {t('editor-shell.title')} — please use &ge; 768px screen
        </div>
        {/* read-only preview canvas (pointer-events-none) */}
        <div className="flex-1 overflow-hidden pointer-events-none opacity-50">
          <div className="flex-1 relative h-full">
            <EditorCanvas />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <Toolbar viewId={viewId} />
      <div className="flex flex-1 overflow-hidden">
        <Palette />
        <div className="flex-1 relative">
          <EditorCanvas />
        </div>
        <PropertyPanel
          widget={selectedWidget}
          schema={schema}
          onChange={handleChange}
          mobileMode={isMobile}
        />
      </div>
    </div>
  );
}
