import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Scheduler, validateCron } from '../Scheduler';

describe('Scheduler', () => {
  it('renders 5 cron fields from initial cron', () => {
    render(<Scheduler cron="0 12 * * 1" onChange={() => {}} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(5);
    expect((inputs[0] as HTMLInputElement).value).toBe('0');
    expect((inputs[1] as HTMLInputElement).value).toBe('12');
    expect((inputs[4] as HTMLInputElement).value).toBe('1');
  });

  it('editing a field fires onChange with new full cron', () => {
    const onChange = vi.fn();
    render(<Scheduler cron="0 12 * * *" onChange={onChange} />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[1], { target: { value: '15' } });
    expect(onChange).toHaveBeenLastCalledWith('0 15 * * *');
  });

  it('* wildcard accepted', () => {
    expect(validateCron('* * * * *')).toBeNull();
  });

  it('6-field cron rejected (only 5 supported)', () => {
    expect(validateCron('0 0 12 * * *')).not.toBeNull();
  });

  it('invalid cron shows red border on container', () => {
    render(<Scheduler cron="not a cron string" onChange={() => {}} />);
    const container = document.querySelector('[data-widget="scheduler"]') as HTMLElement;
    expect(container.className).toContain('border-red-500');
  });

  it('validateCron returns null for valid', () => {
    expect(validateCron('0 12 * * 1')).toBeNull();
  });
});
