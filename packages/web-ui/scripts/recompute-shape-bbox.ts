// SP-FX-FF.47: Recompute SHAPE_CATALOG.bbox via real-browser getBBox().
//
// FUXA-imported bboxes are often wrong (only cover part of the path content),
// causing palette previews to clip half of each shape. This script renders
// every shape's content[] elements into a temporary SVG, reads the actual
// rendered bbox via Chromium getBBox(), and rewrites the bbox field in-place
// in shape-catalog.ts.
//
// Run from packages/web-ui: pnpm tsx scripts/recompute-shape-bbox.ts

import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CATALOG_PATH = path.resolve(
  __dirname,
  '../src/scada-engine/editor/shapes/shape-catalog.ts',
);

interface Bbox { x: number; y: number; w: number; h: number }
interface ShapeEntry {
  name: string;
  group: string;
  content: Array<{ type: string; attr: Record<string, string | number> }>;
  bbox: Bbox;
}

function loadCatalog(): ShapeEntry[] {
  const src = fs.readFileSync(CATALOG_PATH, 'utf-8');
  // Locate "= [" after marker, then find the matching closing "];" at end of
  // the array. Naive bracket-balance fails because path "d" strings may contain
  // bracket chars, so we use the last "];" before EOF assuming top-level
  // array is the only such terminator.
  const marker = 'SHAPE_CATALOG: ShapeEntry[] = [';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('SHAPE_CATALOG marker not found');
  const arrStart = src.indexOf('[', start + marker.length - 1);
  const arrEnd = src.lastIndexOf('];');
  if (arrEnd < 0) throw new Error('SHAPE_CATALOG terminator not found');
  return JSON.parse(src.slice(arrStart, arrEnd + 1)) as ShapeEntry[];
}

function escapeAttr(v: string): string {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function shapeToSvg(entry: ShapeEntry): string {
  const children = entry.content.map((c) => {
    const attrs = Object.entries(c.attr)
      .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
      .join(' ');
    return `<${c.type} ${attrs}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" viewBox="-1000 -1000 2000 2000"><g id="t">${children}</g></svg>`;
}

async function main(): Promise<void> {
  const data = loadCatalog();
  console.log(`Loaded ${data.length} shapes`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const newBboxes = new Map<string, Bbox>();

  for (const shape of data) {
    const html = `<!DOCTYPE html><html><body>${shapeToSvg(shape)}</body></html>`;
    await page.setContent(html);
    try {
      const bb = await page.evaluate(() => {
        const g = document.querySelector('#t') as SVGGraphicsElement | null;
        if (!g) return null;
        const b = g.getBBox();
        return {
          x: Math.round(b.x * 100) / 100,
          y: Math.round(b.y * 100) / 100,
          w: Math.round(b.width * 100) / 100,
          h: Math.round(b.height * 100) / 100,
        };
      });
      if (bb && bb.w > 0 && bb.h > 0) {
        newBboxes.set(shape.name, bb);
      } else {
        console.warn(`${shape.name}: empty bbox, keeping original`);
      }
    } catch (e) {
      console.warn(`${shape.name}: error`, (e as Error).message);
    }
  }

  await browser.close();
  console.log(`Computed ${newBboxes.size} bboxes`);

  // Patch source file in place.
  let src = fs.readFileSync(CATALOG_PATH, 'utf-8');
  let patched = 0;
  for (const [name, bb] of newBboxes) {
    const nameEsc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `("name":\\s*"${nameEsc}"[\\s\\S]*?"bbox":\\s*\\{)\\s*"x":\\s*-?[\\d.]+,\\s*"y":\\s*-?[\\d.]+,\\s*"w":\\s*-?[\\d.]+,\\s*"h":\\s*-?[\\d.]+\\s*(\\})`,
    );
    const replacement = `$1\n      "x": ${bb.x},\n      "y": ${bb.y},\n      "w": ${bb.w},\n      "h": ${bb.h}\n    $2`;
    const before = src;
    src = src.replace(re, replacement);
    if (src !== before) patched++;
    else console.warn(`${name}: regex didn't match`);
  }
  fs.writeFileSync(CATALOG_PATH, src);
  console.log(`Patched ${patched} shape bboxes`);
}

main().catch((e) => { console.error(e); process.exit(1); });
