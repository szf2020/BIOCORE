import React from 'react';
import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { ScadaCanvas } from '../ScadaCanvas';
import type { SvgViewJson } from '@/widgets/svg/types';

const postMock = vi.fn();
vi.mock('@/hooks/usePostWriteIntent', () => ({
  usePostWriteIntent: () => ({ post: postMock }),
}));

beforeAll(() => { ensureBuiltinSvgWidgetsRegistered(); });
beforeEach(() => { postMock.mockReset(); });

function makeView(): SvgViewJson {
  return {
    width: 100, height: 100,
    items: [
      { id: 'w1', type: 'svg-rect', x: 0, y: 0, w: 50, h: 50, writeIntent: { tag: 't1', value: 1 } } as any,
    ],
  };
}

describe('ScadaCanvas write intent integration', () => {
  it('click on widget with writeIntent opens WriteIntentDialog', async () => {
    render(<ScadaCanvas view={makeView()} reactorId="F01" viewId="v-demo" />);
    const target = document.querySelector('[data-write-intent="true"]')!;
    await act(async () => { fireEvent.click(target); });
    // Two dialogs share data-testid="write-intent-dialog" (legacy + new); new one renders tag content via data-testid="write-intent-tag"
    expect(screen.getByTestId('write-intent-tag').textContent).toContain('t1');
  });

  it('dialog onClose hides the new dialog', async () => {
    render(<ScadaCanvas view={makeView()} reactorId="F01" viewId="v-demo" />);
    const target = document.querySelector('[data-write-intent="true"]')!;
    await act(async () => { fireEvent.click(target); });
    expect(screen.getByTestId('write-intent-tag')).toBeTruthy();
    // Click 取消 button in the new dialog
    await act(async () => { fireEvent.click(screen.getByText('取消')); });
    expect(screen.queryByTestId('write-intent-tag')).toBeNull();
  });
});
