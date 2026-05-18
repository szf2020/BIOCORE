// ============================================================
// alert-dispatcher.test.ts — SP-FX-42 TDD RED-first
// ============================================================
import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  sendTestMessage,
  AlertDispatcher,
} from '../services/alert-dispatcher';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function makeDb() {
  const db = new Database(':memory:');
  const sql037 = readFileSync(join(__dirname, '../../migrations/037-alert-tables.sql'), 'utf8');
  db.exec(sql037);
  return db;
}

// ─── evaluateCondition ────────────────────────────────────────

describe('evaluateCondition', () => {
  it('"true" → true', () => {
    expect(evaluateCondition('true', {})).toBe(true);
  });

  it('"false" → false', () => {
    expect(evaluateCondition('false', {})).toBe(false);
  });

  it('value > 80 with value=90 → true', () => {
    expect(evaluateCondition('value > 80', { value: 90 })).toBe(true);
  });

  it('value > 80 with value=70 → false', () => {
    expect(evaluateCondition('value > 80', { value: 70 })).toBe(false);
  });

  it('语法错误 → false (不抛)', () => {
    expect(evaluateCondition('!!!invalid@@', {})).toBe(false);
  });
});

// ─── sendTestMessage ──────────────────────────────────────────

describe('sendTestMessage', () => {
  it('email stub → true', async () => {
    const ok = await sendTestMessage({ type: 'email', config: { recipients: ['ops@example.com'] } });
    expect(ok).toBe(true);
  });

  it('webhook 失败 URL → false', async () => {
    const ok = await sendTestMessage({ type: 'webhook', config: { url: 'http://127.0.0.1:1/hook' } });
    expect(ok).toBe(false);
  });

  it('slack 失败 URL → false', async () => {
    const ok = await sendTestMessage({ type: 'slack', config: { url: 'http://127.0.0.1:1/slack' } });
    expect(ok).toBe(false);
  });
});

// ─── AlertDispatcher.fire ────────────────────────────────────

describe('AlertDispatcher.fire', () => {
  it('条件不满足 → 不写 alert_history', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO alert_channels (type, name, config) VALUES ('email','E','{}') `).run();
    const chId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    db.prepare(`INSERT INTO alert_rules (name, trigger_type, condition_expr, channel_id, enabled) VALUES ('R','threshold','false',?,1) `).run(chId);
    const dispatcher = new AlertDispatcher(db);
    await dispatcher.fire('threshold', { value: 50 });
    const cnt = (db.prepare('SELECT count(*) as c FROM alert_history').get() as any).c;
    expect(cnt).toBe(0);
  });

  it('条件满足 + email stub → 写 alert_history delivered=1', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO alert_channels (type, name, config) VALUES ('email','E','{"recipients":["a@b.com"]}') `).run();
    const chId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    db.prepare(`INSERT INTO alert_rules (name, trigger_type, condition_expr, channel_id, enabled) VALUES ('R','threshold','true',?,1) `).run(chId);
    const ruleId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    const dispatcher = new AlertDispatcher(db);
    await dispatcher.fire('threshold', { value: 90 });
    const row = db.prepare('SELECT * FROM alert_history WHERE rule_id = ?').get(ruleId) as any;
    expect(row).toBeTruthy();
    expect(row.delivered).toBe(1);
  });

  it('disabled 规则 → 不触发', async () => {
    const db = makeDb();
    db.prepare(`INSERT INTO alert_channels (type, name, config) VALUES ('email','E','{}') `).run();
    const chId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    db.prepare(`INSERT INTO alert_rules (name, trigger_type, condition_expr, channel_id, enabled) VALUES ('R','threshold','true',?,0) `).run(chId);
    const dispatcher = new AlertDispatcher(db);
    await dispatcher.fire('threshold', {});
    const cnt = (db.prepare('SELECT count(*) as c FROM alert_history').get() as any).c;
    expect(cnt).toBe(0);
  });
});
