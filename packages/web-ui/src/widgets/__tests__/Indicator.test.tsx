import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Indicator } from '../Indicator';

describe('Indicator', () => {
  it('1. value=37.5 precision=2 → "37.50"', () => {
    const { getByText } = render(<Indicator value={37.5} precision={2} width={100} height={50} />);
    expect(getByText('37.50')).toBeTruthy();
  });

  it('2. value=null → "—"', () => {
    const { getByText } = render(<Indicator value={null} width={100} height={50} />);
    expect(getByText('—')).toBeTruthy();
  });

  it('3. value="OK" (string) → renders as-is', () => {
    const { getByText } = render(<Indicator value="OK" width={100} height={50} />);
    expect(getByText('OK')).toBeTruthy();
  });
});
