/**
 * SP-FX-33: dict-en consistency & quality tests
 *
 * Verifies that dict-en.json:
 * 1. Has exactly the same keys as dict-zh.json (no missing, no extra)
 * 2. Has no empty string values
 * 3. Preserves all {{var}} placeholders from zh counterpart
 * 4. Does not contain "Modified label" artifact
 * 5. Uses correct SCADA layer terminology ("Forward"/"Backward")
 */
import { describe, it, expect } from 'vitest';
import dictEn from '../dict-en.json';
import dictZh from '../dict-zh.json';

type Dict = Record<string, string>;

const en = dictEn as Dict;
const zh = dictZh as Dict;

/** Extract all {{varName}} placeholders from a string */
function extractPlaceholders(str: string): string[] {
  const matches = str.match(/\{\{[^}]+\}\}/g);
  return matches ?? [];
}

describe('dict-en consistency', () => {
  it('T1: dict-en has exactly the same keys as dict-zh (no missing, no extra)', () => {
    const enKeys = new Set(Object.keys(en));
    const zhKeys = new Set(Object.keys(zh));

    const missingFromEn = [...zhKeys].filter((k) => !enKeys.has(k));
    const extraInEn = [...enKeys].filter((k) => !zhKeys.has(k));

    expect(missingFromEn, `Keys in zh but missing from en: ${missingFromEn.join(', ')}`).toHaveLength(0);
    expect(extraInEn, `Keys in en but not in zh: ${extraInEn.join(', ')}`).toHaveLength(0);
  });

  it('T2: every value in dict-en is a non-empty string', () => {
    const emptyKeys = Object.entries(en)
      .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
      .map(([k]) => k);

    expect(emptyKeys, `Keys with empty values: ${emptyKeys.join(', ')}`).toHaveLength(0);
  });

  it('T3: placeholder parity — {{var}} tokens match between zh and en for each key', () => {
    const mismatches: string[] = [];

    for (const key of Object.keys(zh)) {
      if (!(key in en)) continue; // covered by T1

      const zhPlaceholders = extractPlaceholders(zh[key]).sort();
      const enPlaceholders = extractPlaceholders(en[key]).sort();

      if (JSON.stringify(zhPlaceholders) !== JSON.stringify(enPlaceholders)) {
        mismatches.push(
          `${key}: zh=[${zhPlaceholders.join(',')}] en=[${enPlaceholders.join(',')}]`
        );
      }
    }

    expect(mismatches, `Placeholder mismatches:\n${mismatches.join('\n')}`).toHaveLength(0);
  });

  it('T4: save-bar.modified must be "Modified" (not contain artifact word "label")', () => {
    const value = en['save-bar.modified'] ?? '';
    expect(value.toLowerCase()).not.toContain('label');
    expect(value).toBe('Modified');
  });

  it('T5: toolbar.layer-up/layer-down use SCADA layer terminology (Forward/Backward)', () => {
    const layerUp = en['toolbar.layer-up'] ?? '';
    const layerDown = en['toolbar.layer-down'] ?? '';

    expect(layerUp).toBe('Bring Forward');
    expect(layerDown).toBe('Send Backward');
  });
});
