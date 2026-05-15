import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('basic math', () => {
    expect(1 + 1).toBe(2);
  });

  it('jsdom env exposes document', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div').tagName).toBe('DIV');
  });
});
