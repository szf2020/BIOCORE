// SP-FX-41: TemplateGallery TDD RED-first tests
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TemplateGallery } from '../TemplateGallery';
import type { BuiltinTemplate } from '@/scada-engine/templates';

// vi.mock hoisted — cannot reference top-level const; use inline literals
vi.mock('@/scada-engine/templates', () => ({
  BUILTIN_TEMPLATES: [
    {
      id: 'builtin-cstr',
      name: 'CSTR 连续搅拌反应器',
      description: '典型 CSTR 模板',
      widgetCount: 8,
      view: {
        id: 'builtin-cstr', name: 'CSTR', type: 'svg',
        svgcontent: '<svg></svg>', width: 900, height: 680,
        items: {}, variables: {}, schemaVersion: 1,
      },
    },
    {
      id: 'builtin-pfr',
      name: 'PFR 活塞流反应器',
      description: 'PFR 模板',
      widgetCount: 7,
      view: {
        id: 'builtin-pfr', name: 'PFR', type: 'svg',
        svgcontent: '<svg></svg>', width: 900, height: 600,
        items: {}, variables: {}, schemaVersion: 1,
      },
    },
  ] as BuiltinTemplate[],
}));

const MOCK_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-cstr',
    name: 'CSTR 连续搅拌反应器',
    description: '典型 CSTR 模板',
    widgetCount: 8,
    view: {
      id: 'builtin-cstr', name: 'CSTR', type: 'svg',
      svgcontent: '<svg></svg>', width: 900, height: 680,
      items: {}, variables: {}, schemaVersion: 1,
    },
  },
  {
    id: 'builtin-pfr',
    name: 'PFR 活塞流反应器',
    description: 'PFR 模板',
    widgetCount: 7,
    view: {
      id: 'builtin-pfr', name: 'PFR', type: 'svg',
      svgcontent: '<svg></svg>', width: 900, height: 600,
      items: {}, variables: {}, schemaVersion: 1,
    },
  },
];

describe('TemplateGallery', () => {
  it('渲染所有 template card 和空白按钮', () => {
    render(
      <TemplateGallery
        open={true}
        onUseTemplate={vi.fn()}
        onUseBlank={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('CSTR 连续搅拌反应器')).toBeTruthy();
    expect(screen.getByText('PFR 活塞流反应器')).toBeTruthy();
    expect(screen.getByTestId('gallery-blank-btn')).toBeTruthy();
  });

  it('点击模板卡片 "使用此模板" 调用 onUseTemplate 含正确 template', async () => {
    const onUseTemplate = vi.fn();
    render(
      <TemplateGallery
        open={true}
        onUseTemplate={onUseTemplate}
        onUseBlank={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const btns = screen.getAllByTestId('gallery-use-btn');
    await act(async () => { fireEvent.click(btns[0]); });
    expect(onUseTemplate).toHaveBeenCalledWith(MOCK_TEMPLATES[0]);
  });

  it('点击空白按钮调用 onUseBlank', async () => {
    const onUseBlank = vi.fn();
    render(
      <TemplateGallery
        open={true}
        onUseTemplate={vi.fn()}
        onUseBlank={onUseBlank}
        onClose={vi.fn()}
      />
    );
    await act(async () => { fireEvent.click(screen.getByTestId('gallery-blank-btn')); });
    expect(onUseBlank).toHaveBeenCalled();
  });

  it('点击关闭按钮调用 onClose', async () => {
    const onClose = vi.fn();
    render(
      <TemplateGallery
        open={true}
        onUseTemplate={vi.fn()}
        onUseBlank={vi.fn()}
        onClose={onClose}
      />
    );
    await act(async () => { fireEvent.click(screen.getByTestId('gallery-close-btn')); });
    expect(onClose).toHaveBeenCalled();
  });

  it('open=false 时 modal 不渲染', () => {
    render(
      <TemplateGallery
        open={false}
        onUseTemplate={vi.fn()}
        onUseBlank={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId('template-gallery')).toBeNull();
  });

  it('各 card 显示 widgetCount badge', () => {
    render(
      <TemplateGallery
        open={true}
        onUseTemplate={vi.fn()}
        onUseBlank={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const badges = screen.getAllByTestId('gallery-widget-count');
    expect(badges[0].textContent).toContain('8');
    expect(badges[1].textContent).toContain('7');
  });
});
