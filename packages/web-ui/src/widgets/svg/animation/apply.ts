// packages/web-ui/src/widgets/svg/animation/apply.ts
import type { ApplyResult, SvgAnimation } from './types';
import { evaluateAnimationRule } from './rules';

export function applyAnimations(
  animations: SvgAnimation[] | undefined,
  tagValues: unknown[],
  blinkPhase: boolean,
  w: number,
  h: number,
): ApplyResult {
  const result: ApplyResult = {
    visible: true,
    transform: '',
    configOverrides: {},
  };
  if (!animations || animations.length === 0) return result;

  const transformParts: string[] = [];

  for (let i = 0; i < animations.length; i++) {
    const anim = animations[i];
    const raw = evaluateAnimationRule(anim.rule, tagValues[i]);

    switch (anim.type) {
      case 'visibility': {
        if (raw === false) result.visible = false;
        break;
      }
      case 'blink': {
        if (raw === true && !blinkPhase) result.visible = false;
        break;
      }
      case 'rotate': {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          transformParts.push(`rotate(${raw},${w / 2},${h / 2})`);
        }
        break;
      }
      case 'scale': {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          transformParts.push(`scale(${raw})`);
        }
        break;
      }
      case 'translate': {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          if (anim.axis === 'y') transformParts.push(`translate(0,${raw})`);
          else transformParts.push(`translate(${raw},0)`);
        }
        break;
      }
      case 'opacity': {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          result.opacity = Math.max(0, Math.min(1, raw));
        }
        break;
      }
      case 'color': {
        if (typeof raw === 'string') {
          const key = anim.configKey ?? 'fillColor';
          result.configOverrides[key] = raw;
        }
        break;
      }
      case 'text': {
        if (raw !== undefined && raw !== null) {
          const key = anim.configKey ?? 'label';
          result.configOverrides[key] = String(raw);
        }
        break;
      }
    }
  }

  result.transform = transformParts.join(' ');
  return result;
}
