import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RuntimeShell } from '../RuntimeShell';

vi.mock('../RuntimeCanvas', () => ({
  RuntimeCanvas: ({ viewId }: { viewId: string }) => (
    <div data-testid={`canvas-${viewId}`} />
  ),
}));

vi.mock('@/components/scada/runtime/SuggestionsBar', () => ({
  SuggestionsBar: ({ viewId, showSuggestions }: { viewId: string; showSuggestions?: boolean }) =>
    showSuggestions !== false ? <div data-testid={`suggestions-bar-${viewId}`} /> : null,
}));

describe('RuntimeShell', () => {
  it('renders RuntimeCanvas inside relative full-screen wrapper', () => {
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
    expect(wrapper.className).toContain('relative');
  });

  it('renders SuggestionsBar by default', () => {
    const view = { id: 'v2', name: 'T', svgcontent: '<svg/>', width: 800, height: 600, items: {} } as any;
    const { getByTestId } = render(
      <RuntimeShell view={view} viewId="v2" reactorId="F01" />,
    );
    expect(getByTestId('suggestions-bar-v2')).toBeDefined();
  });

  it('hides SuggestionsBar when showSuggestions=false', () => {
    const view = { id: 'v3', name: 'T', svgcontent: '<svg/>', width: 800, height: 600, items: {} } as any;
    const { queryByTestId } = render(
      <RuntimeShell view={view} viewId="v3" reactorId="F01" showSuggestions={false} />,
    );
    expect(queryByTestId('suggestions-bar-v3')).toBeNull();
  });
});
