// SP-FX-45: Plugin 管理页面 (/scada2/plugins)
// Admin only — 列出已加载 plugin、加载示例、卸载（内存，不持久化）
'use client';

import React, { useState, useCallback } from 'react';
import {
  listPlugins,
  registerPlugin,
  unregisterPlugin,
  clockWidgetPlugin,
} from '@/scada-engine/plugins';
import type { BiocorePlugin } from '@/scada-engine/plugins';

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<ReadonlyArray<BiocorePlugin>>(() => listPlugins());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setPlugins(listPlugins());
  }, []);

  const handleLoadSample = useCallback(() => {
    setError(null);
    try {
      registerPlugin(clockWidgetPlugin);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refresh]);

  const handleUnload = useCallback((id: string) => {
    setError(null);
    try {
      unregisterPlugin(id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [refresh]);

  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#e4e4e7' }}>
      <h2 style={{ marginTop: 0, marginBottom: 16 }}>Plugin 管理</h2>

      {error && (
        <div
          role="alert"
          style={{
            background: '#7f1d1d',
            border: '1px solid #ef4444',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {plugins.length === 0 ? (
        <p style={{ color: '#71717a' }}>暂无已加载 Plugin</p>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid #3f3f46', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>ID</th>
              <th style={{ padding: '6px 8px' }}>名称</th>
              <th style={{ padding: '6px 8px' }}>版本</th>
              <th style={{ padding: '6px 8px' }}>Widget 数</th>
              <th style={{ padding: '6px 8px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #27272a' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#a1a1aa' }}>{p.id}</td>
                <td style={{ padding: '6px 8px' }}>{p.name}</td>
                <td style={{ padding: '6px 8px', color: '#71717a' }}>{p.version}</td>
                <td style={{ padding: '6px 8px' }}>{p.widgets.length}</td>
                <td style={{ padding: '6px 8px' }}>
                  <button
                    onClick={() => handleUnload(p.id)}
                    style={{
                      padding: '3px 10px',
                      background: '#7f1d1d',
                      color: '#fca5a5',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    卸载
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button
        onClick={handleLoadSample}
        style={{
          padding: '6px 14px',
          background: '#1d4ed8',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        加载示例 (ClockWidget)
      </button>
    </div>
  );
}
