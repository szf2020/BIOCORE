import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../PropertyEditor', () => ({
  PropertyEditor: ({ schema }: any) => <div data-testid="prop-editor" data-keys={Object.keys(schema).join(',')} />,
}));
vi.mock('../BindingsEditor', () => ({
  BindingsEditor: ({ bindings }: any) => <div data-testid="bind-editor" data-count={bindings.length} />,
}));

import { PropertyPanel } from '../PropertyPanel';

describe('PropertyPanel', () => {
  it('1. selectedId null → "未选中" placeholder', () => {
    render(<PropertyPanel selected={null} dispatch={vi.fn()} />);
    expect(screen.getByText(/未选中/)).toBeTruthy();
  });

  it('2. selected widget → displayName header + PropertyEditor + BindingsEditor', () => {
    const widget = { id: 't1', type: 'tank', x: 0, y: 0, w: 80, h: 200, props: { color: '#000' }, bindings: [{ tag: 't', prop: 'fillPct' }] } as any;
    render(<PropertyPanel selected={widget} dispatch={vi.fn()} />);
    expect(screen.getByText('罐体')).toBeTruthy();
    expect(screen.getByTestId('prop-editor')).toBeTruthy();
    expect(screen.getByTestId('bind-editor').getAttribute('data-count')).toBe('1');
  });
});
