import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../ring-buffer';

describe('RingBuffer', () => {
  it('keeps last N items when capacity exceeded', () => {
    const r = new RingBuffer<number>(3);
    r.push(1);
    r.push(2);
    r.push(3);
    r.push(4);
    expect(r.toArray()).toEqual([2, 3, 4]);
  });

  it('reports correct size during fill and after eviction', () => {
    const r = new RingBuffer<number>(5);
    expect(r.size()).toBe(0);
    r.push(1);
    r.push(2);
    expect(r.size()).toBe(2);
    r.push(3);
    r.push(4);
    r.push(5);
    r.push(6); // evicts 1
    expect(r.size()).toBe(5);
  });

  it('handles empty buffer cleanly', () => {
    const r = new RingBuffer<number>(3);
    expect(r.toArray()).toEqual([]);
    expect(r.size()).toBe(0);
  });

  it('clear() resets size to 0', () => {
    const r = new RingBuffer<number>(3);
    r.push(1);
    r.push(2);
    r.clear();
    expect(r.size()).toBe(0);
    expect(r.toArray()).toEqual([]);
  });

  it('toArray() returns a copy, not the internal array', () => {
    const r = new RingBuffer<number>(3);
    r.push(1);
    r.push(2);
    const out = r.toArray();
    out.push(99);
    expect(r.toArray()).toEqual([1, 2]);  // unchanged
  });
});
