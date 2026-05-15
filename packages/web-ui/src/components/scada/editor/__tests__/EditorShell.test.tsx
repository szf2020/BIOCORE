import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../WidgetPalette', () => ({ WidgetPalette: () => <div data-testid="palette" /> }));
vi.mock('../EditorCanvas', () => ({ EditorCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../PropertyPanel', () => ({ PropertyPanel: () => <div data-testid="panel" /> }));
vi.mock('../SaveBar', () => ({ SaveBar: () => <div data-testid="savebar" /> }));

import { EditorShell } from '../EditorShell';

describe('EditorShell', () => {
  it('1. renders SaveBar + Palette + Canvas + PropertyPanel', () => {
    const view = { view_id: 'v1', project_id: 'p', name: 'V', reactor_id: null, width: 800, height: 480, background: '#fff', items: {}, updated_at: 'now' } as any;
    render(<EditorShell view={view} />);
    expect(screen.getByTestId('savebar')).toBeTruthy();
    expect(screen.getByTestId('palette')).toBeTruthy();
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(screen.getByTestId('panel')).toBeTruthy();
  });
});
