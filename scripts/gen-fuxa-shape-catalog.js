// SP-FX-48.20: Regenerate FUXA shape catalog from upstream FUXA source.
//
// Usage:
//   node scripts/gen-fuxa-shape-catalog.js [FUXA_ROOT]
//   default FUXA_ROOT = /Volumes/SSD/projects/FUXA
//
// Output: packages/web-ui/src/scada-engine/editor/shapes/shape-catalog.ts

const fs = require('fs');
const path = require('path');

const FUXA_ROOT = process.argv[2] || '/Volumes/SSD/projects/FUXA';
const SRC_DIR = path.join(FUXA_ROOT, 'client/src/assets/lib/svgeditor/shapes');
const FILES = [
  'shapes.js',
  'proc-shapes.js',
  'proc-comp-shapes.js',
  'proc-general-shapes.js',
  'proc-pumps-shapes.js',
  'ape-shapes.js',
  'my-shapes.js',
];
const OUT_PATH = path.join(
  __dirname, '..',
  'packages/web-ui/src/scada-engine/editor/shapes/shape-catalog.ts',
);

const GROUP_MAP = {
  'editor.processeng': 'process',
  'editor.shape': 'basic',
  'editor.animated': 'animation',
  'Proc. Eng.': 'process',
  'Proc. Eng. Compressor': 'compressor',
  'Proc. Eng. Pumps': 'pumps',
};

function extractShapes(src) {
  const groupMatch = src.match(/var\s+shapesGroupName\s*=\s*['"]([^'"]+)['"]/);
  const group = groupMatch ? groupMatch[1] : '';
  const startIdx = src.indexOf('var shapes = [');
  if (startIdx < 0) return { group, shapes: [] };
  const begin = src.indexOf('[', startIdx);
  let depth = 0; let endIdx = -1;
  for (let i = begin; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx < 0) return { group, shapes: [] };
  const arrText = src.slice(begin, endIdx + 1);
  // eslint-disable-next-line no-eval
  const shapes = eval('(' + arrText + ')');
  return { group, shapes };
}

function computeBBox(content) {
  let maxX = 0; let maxY = 0;
  for (const c of content) {
    const a = c.attr || {};
    if (a.d) {
      const nums = String(a.d).match(/-?\d+(?:\.\d+)?/g) || [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        maxX = Math.max(maxX, parseFloat(nums[i]));
        maxY = Math.max(maxY, parseFloat(nums[i + 1]));
      }
    }
    if (a.cx !== undefined && a.r !== undefined) {
      maxX = Math.max(maxX, parseFloat(a.cx) + parseFloat(a.r));
      maxY = Math.max(maxY, parseFloat(a.cy || 0) + parseFloat(a.r));
    }
    if (a.x !== undefined && a.width !== undefined) {
      maxX = Math.max(maxX, parseFloat(a.x) + parseFloat(a.width));
    }
    if (a.y !== undefined && a.height !== undefined) {
      maxY = Math.max(maxY, parseFloat(a.y) + parseFloat(a.height));
    }
  }
  return { w: Math.max(20, Math.ceil(maxX)), h: Math.max(20, Math.ceil(maxY)) };
}

function main() {
  const all = [];
  for (const f of FILES) {
    const fp = path.join(SRC_DIR, f);
    if (!fs.existsSync(fp)) { console.warn('skip missing', f); continue; }
    const src = fs.readFileSync(fp, 'utf8');
    const { group, shapes } = extractShapes(src);
    for (const sh of shapes) all.push({ name: sh.name, group, content: sh.content || [] });
  }
  const seen = new Set();
  const dedup = [];
  for (const sh of all) {
    if (seen.has(sh.name)) continue;
    seen.add(sh.name);
    dedup.push(sh);
  }
  for (const sh of dedup) {
    sh.group = GROUP_MAP[sh.group] || 'process';
    sh.content = sh.content.map((c) => { const { id, ...rest } = c; return rest; });
  }
  const withBBox = dedup.map((sh) => ({ ...sh, bbox: computeBBox(sh.content) }));
  const ts = '// SP-FX-48.20: Auto-generated FUXA shape catalog (do not edit).\n'
    + '// Source: FUXA v1.x assets/lib/svgeditor/shapes/*.js (MIT licensed).\n'
    + '// Regenerate via scripts/gen-fuxa-shape-catalog.js.\n'
    + '// Shape count: ' + withBBox.length + '\n\n'
    + 'export type ShapeContentType = "path" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon";\n'
    + 'export type ShapeGroup = "basic" | "process" | "compressor" | "pumps" | "animation";\n'
    + 'export interface ShapeContent { type: ShapeContentType; attr: Record<string, string | number>; }\n'
    + 'export interface ShapeEntry { name: string; group: ShapeGroup; bbox: { w: number; h: number }; content: ShapeContent[]; }\n\n'
    + 'export const SHAPE_CATALOG: ShapeEntry[] = ' + JSON.stringify(withBBox, null, 2) + ';\n\n'
    + 'export const SHAPE_GROUP_LABELS: Record<ShapeGroup, string> = {\n'
    + '  basic: "基础",\n'
    + '  process: "工艺设备",\n'
    + '  compressor: "压缩机",\n'
    + '  pumps: "水泵",\n'
    + '  animation: "动画",\n'
    + '};\n';
  fs.writeFileSync(OUT_PATH, ts);
  console.log('Wrote', OUT_PATH, withBBox.length, 'shapes,', ts.length, 'bytes');
}

main();
