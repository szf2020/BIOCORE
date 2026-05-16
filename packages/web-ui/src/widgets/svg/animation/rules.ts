// packages/web-ui/src/widgets/svg/animation/rules.ts
import type { AnimationRule } from './types';

export function evaluateAnimationRule(rule: AnimationRule, tagValue: unknown): unknown {
  switch (rule.kind) {
    case 'discreteMap': {
      const key = String(tagValue);
      if (Object.prototype.hasOwnProperty.call(rule.map, key)) {
        return rule.map[key];
      }
      return rule.default;
    }
    case 'thresholdRanges': {
      if (typeof tagValue !== 'number') return rule.default;
      if (!Number.isFinite(tagValue)) return rule.default;
      const last = rule.ranges.length - 1;
      for (let i = 0; i < rule.ranges.length; i++) {
        const r = rule.ranges[i];
        const inRange = i === last ? tagValue >= r.min && tagValue <= r.max : tagValue >= r.min && tagValue < r.max;
        if (inRange) return r.value;
      }
      return rule.default;
    }
    case 'linearScale': {
      const n = typeof tagValue === 'number' ? tagValue : Number(tagValue);
      if (!Number.isFinite(n)) return rule.outMin;
      const span = rule.inMax - rule.inMin;
      if (span === 0) return rule.outMin;
      const ratio = (n - rule.inMin) / span;
      const out = rule.outMin + ratio * (rule.outMax - rule.outMin);
      if (rule.clamp) {
        const lo = Math.min(rule.outMin, rule.outMax);
        const hi = Math.max(rule.outMin, rule.outMax);
        return Math.max(lo, Math.min(hi, out));
      }
      return out;
    }
  }
}
