import { describe, it, expect } from 'vitest';
import { applyAnimations } from '../apply';
import type { SvgAnimation } from '../types';

describe('applyAnimations', () => {
  it('returns identity for undefined animations', () => {
    const r = applyAnimations(undefined, [], true, 100, 100);
    expect(r.visible).toBe(true);
    expect(r.transform).toBe('');
    expect(r.opacity).toBeUndefined();
    expect(r.configOverrides).toEqual({});
  });

  it('visibility animation evaluating false hides widget', () => {
    const anim: SvgAnimation = {
      type: 'visibility',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '0': false, '1': true }, default: true },
    };
    const r = applyAnimations([anim], [0], true, 100, 100);
    expect(r.visible).toBe(false);
  });

  it('rotate animation appends rotate(deg, w/2, h/2) to transform', () => {
    const anim: SvgAnimation = {
      type: 'rotate',
      tag: 'F01.AI-0',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 360 },
    };
    const r = applyAnimations([anim], [50], true, 100, 80);
    expect(r.transform).toBe('rotate(180,50,40)');
  });

  it('scale animation appends scale(s)', () => {
    const anim: SvgAnimation = {
      type: 'scale',
      tag: 'F01.AI-0',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 1, outMax: 2 },
    };
    const r = applyAnimations([anim], [50], true, 100, 100);
    expect(r.transform).toBe('scale(1.5)');
  });

  it('translate animation with axis=x appends translate(dx,0)', () => {
    const anim: SvgAnimation = {
      type: 'translate',
      tag: 'F01.AI-0',
      axis: 'x',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 50 },
    };
    const r = applyAnimations([anim], [40], true, 100, 100);
    expect(r.transform).toBe('translate(20,0)');
  });

  it('translate animation with axis=y appends translate(0,dy)', () => {
    const anim: SvgAnimation = {
      type: 'translate',
      tag: 'F01.AI-0',
      axis: 'y',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 50 },
    };
    const r = applyAnimations([anim], [40], true, 100, 100);
    expect(r.transform).toBe('translate(0,20)');
  });

  it('opacity animation sets opacity (last-wins, clamped 0..1)', () => {
    const a1: SvgAnimation = {
      type: 'opacity',
      tag: 'F01.AI-0',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 1 },
    };
    const a2: SvgAnimation = {
      type: 'opacity',
      tag: 'F01.AI-1',
      rule: { kind: 'linearScale', inMin: 0, inMax: 100, outMin: 0, outMax: 2, clamp: true },
    };
    const r = applyAnimations([a1, a2], [50, 100], true, 100, 100);
    expect(r.opacity).toBe(1);
  });

  it('color animation injects into configOverrides.fillColor by default', () => {
    const anim: SvgAnimation = {
      type: 'color',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': '#0f0' }, default: '#000' },
    };
    const r = applyAnimations([anim], [1], true, 100, 100);
    expect(r.configOverrides).toEqual({ fillColor: '#0f0' });
  });

  it('color animation with configKey injects into that key', () => {
    const anim: SvgAnimation = {
      type: 'color',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': '#abc' }, default: '#000' },
      configKey: 'strokeColor',
    };
    const r = applyAnimations([anim], [1], true, 100, 100);
    expect(r.configOverrides).toEqual({ strokeColor: '#abc' });
  });

  it('blink animation hides widget when phase=false and rule yields true', () => {
    const anim: SvgAnimation = {
      type: 'blink',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': true }, default: false },
    };
    const visiblePhase = applyAnimations([anim], [1], true, 100, 100);
    expect(visiblePhase.visible).toBe(true);
    const hiddenPhase = applyAnimations([anim], [1], false, 100, 100);
    expect(hiddenPhase.visible).toBe(false);
    const notBlinking = applyAnimations([anim], [0], false, 100, 100);
    expect(notBlinking.visible).toBe(true);
  });

  it('text animation injects stringified value into configOverrides.label by default', () => {
    const anim: SvgAnimation = {
      type: 'text',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': 'RUNNING' }, default: 'STOPPED' },
    };
    const r = applyAnimations([anim], [1], true, 100, 100);
    expect(r.configOverrides).toEqual({ label: 'RUNNING' });
  });

  it('text animation with configKey injects into that key', () => {
    const anim: SvgAnimation = {
      type: 'text',
      tag: 'F01.AI-0',
      rule: { kind: 'discreteMap', map: { '1': 'OK' }, default: 'ERR' },
      configKey: 'placeholder',
    };
    const r = applyAnimations([anim], [1], true, 100, 100);
    expect(r.configOverrides).toEqual({ placeholder: 'OK' });
  });
});
