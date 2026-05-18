import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PropertyPanel } from '../PropertyPanel';
import type { WidgetPropertySchema } from '../property-schema';
import type { FuxaWidget } from '../../../models';

vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: (selector: (s: any) => any) =>
    selector({ reactorData: { reactor1: { processValues: {} }, reactor2: { processValues: {} } } }),
}));

const makeWidget = (overrides?: Partial<FuxaWidget>): FuxaWidget => ({
  id: 'w1', type: 'svg-ext-value', property: { variableId: '' },
  x: 10, y: 20, w: 80, h: 40, ...overrides,
});

const simpleSchema: WidgetPropertySchema = {
  entries: [
    { key: 'label', label: '标签', type: 'text', placeholder: '请输入' },
    { key: 'decimals', label: '小数位', type: 'number', min: 0, max: 6 },
    { key: 'color', label: '颜色', type: 'color' },
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'mode', label: '模式', type: 'select', options: [{ value: 'a', label: 'A' }] },
    { key: 'active', label: '激活', type: 'boolean' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
  ],
};

describe('PropertyPanel', () => {
  it('renders entries by type (text/number/color/tag-ref/select/boolean)', () => {
    const widget = makeWidget({ property: { variableId: '', label: '', decimals: 2, color: '#fff', active: false, mode: 'a' } as any });
    const { container } = render(<PropertyPanel widget={widget} schema={simpleSchema} onChange={vi.fn()} />);
    expect(container.querySelector('input[data-key="label"]')).not.toBeNull();
    expect(container.querySelector('input[type="number"][data-key="decimals"]')).not.toBeNull();
    expect(container.querySelector('input[type="color"][data-key="color"]')).not.toBeNull();
    expect(container.querySelector('select[data-key="variableId"]')).not.toBeNull();
    expect(container.querySelector('select[data-key="mode"]')).not.toBeNull();
    expect(container.querySelector('input[type="checkbox"][data-key="active"]')).not.toBeNull();
  });

  it('geometric entry change calls onChange with top-level patch (not nested in property)', () => {
    const onChange = vi.fn();
    const { container } = render(<PropertyPanel widget={makeWidget()} schema={simpleSchema} onChange={onChange} />);
    const xInput = container.querySelector('input[data-key="x"]') as HTMLInputElement;
    fireEvent.change(xInput, { target: { value: '99' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ x: 99 }));
    const call = onChange.mock.calls[0][0] as Record<string, unknown>;
    expect('property' in call).toBe(false);
  });

  it('tag-ref dropdown lists reactorId x PROCESS_VALUES_FIELDS options', () => {
    const { container } = render(<PropertyPanel widget={makeWidget()} schema={simpleSchema} onChange={vi.fn()} />);
    const tagSelect = container.querySelector('select[data-key="variableId"]') as HTMLSelectElement;
    const options = Array.from(tagSelect.options).map((o) => o.value);
    expect(options.some((o) => o.startsWith('reactor1.'))).toBe(true);
    expect(options.some((o) => o.startsWith('reactor2.'))).toBe(true);
  });

  it('custom section rendered when schema has renderCustomSection', () => {
    const schemaWithCustom: WidgetPropertySchema = {
      entries: [{ key: 'label', label: '标签', type: 'text' }],
      renderCustomSection: () => <div data-testid="custom-section">custom</div>,
    };
    const { getByTestId } = render(<PropertyPanel widget={makeWidget()} schema={schemaWithCustom} onChange={vi.fn()} />);
    expect(getByTestId('custom-section')).not.toBeNull();
  });
});
