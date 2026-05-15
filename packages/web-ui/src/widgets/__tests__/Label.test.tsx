import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Label } from '../Label';

describe('Label', () => {
  it('1. text rendered', () => {
    const { getByText } = render(<Label text="Hello" width={100} height={30} />);
    expect(getByText('Hello')).toBeTruthy();
  });

  it('2. bold + fontSize + align center → style applied', () => {
    const { container } = render(
      <Label text="X" bold={true} fontSize={20} align="center" width={100} height={30} />
    );
    const span = container.querySelector('span') as HTMLElement;
    expect(span.style.fontWeight).toBe('bold');
    expect(span.style.fontSize).toBe('20px');
    const wrapper = span.parentElement as HTMLElement;
    expect(wrapper.style.justifyContent).toBe('center');
  });
});
