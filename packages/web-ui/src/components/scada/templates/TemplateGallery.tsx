'use client';
// SP-FX-41: 内置视图模板 Gallery modal
import React from 'react';
import { BUILTIN_TEMPLATES } from '@/scada-engine/templates';
import type { BuiltinTemplate } from '@/scada-engine/templates';

interface TemplateGalleryProps {
  open: boolean;
  onUseTemplate: (template: BuiltinTemplate) => void;
  onUseBlank: () => void;
  onClose: () => void;
}

export function TemplateGallery({ open, onUseTemplate, onUseBlank, onClose }: TemplateGalleryProps) {
  if (!open) return null;

  return (
    <div
      data-testid="template-gallery"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24,
        width: 640, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: 18 }}>选择模板</h2>
          <button
            data-testid="gallery-close-btn"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
            aria-label="关闭"
          >×</button>
        </div>

        {/* 空白选项 */}
        <div style={{ marginBottom: 16 }}>
          <button
            data-testid="gallery-blank-btn"
            onClick={onUseBlank}
            style={{
              width: '100%', padding: '10px 16px', textAlign: 'left',
              border: '2px dashed #d1d5db', borderRadius: 6, background: '#f9fafb',
              cursor: 'pointer', fontSize: 14, color: '#374151',
            }}
          >
            空白画面（从零开始）
          </button>
        </div>

        {/* 分隔 */}
        <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: 16, paddingTop: 16 }}>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>内置模板</span>
        </div>

        {/* Template cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {BUILTIN_TEMPLATES.map(tpl => (
            <div
              key={tpl.id}
              style={{
                border: '1px solid #e5e7eb', borderRadius: 6, padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              {/* 信息区 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{tpl.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{tpl.description}</div>
                <span
                  data-testid="gallery-widget-count"
                  style={{
                    display: 'inline-block', fontSize: 11, background: '#eff6ff',
                    color: '#2563eb', borderRadius: 99, padding: '1px 8px',
                  }}
                >{tpl.widgetCount} 个 widget</span>
              </div>

              {/* 使用按钮 */}
              <button
                data-testid="gallery-use-btn"
                onClick={() => onUseTemplate(tpl)}
                style={{
                  padding: '6px 14px', background: '#2563eb', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >使用此模板</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
