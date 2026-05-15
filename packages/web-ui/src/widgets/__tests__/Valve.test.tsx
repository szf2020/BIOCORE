import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Valve } from '../Valve';

describe('Valve', () => {
  it('1. open=false → fill uses colorClosed', () => {
    const { container } = render(
      <Valve open={false} colorOpen="#22c55e" colorClosed="#9ca3af" width={80} height={50} />
    );
    const path = container.querySelector('path[data-testid="valve-body"]');
    expect(path?.getAttribute('fill')).toBe('#9ca3af');
  });

  it('2. open=true → fill uses colorOpen', () => {
    const { container } = render(
      <Valve open={true} colorOpen="#22c55e" colorClosed="#9ca3af" width={80} height={50} />
    );
    const path = container.querySelector('path[data-testid="valve-body"]');
    expect(path?.getAttribute('fill')).toBe('#22c55e');
  });

  it('3. open=75 (number) → renders "75%"', () => {
    const { getByText } = render(<Valve open={75} width={80} height={50} />);
    expect(getByText('75%')).toBeTruthy();
  });
});
