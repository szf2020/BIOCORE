'use client';
import React from 'react';
import { useTemplates } from '@/hooks/useTemplates';

interface Props {
  projectId: string;
  onPick: (templateViewId: string | null) => void;
  onCancel: () => void;
}

export function TemplatePicker({ projectId, onPick, onCancel }: Props) {
  const { templates, loading } = useTemplates(projectId);

  return (
    <div data-testid="template-picker" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{ background: '#fff', padding: 16, minWidth: 320, borderRadius: 4 }}>
        <h3 style={{ margin: '0 0 8px 0' }}>选择模板</h3>
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
