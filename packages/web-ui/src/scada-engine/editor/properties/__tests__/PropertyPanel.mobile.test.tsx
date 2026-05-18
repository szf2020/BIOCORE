// SP-FX-25: PropertyPanel bottom-sheet mode tests
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/stores/realtime-store', () => ({
  useRealtimeStore: (selector: (s: any) => any) =>
    selector({ reactorData: {} }),
}));

import { PropertyPanel } from '../PropertyPanel';

describe('PropertyPanel bottom-sheet mode (SP-FX-25)', () => {
  it('mobileMode=false: 正常侧边模式 (w-[250px] class)', () => {
    const { container } = render(
      <PropertyPanel widget={null} schema={null} onChange={() => {}} mobileMode={false} />
    );
    const aside = container.querySelector('[data-panel="properties"]')!;
    expect(aside.className).toContain('w-[250px]');
  });

  it('mobileMode=true: bottom-sheet 定位 (data-testid="property-panel-bottom-sheet")', () => {
    const { getByTestId } = render(
      <PropertyPanel widget={null} schema={null} onChange={() => {}} mobileMode={true} />
    );
    expect(getByTestId('property-panel-bottom-sheet')).toBeTruthy();
  });

  it('mobileMode=true: bottom-sheet 含 fixed bottom-0 class', () => {
    const { getByTestId } = render(
      <PropertyPanel widget={null} schema={null} onChange={() => {}} mobileMode={true} />
    );
    const sheet = getByTestId('property-panel-bottom-sheet');
    expect(sheet.className).toContain('fixed');
    expect(sheet.className).toContain('bottom-0');
  });

  it('mobileMode=true: 含 drag handle 元素 (data-testid="bottom-sheet-handle")', () => {
    const { getByTestId } = render(
      <PropertyPanel widget={null} schema={null} onChange={() => {}} mobileMode={true} />
    );
    expect(getByTestId('bottom-sheet-handle')).toBeTruthy();
  });
});
