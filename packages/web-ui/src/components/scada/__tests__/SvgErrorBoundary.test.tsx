import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgErrorBoundary } from '../SvgErrorBoundary';

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('kaboom');
  return <circle r={5} />;
}

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgErrorBoundary', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders the fallback red rect when child throws and logs the widget id', () => {
    const { container } = renderInSvg(
      <SvgErrorBoundary widgetId="w-throws" w={50} h={30}>
        <Boom shouldThrow={true} />
      </SvgErrorBoundary>,
    );
    const rect = container.querySelector('rect[fill="#fee"]');
    expect(rect).not.toBeNull();
    const text = container.querySelector('text');
    expect(text?.textContent).toBe('error');
    expect(errorSpy).toHaveBeenCalled();
    const loggedMsg = String(errorSpy.mock.calls.flat().join(' '));
    expect(loggedMsg).toContain('w-throws');
  });

  it('passes children through when no error', () => {
    const { container } = renderInSvg(
      <SvgErrorBoundary widgetId="w-ok" w={50} h={30}>
        <Boom shouldThrow={false} />
      </SvgErrorBoundary>,
    );
    expect(container.querySelector('circle')).not.toBeNull();
    expect(container.querySelector('rect[fill="#fee"]')).toBeNull();
  });

  it('resets error state when remounted with a new key', () => {
    const { container, rerender } = renderInSvg(
      <SvgErrorBoundary key="a" widgetId="w" w={50} h={30}>
        <Boom shouldThrow={true} />
      </SvgErrorBoundary>,
    );
    expect(container.querySelector('rect[fill="#fee"]')).not.toBeNull();

    rerender(
      <svg>
        <SvgErrorBoundary key="b" widgetId="w" w={50} h={30}>
          <Boom shouldThrow={false} />
        </SvgErrorBoundary>
      </svg>,
    );
    expect(container.querySelector('rect[fill="#fee"]')).toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
  });
});
