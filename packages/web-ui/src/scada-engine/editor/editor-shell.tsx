// SP-FX-4: editor shell — top toolbar + 3-pane composition.

import React from 'react';
import { EditorCanvas } from './EditorCanvas';
import { Palette } from './palette/Palette';
import { Toolbar } from './toolbar/Toolbar';
import { PropertiesPlaceholder } from './properties/PropertiesPlaceholder';

export interface EditorShellProps { viewId: string; }

export function EditorShell({ viewId }: EditorShellProps): JSX.Element {
  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      <Toolbar viewId={viewId} />
      <div className="flex flex-1 overflow-hidden">
        <Palette />
        <div className="flex-1 relative">
          <EditorCanvas />
        </div>
        <PropertiesPlaceholder />
      </div>
    </div>
  );
}
