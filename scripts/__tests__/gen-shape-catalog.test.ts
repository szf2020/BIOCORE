import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { genCatalog, toLabel } from '../gen-shape-catalog';

let tmpRoot: string;
let srcDir: string;
let outFile: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'gsc-'));
  srcDir = join(tmpRoot, 'src');
  outFile = join(tmpRoot, 'out.ts');
  mkdirSync(srcDir);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('toLabel', () => {
  it('converts kebab-case to Title Case', () => {
    expect(toLabel('agitator-disc')).toBe('Agitator Disc');
    expect(toLabel('tank1')).toBe('Tank1');
    expect(toLabel('a-b-c')).toBe('A B C');
  });
});

describe('genCatalog', () => {
  it('reads SVG names and writes SHAPE_CATALOG with N entries sorted', () => {
    writeFileSync(join(srcDir, 'b.svg'), '<svg/>');
    writeFileSync(join(srcDir, 'a.svg'), '<svg/>');
    writeFileSync(join(srcDir, 'readme.md'), 'ignore'); // non-svg ignored
    const { count } = genCatalog(srcDir, outFile);
    expect(count).toBe(2);
    const body = readFileSync(outFile, 'utf8');
    expect(body).toContain("export const SHAPE_CATALOG");
    expect(body).toContain("{ id: \"a\", label: \"A\", src: '/scada-shapes/a.svg' }");
    expect(body).toContain("{ id: \"b\", label: \"B\", src: '/scada-shapes/b.svg' }");
    expect(body.indexOf('a.svg')).toBeLessThan(body.indexOf('b.svg'));
  });

  it('empty dir produces empty array body', () => {
    const { count } = genCatalog(srcDir, outFile);
    expect(count).toBe(0);
    const body = readFileSync(outFile, 'utf8');
    expect(body).toContain('SHAPE_CATALOG: ReadonlyArray<PaletteShape> = [');
    expect(body).toContain('] as const;');
  });

  it('filename with quote/special char is JSON-escaped', () => {
    writeFileSync(join(srcDir, "a\"b.svg"), '<svg/>');
    const { count } = genCatalog(srcDir, outFile);
    expect(count).toBe(1);
    const body = readFileSync(outFile, 'utf8');
    expect(body).toContain('a\\"b');
  });
});
