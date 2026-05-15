import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('1. click dispatches widget-action CustomEvent with widgetId/action/payload', () => {
    const handler = vi.fn();
    document.addEventListener('widget-action', handler);
    const { getByRole } = render(
      <Button widgetId="w1" text="Go" action="open_dialog" payload={{ x: 1 }} width={80} height={30} />
    );
    fireEvent.click(getByRole('button'));
    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({ widgetId: 'w1', action: 'open_dialog', payload: { x: 1 } });
    document.removeEventListener('widget-action', handler);
  });

  it('2. text rendered', () => {
    const { getByText } = render(<Button widgetId="w1" text="Click me" width={80} height={30} />);
    expect(getByText('Click me')).toBeTruthy();
  });

  it('3. color → inline style backgroundColor', () => {
    const { getByRole } = render(<Button widgetId="w1" color="#ff0000" width={80} height={30} />);
    const btn = getByRole('button') as HTMLButtonElement;
    expect(btn.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });
});
