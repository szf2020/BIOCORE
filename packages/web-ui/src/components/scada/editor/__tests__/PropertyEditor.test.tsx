import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PropertyEditor } from '../PropertyEditor';

describe('PropertyEditor', () => {
  it('1. number schema → input type=number, onChange emits number', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PropertyEditor
        schema={{ fillPct: { type: 'number', label: '液位 %', min: 0, max: 100 } }}
        values={{ fillPct: 50 }}
        onChange={onChange}
      />
    );
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('50');
    fireEvent.change(input, { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith({ fillPct: 75 });
  });

  it('2. string schema → input type=text, onChange emits string', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PropertyEditor
        schema={{ label: { type: 'string', label: '标签' } }}
        values={{ label: 'A' }}
        onChange={onChange}
      />
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'AB' } });
    expect(onChange).toHaveBeenCalledWith({ label: 'AB' });
  });

  it('3. color schema → input type=color', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PropertyEditor
        schema={{ color: { type: 'color', label: '颜色' } }}
        values={{ color: '#3b82f6' }}
        onChange={onChange}
      />
    );
    const input = container.querySelector('input[type="color"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenCalledWith({ color: '#ff0000' });
  });

  it('4. select schema → dropdown with options, onChange emits selected value', () => {
    const onChange = vi.fn();
    const { container } = render(
      <PropertyEditor
        schema={{ align: { type: 'select', label: '对齐', options: [
          { value: 'left', label: '左' },
          { value: 'center', label: '中' },
          { value: 'right', label: '右' },
        ]}}}
        values={{ align: 'left' }}
        onChange={onChange}
      />
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    fireEvent.change(select, { target: { value: 'center' } });
    expect(onChange).toHaveBeenCalledWith({ align: 'center' });
  });
});
