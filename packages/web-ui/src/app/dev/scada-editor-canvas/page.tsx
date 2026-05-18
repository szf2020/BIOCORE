'use client';
import React, { useEffect } from 'react';
import { EditorCanvas } from '@/scada-engine/editor';
import { useEditorStore } from '@/scada-engine/services';
import type { FuxaView, FuxaWidget } from '@/scada-engine/models';
import { useLocale } from '@/i18n/useLocale';

function fixtureView(): FuxaView {
  const items: Record<string, FuxaWidget> = {
    w1: { id: 'w1', type: 'svg-ext-value', property: {}, x: 50, y: 50, w: 120, h: 80 } as FuxaWidget,
    w2: { id: 'w2', type: 'svg-ext-value', property: {}, x: 300, y: 200, w: 100, h: 60 } as FuxaWidget,
  };
  return {
    id: 'fixture-1', name: 'Fixture', type: 'svg', svgcontent: '<svg/>',
    width: 800, height: 600, items, schemaVersion: 1,
  } as FuxaView;
}

export default function DevScadaEditorCanvas() {
  const { t } = useLocale();
  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV === 'production') return;
    useEditorStore.getState().openView(fixtureView());
    (window as any).__getCurrentView = () => useEditorStore.getState().currentView;
    (window as any).__resetEditorStore = () => useEditorStore.getState().openView(fixtureView());
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return <div style={{ padding: 24 }}>dev only</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ padding: 12, borderBottom: '1px solid #e5e7eb' }}>
        <strong>SP-FX-3a dev: scada-editor-canvas</strong>
      </header>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <EditorCanvas />
      </div>
    </div>
  );
}
