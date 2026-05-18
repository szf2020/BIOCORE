import React from 'react';
import { EditorCanvas } from './EditorCanvas';
import { Palette } from './palette/Palette';
import { Toolbar } from './toolbar/Toolbar';
import { PropertyPanel } from './properties/PropertyPanel';
import { WIDGET_SCHEMAS } from './properties/widget-schemas';
import { useEditorStore } from '../services/editor-store';

export interface EditorShellProps { viewId: string; }

export function EditorShell({ viewId }: EditorShellProps): JSX.Element {
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);

  const selectedWidget = (selection.length === 1 && items)
    ? (items[selection[0]] ?? null)
    : null;

  const schema = selectedWidget ? (WIDGET_SCHEMAS[selectedWidget.type] ?? null) : null;

  function handleChange(patch: Partial<typeof selectedWidget>) {
    if (!selectedWidget) return;
    useEditorStore.getState().updateWidget(selectedWidget.id, patch as any);
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <Toolbar viewId={viewId} />
      <div className="flex flex-1 overflow-hidden">
        <Palette />
        <div className="flex-1 relative">
          <EditorCanvas />
        </div>
        <PropertyPanel widget={selectedWidget} schema={schema} onChange={handleChange} />
      </div>
    </div>
  );
}
