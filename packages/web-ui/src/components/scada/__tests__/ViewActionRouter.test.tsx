import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';

vi.mock('../WriteIntentDialog', () => ({
  WriteIntentDialog: ({ open, pending, onClose }: any) =>
    open ? (
      <div data-testid="dialog" data-widget-id={pending?.widgetId} onClick={onClose}>
        dialog open
      </div>
    ) : null,
}));

import { ViewActionRouter } from '../ViewActionRouter';

describe('ViewActionRouter', () => {
  it('1. document widget-action event → dialog opens with widgetId', () => {
    render(
      <ViewActionRouter viewId="v1">
        <div data-testid="child" />
      </ViewActionRouter>
    );
    expect(screen.queryByTestId('dialog')).toBeNull();

    act(() => {
      document.dispatchEvent(
        new CustomEvent('widget-action', {
          detail: { widgetId: 'b1', action: 'open_suggest_dialog', payload: { tag: 'F01.SP' } },
        })
      );
    });

    const dlg = screen.getByTestId('dialog');
    expect(dlg).toBeTruthy();
    expect(dlg.getAttribute('data-widget-id')).toBe('b1');
  });

  it('2. unmount removes document listener (subsequent dispatch is ignored)', () => {
    const { unmount } = render(
      <ViewActionRouter viewId="v1">
        <div />
      </ViewActionRouter>
    );
    unmount();

    expect(() => {
      document.dispatchEvent(
        new CustomEvent('widget-action', { detail: { widgetId: 'b2', action: 'x' } })
      );
    }).not.toThrow();
    expect(document.querySelector('[data-testid="dialog"]')).toBeNull();
  });
});
