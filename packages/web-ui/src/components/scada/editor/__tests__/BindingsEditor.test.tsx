import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BindingsEditor } from '../BindingsEditor';

describe('BindingsEditor', () => {
  it('1. click 添加绑定 → onChange called with new binding appended', () => {
    const onChange = vi.fn();
    render(
      <BindingsEditor bindings={[]} bindableProps={['fillPct', 'max']} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: /添加绑定/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const result = onChange.mock.calls[0][0];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ prop: 'fillPct', tag: '' });
  });

  it('2. click 删除 → onChange with that row removed', () => {
    const onChange = vi.fn();
    render(
      <BindingsEditor
        bindings={[{ tag: 't1', prop: 'fillPct' }, { tag: 't2', prop: 'max' }]}
        bindableProps={['fillPct', 'max']}
        onChange={onChange}
      />
    );
    const deletes = screen.getAllByRole('button', { name: /删除/ });
    fireEvent.click(deletes[0]);
    expect(onChange).toHaveBeenCalledWith([{ tag: 't2', prop: 'max' }]);
  });

  it('3. type into transform textarea → onChange with new transform', () => {
    const onChange = vi.fn();
    const { container } = render(
      <BindingsEditor
        bindings={[{ tag: 'F01.AI-0', prop: 'fillPct' }]}
        bindableProps={['fillPct']}
        onChange={onChange}
      />
    );
    const ta = container.querySelector('textarea[name="transform"]') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'v * 2' } });
    expect(onChange).toHaveBeenCalledWith([
      { tag: 'F01.AI-0', prop: 'fillPct', transform: 'v * 2' },
    ]);
  });
});
