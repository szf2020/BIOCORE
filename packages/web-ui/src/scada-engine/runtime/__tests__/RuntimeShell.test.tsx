import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RuntimeShell } from '../RuntimeShell';

vi.mock('../RuntimeCanvas', () => ({
  RuntimeCanvas: ({ viewId }: { viewId: string }) => (
    <div data-testid={`canvas-${viewId}`} />
  ),
}));

describe('RuntimeShell', () => {
  it('renders RuntimeCanvas inside full-screen wrapper', () => {
    const view = {
      id: 'v1', name: 'Test', svgcontent: '<svg/>',
      width: 800, height: 600, items: {},
    } as any;
    const { container, getByTestId } = render(
      <RuntimeShell view={view} viewId="v1" reactorId="F01" />,
    );
    expect(getByTestId('canvas-v1')).toBeDefined();
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('w-screen');
    expect(wrapper.className).toContain('h-screen');
  });
});
