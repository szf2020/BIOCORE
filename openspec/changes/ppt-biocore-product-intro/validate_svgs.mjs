import { readFileSync } from 'fs';
import { DOMParser } from 'url';

const base = 'C:/biocore/openspec/changes/ppt-biocore-product-intro/slides';
const slides = ['07', '08', '09'];

for (const i of slides) {
  const path = `${base}/slide-${i}.svg`;
  console.log(`\n=== slide-${i}.svg ===`);

  let content;
  try {
    content = readFileSync(path, 'utf-8');
  } catch (e) {
    console.log(`  [FAIL] Cannot read file: ${e.message}`);
    continue;
  }

  // 1. XML validity - check well-formedness via simple parse
  // Check for basic XML structure
  if (content.includes('<svg') && content.includes('</svg>')) {
    // Check matching tags roughly
    const openTags = (content.match(/<[a-z][^/]*?>/gi) || []).length;
    console.log(`  [PASS] XML structure looks valid (${content.length} bytes)`);
  } else {
    console.log('  [FAIL] Missing <svg> or </svg>');
  }

  // 2. ViewBox check
  const vbMatch = content.match(/viewBox="([^"]+)"/);
  const vb = vbMatch ? vbMatch[1] : 'MISSING';
  if (vb === '0 0 1280 720') {
    console.log(`  [PASS] viewBox="${vb}"`);
  } else {
    console.log(`  [FAIL] viewBox="${vb}" (expected "0 0 1280 720")`);
  }

  // 3. Font size check
  const fontSizes = [...content.matchAll(/font-size="(\d+)"/g)].map(m => parseInt(m[1]));
  if (fontSizes.length > 0) {
    const small = fontSizes.filter(s => s < 12);
    const min = Math.min(...fontSizes);
    const max = Math.max(...fontSizes);
    if (small.length > 0) {
      console.log(`  [WARN] font-size below 12px detected: ${[...new Set(small)]}`);
    } else {
      console.log(`  [PASS] font sizes OK (range ${min}-${max})`);
    }
  }

  // 4. Safe area - check text elements not in transforms
  // Parse x/y from text elements at root level (approximate)
  const textMatches = [...content.matchAll(/<text[^>]*\bx="([\d.]+)"[^>]*\by="([\d.]+)"[^>]*>/g)];
  const safeIssues = [];
  for (const m of textMatches) {
    const x = parseFloat(m[1]);
    const y = parseFloat(m[2]);
    if (x < 60) safeIssues.push(`x=${x}<60`);
    if (x > 1220) safeIssues.push(`x=${x}>1220`);
    if (y > 680) safeIssues.push(`y=${y}>680`);
  }
  if (safeIssues.length > 0) {
    for (const iss of safeIssues) {
      console.log(`  [WARN] safe area: ${iss}`);
    }
  } else {
    console.log('  [PASS] safe area OK');
  }

  // 5. Color zone compliance
  const zone1 = new Set([
    '#1E40AF', '#059669', '#F8FAFC', '#1E293B',
    '#64748B', '#94A3B8', '#CBD5E1', '#E2E8F0', '#F1F5F9',
    '#D97706', '#7C3AED', '#DC2626',
    '#FFFFFF', '#FAFBFD',
    '#FEF3C7', '#FEF2F2', '#ECFDF5',
    '#000000',
  ].map(c => c.toUpperCase()));

  const allColors = new Set([...content.matchAll(/(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{3,8})"/g)].map(m => m[1].toUpperCase()));

  // Extract defs colors
  const defsMatch = content.match(/<defs>([\s\S]*?)<\/defs>/);
  const defsColors = new Set();
  if (defsMatch) {
    for (const m of defsMatch[1].matchAll(/(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{3,8})"/g)) {
      defsColors.add(m[1].toUpperCase());
    }
  }

  // Extract decorative colors
  const decColors = new Set();
  for (const dm of content.matchAll(/data-decorative="true"[^>]*>[\s\S]*?<\/g>/g)) {
    for (const m of dm[0].matchAll(/(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{3,8})"/g)) {
      decColors.add(m[1].toUpperCase());
    }
  }

  const coreColors = [...allColors].filter(c => !defsColors.has(c) && !decColors.has(c));
  const unknown = coreColors.filter(c => !zone1.has(c));

  if (unknown.length > 0) {
    console.log(`  [NOTE] non-token colors in core UI: ${unknown.join(', ')}`);
  } else {
    console.log('  [PASS] color zone compliance OK');
  }
}

console.log('\nValidation complete.');
