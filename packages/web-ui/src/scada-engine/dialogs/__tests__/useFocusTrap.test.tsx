import React, { useRef } from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useFocusTrap } from '../useFocusTrap';

function Harness({ isOpen }: { isOpen: boolean }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref, isOpen);
  return (
    <div ref={ref} data-testid="trap" tabIndex={-1}>
      <button data-testid="a">A</button>
      <button data-testid="b">B</button>
      <button data-testid="c">C</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses first focusable when isOpen toggles true', async () => {
    const { rerender, getByTestId } = render(<Harness isOpen={false} />);
    expect(document.activeElement?.tagName).not.toBe('BUTTON');
    rerender(<Harness isOpen={true} />);
    await act(async () => { await Promise.resolve(); });
    expect(document.activeElement).toBe(getByTestId('a'));
  });

  it('Tab from last focusable wraps to first', async () => {
    const { getByTestId } = render(<Harness isOpen={true} />);
    await act(async () => { await Promise.resolve(); });
    const c = getByTestId('c');
    c.focus();
    fireEvent.keyDown(c, { key: 'Tab' });
    expect(document.activeElement).toBe(getByTestId('a'));
  });

  it('Shift+Tab from first focusable wraps to last', async () => {
    const { getByTestId } = render(<Harness isOpen={true} />);
    await act(async () => { await Promise.resolve(); });
    const a = getByTestId('a');
    a.focus();
    fireEvent.keyDown(a, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByTestId('c'));
  });

  it('no-op when isOpen=false', () => {
    const { getByTestId } = render(<Harness isOpen={false} />);
    const c = getByTestId('c');
    c.focus();
    fireEvent.keyDown(c, { key: 'Tab' });
    expect(document.activeElement).toBe(c);
  });

  it('no-op when container has no focusables', () => {
    function Empty(): JSX.Element {
      const ref = useRef<HTMLDivElement | null>(null);
      useFocusTrap(ref, true);
      return <div ref={ref} data-testid="empty" />;
    }
    expect(() => render(<Empty />)).not.toThrow();
  });
});
