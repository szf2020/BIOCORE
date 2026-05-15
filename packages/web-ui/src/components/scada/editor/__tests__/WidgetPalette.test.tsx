import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetPalette } from '../WidgetPalette';

describe('WidgetPalette', () => {
  it('1. renders 8 cards with displayName', () => {
    render(<WidgetPalette />);
    const expected = ['罐体','阀门','泵','数字表','趋势图','文本','按钮','指示灯'];
    for (const name of expected) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('2. dragstart sets dataTransfer with widget type', () => {
    const { container } = render(<WidgetPalette />);
    const tank = container.querySelector('[data-widget-type="tank"]') as HTMLElement;
    expect(tank).toBeTruthy();
    const setData = vi.fn();
    fireEvent.dragStart(tank, { dataTransfer: { setData } });
    expect(setData).toHaveBeenCalledWith('application/x-scada-widget-type', 'tank');
  });
});
