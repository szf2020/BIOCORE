import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SvgGauge } from '../SvgGauge';

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgGauge', () => {
  it('renders background arc and value arc', () => {
    const { container } = renderInSvg(<SvgGauge width={80} height={80} tagValue={50} />);
    expect(container.querySelectorAll('path').length).toBe(2);
  });

  it('clamps value above max', () => {
    const { container } = renderInSvg(<SvgGauge width={80} height={80} tagValue={150} config={{ max: 100 }} />);
    const paths = container.querySelectorAll('path');
    expect(paths[1].getAttribute('d')).toMatch(/^M\s/);
  });

  it('renders value text in center', () => {
    const { container } = renderInSvg(<SvgGauge width={80} height={80} tagValue={42} />);
    expect(container.querySelector('text')?.textContent).toBe('42');
  });
});
