import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgWidgetInstance } from '../SvgWidgetInstance';
import { registerSvg, _resetSvgRegistryForTests } from '../../../widgets/svg/registry';
import type { SvgWidgetComponent } from '../../../widgets/svg/types';

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn(() => ({ value: undefined, stale: false })),
}));

import { useTag } from '@/hooks/useTag';
const useTagMock = useTag as unknown as ReturnType<typeof vi.fn>;

const Label: SvgWidgetComponent = ({ tagValue }) => (
  <text data-testid="lbl">{String(tagValue ?? '—')}</text>
);
const Boom: SvgWidgetComponent = () => {
  throw new Error('boom');
};
const Sibling: SvgWidgetComponent = () => <circle data-testid="sib" r={1} />;

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgWidgetInstance', () => {
  beforeEach(() => {
    _resetSvgRegistryForTests();
    registerSvg({ type: 'svg-label', label: 'Label', component: Label });
    registerSvg({ type: 'svg-boom', label: 'Boom', component: Boom });
    registerSvg({ type: 'svg-sib', label: 'Sib', component: Sibling });
    useTagMock.mockReset();
    useTagMock.mockReturnValue({ value: undefined, stale: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when instance.visible is false', () => {
    const { container } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-label', x: 10, y: 20, w: 30, h: 40, visible: false }}
        reactorId="F01"
      />,
    );
    expect(container.querySelector('g')).toBeNull();
  });

  it('wraps in <g> with translate(x,y)', () => {
    const { container } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-label', x: 10, y: 20, w: 30, h: 40 }}
        reactorId="F01"
      />,
    );
    expect(container.querySelector('g')?.getAttribute('transform')).toContain('translate(10,20)');
  });

  it('includes rotate(deg, w/2, h/2) when rotation present', () => {
    const { container } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-label', x: 0, y: 0, w: 60, h: 40, rotation: 90 }}
        reactorId="F01"
      />,
    );
    const t = container.querySelector('g')?.getAttribute('transform') ?? '';
    expect(t).toContain('rotate(90,30,20)');
  });

  it('dispatches via registry to the matching component and forwards bound tag value', () => {
    useTagMock.mockReturnValue({ value: 'hello', stale: false });
    const { getByTestId } = renderInSvg(
      <SvgWidgetInstance
        instance={{
          id: 'a',
          type: 'svg-label',
          x: 0,
          y: 0,
          w: 30,
          h: 20,
          bindings: { tag: 'F01.TEMP' },
        }}
        reactorId="F01"
      />,
    );
    expect(getByTestId('lbl').textContent).toBe('hello');
  });

  it('renders red placeholder + console.warn when type is unknown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-nope', x: 0, y: 0, w: 30, h: 20 }}
        reactorId="F01"
      />,
    );
    expect(container.querySelector('rect[fill="#fee"]')).not.toBeNull();
    expect(container.querySelector('text')?.textContent).toBe('?svg-nope');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('svg-nope'));
  });

  it('calls useTag with reactorId and bindings.tag when binding present', () => {
    useTagMock.mockReturnValue({ value: 42, stale: false });
    renderInSvg(
      <SvgWidgetInstance
        instance={{
          id: 'a',
          type: 'svg-label',
          x: 0, y: 0, w: 30, h: 20,
          bindings: { tag: 'F01.TEMP' },
        }}
        reactorId="F01"
      />,
    );
    expect(useTagMock).toHaveBeenCalledWith('F01', 'F01.TEMP');
  });

  it('calls useTag with empty tag and forwards tagValue=undefined when bindings missing', () => {
    const { getByTestId } = renderInSvg(
      <SvgWidgetInstance
        instance={{ id: 'a', type: 'svg-label', x: 0, y: 0, w: 30, h: 20 }}
        reactorId="F01"
      />,
    );
    expect(getByTestId('lbl').textContent).toBe('—');
    expect(useTagMock).toHaveBeenCalledWith('F01', '');
  });

  it('ErrorBoundary catches widget throw and does not crash siblings', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, getByTestId } = render(
      <svg>
        <SvgWidgetInstance
          instance={{ id: 'bad', type: 'svg-boom', x: 0, y: 0, w: 30, h: 20 }}
          reactorId="F01"
        />
        <SvgWidgetInstance
          instance={{ id: 'good', type: 'svg-sib', x: 0, y: 0, w: 30, h: 20 }}
          reactorId="F01"
        />
      </svg>,
    );
    expect(container.querySelector('rect[fill="#fee"]')).not.toBeNull();
    expect(getByTestId('sib')).not.toBeNull();
  });
});
