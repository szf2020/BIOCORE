import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewPropertyDialog } from '../ViewPropertyDialog';
import type { FuxaView } from '../../models/hmi';

function baseView(): FuxaView {
  return {
    id: 'v1', name: 'My View', type: 'svg', svgcontent: '<svg/>',
    width: 1024, height: 768, items: {}, schemaVersion: 1,
  } as FuxaView;
}

describe('ViewPropertyDialog (SP-FX-2)', () => {
  it('renders existing view values as initial form state', () => {
    render(<ViewPropertyDialog open view={baseView()} onSave={() => {}} onCancel={() => {}} />);
    expect((screen.getByLabelText(/名称/) as HTMLInputElement).value).toBe('My View');
    expect((screen.getByLabelText(/宽度/) as HTMLInputElement).value).toBe('1024');
    expect((screen.getByLabelText(/高度/) as HTMLInputElement).value).toBe('768');
  });

  it('Save disabled when name empty', () => {
    render(<ViewPropertyDialog open view={baseView()} onSave={() => {}} onCancel={() => {}} />);
    const name = screen.getByLabelText(/名称/) as HTMLInputElement;
    fireEvent.change(name, { target: { value: '' } });
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Save disabled when width is 0 or negative', () => {
    render(<ViewPropertyDialog open view={baseView()} onSave={() => {}} onCancel={() => {}} />);
    const width = screen.getByLabelText(/宽度/) as HTMLInputElement;
    fireEvent.change(width, { target: { value: '0' } });
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(width, { target: { value: '-10' } });
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Save enabled when all fields valid', () => {
    render(<ViewPropertyDialog open view={baseView()} onSave={() => {}} onCancel={() => {}} />);
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('clicking Save invokes onSave with the patch', () => {
    const onSave = vi.fn();
    render(<ViewPropertyDialog open view={baseView()} onSave={onSave} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText(/名称/), { target: { value: 'Renamed' } });
    fireEvent.change(screen.getByLabelText(/宽度/), { target: { value: '1280' } });
    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch).toMatchObject({ name: 'Renamed', width: 1280, height: 768 });
  });

  it('clicking Cancel triggers onCancel and not onSave', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<ViewPropertyDialog open view={baseView()} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /取消/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
