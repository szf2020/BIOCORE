import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { UplotChart } from '../UplotChart';

const setData = vi.fn();
const setSize = vi.fn();
const destroy = vi.fn();

vi.mock('uplot', () => {
  const ctor = vi.fn().mockImplementation(() => ({ setData, setSize, destroy }));
  return { default: ctor };
});

beforeEach(() => {
  setData.mockClear();
  setSize.mockClear();
  destroy.mockClear();
});

describe('UplotChart', () => {
  it('returns null when width<=0', () => {
    const { container } = render(
      <UplotChart series={[{ x: [0], y: [0] }]} width={0} height={100} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when height<=0', () => {
    const { container } = render(
      <UplotChart series={[{ x: [0], y: [0] }]} width={100} height={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('mounts uplot with width and height', async () => {
    const uplotMod = await import('uplot');
    const uplotCtor = uplotMod.default as unknown as { mock: { calls: any[][] } };
    render(
      <UplotChart series={[{ x: [0, 1, 2], y: [1, 2, 3] }]} width={400} height={200} />,
    );
    const lastCall = uplotCtor.mock.calls[uplotCtor.mock.calls.length - 1]!;
    expect(lastCall[0].width).toBe(400);
    expect(lastCall[0].height).toBe(200);
  });

  it('setData called on series change', () => {
    const { rerender } = render(
      <UplotChart series={[{ x: [0, 1], y: [1, 2] }]} width={400} height={200} />,
    );
    rerender(
      <UplotChart series={[{ x: [0, 1, 2], y: [3, 4, 5] }]} width={400} height={200} />,
    );
    expect(setData).toHaveBeenCalled();
  });

  it('destroy called on unmount', () => {
    const { unmount } = render(
      <UplotChart series={[{ x: [0], y: [0] }]} width={400} height={200} />,
    );
    unmount();
    expect(destroy).toHaveBeenCalled();
  });

  it('empty series array does not throw', () => {
    expect(() =>
      render(<UplotChart series={[]} width={400} height={200} />),
    ).not.toThrow();
  });
});
