'use client';
// SP-FX-41: 加入内置模板分组 (BUILTIN_TEMPLATES 静态打包)
import React from 'react';
import { useTemplates } from '@/hooks/useTemplates';
import { BUILTIN_TEMPLATES } from '@/scada-engine/templates';

interface Props {
  projectId: string;
  onPick: (templateViewId: string | null) => void;
  onCancel: () => void;
}

export function TemplatePicker({ projectId, onPick, onCancel }: Props) {
  const { templates, loading, error, refetch } = useTemplates(projectId);

  return (
    <div data-testid="template-picker" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', padding: 16, minWidth: 320, borderRadius: 4 }}>
        <h3 style={{ margin: '0 0 8px 0' }}>选择模板</h3>

        {/* SP-FX-41: 内置模板分组 */}
        <div data-testid="builtin-templates-section" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, marginBottom: 6 }}>内置模板</div>
          {BUILTIN_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              data-testid="builtin-template-btn"
              onClick={() => onPick(`__builtin__:${tpl.id}`)}
              style={{ width: '100%', textAlign: 'left', padding: 8, border: '1px solid #ddd', marginBottom: 4, background: '#f0f9ff', cursor: 'pointer', borderRadius: 3 }}
            >{tpl.name}</button>
          ))}
        </div>

        {error && (
          <div
            data-testid="templates-error-banner"
            style={{ padding: 8, marginBottom: 8, background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ flex: 1 }}>无法加载模板列表: {error.message}</span>
            <button
              data-testid="templates-retry-btn"
              onClick={() => void refetch()}
              style={{ padding: '2px 8px', cursor: 'pointer' }}
            >重试</button>
          </div>
        )}
        {loading ? (
          <div>加载中…</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li>
              <button
                onClick={() => onPick(null)}
                style={{ width: '100%', textAlign: 'left', padding: 8, border: '1px solid #ddd', marginBottom: 4, background: '#fff', cursor: 'pointer' }}
              >空白</button>
            </li>
            {templates.map(t => (
              <li key={t.view_id}>
                <button
                  onClick={() => onPick(t.view_id)}
                  style={{ width: '100%', textAlign: 'left', padding: 8, border: '1px solid #ddd', marginBottom: 4, background: '#fff', cursor: 'pointer' }}
                >{t.name}</button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <button onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}
