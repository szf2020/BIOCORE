import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeDiagnosticDump, listDiagnosticDumps, readDiagnosticDump } from '../diagnostic-dump';

const DIR = path.join(os.tmpdir(), `biocore-test-crashes-${process.pid}`);

beforeEach(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(DIR, { recursive: true, force: true });
});

describe('diagnostic-dump', () => {
  it('writes a JSON dump with required fields', async () => {
    const file = await writeDiagnosticDump(new Error('boom'), 'uncaughtException', { dir: DIR });
    expect(fs.existsSync(file)).toBe(true);
    const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(j.type).toBe('uncaughtException');
    expect(j.error.message).toBe('boom');
    expect(j.error.stack).toBeTruthy();
    expect(j.process.pid).toBe(process.pid);
    expect(j.memory.rss).toBeGreaterThan(0);
    expect(j.handles.active).toBeGreaterThanOrEqual(0);
  });

  it('handles non-Error thrown values', async () => {
    const file = await writeDiagnosticDump('plain string error', 'uncaughtException', { dir: DIR });
    const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(j.error.message).toBe('plain string error');
  });

  it('preserves extra context', async () => {
    const file = await writeDiagnosticDump(new Error('x'), 'oom_threshold', { dir: DIR, extra: { batchId: 'B-1', plc: 'connected' } });
    const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
    expect(j.extra).toEqual({ batchId: 'B-1', plc: 'connected' });
  });

  it('lists dumps sorted by ts', async () => {
    await writeDiagnosticDump(new Error('a'), 'unhandledRejection', { dir: DIR });
    await new Promise(r => setTimeout(r, 10));
    await writeDiagnosticDump(new Error('b'), 'uncaughtException', { dir: DIR });
    const list = listDiagnosticDumps(DIR);
    expect(list.length).toBe(2);
    expect(list[0].ts <= list[1].ts).toBe(true);
  });

  it('reads a dump back from disk', async () => {
    const file = await writeDiagnosticDump(new Error('readback'), 'uncaughtException', { dir: DIR });
    const dump = readDiagnosticDump(file);
    expect(dump.error.message).toBe('readback');
  });

  it('keeps only last N dumps when keepLast is set', async () => {
    for (let i = 0; i < 5; i++) {
      await writeDiagnosticDump(new Error(`e${i}`), 'uncaughtException', { dir: DIR, keepLast: 3 });
      await new Promise(r => setTimeout(r, 5));
    }
    expect(listDiagnosticDumps(DIR).length).toBe(3);
  });

  it('listDiagnosticDumps returns [] for non-existent dir', () => {
    const list = listDiagnosticDumps(path.join(os.tmpdir(), 'does-not-exist-bk1'));
    expect(list).toEqual([]);
  });
});
