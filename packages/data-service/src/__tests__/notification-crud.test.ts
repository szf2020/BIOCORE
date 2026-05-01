import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import {
  listChannels,
  upsertChannel,
  deleteChannel,
  listRules,
  setRules,
} from '../sqlite-service';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Apply T35 schema directly (in-memory)
  db.exec(`
    CREATE TABLE notification_channels (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL CHECK (type IN ('feishu', 'dingtalk', 'telegram', 'webhook')),
      config      TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE notification_rules (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type   TEXT NOT NULL,
      channel_id   TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
      enabled      INTEGER NOT NULL DEFAULT 1,
      min_severity TEXT NOT NULL DEFAULT 'warn' CHECK (min_severity IN ('info', 'warn', 'critical'))
    );
  `);
});

afterAll(() => { try { db.close(); } catch { /* noop */ } });

describe('notification CRUD', () => {
  it('upsert + list channels', () => {
    upsertChannel(db, { id: 'ch1', type: 'feishu', config: { webhook_url: 'http://x' }, enabled: true });
    const list = listChannels(db);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('ch1');
    expect(list[0].config).toEqual({ webhook_url: 'http://x' });
  });

  it('upsert overwrites existing channel by id', () => {
    upsertChannel(db, { id: 'ch1', type: 'feishu', config: { webhook_url: 'http://a' }, enabled: true });
    upsertChannel(db, { id: 'ch1', type: 'webhook', config: { webhook_url: 'http://b' }, enabled: false });
    const list = listChannels(db);
    expect(list.length).toBe(1);
    expect(list[0].type).toBe('webhook');
    expect(list[0].enabled).toBe(false);
  });

  it('delete channel cascades to rules', () => {
    upsertChannel(db, { id: 'ch1', type: 'webhook', config: {}, enabled: true });
    setRules(db, [{ event_type: 'oom_threshold', channel_id: 'ch1', enabled: true, min_severity: 'warn' }]);
    expect(listRules(db).length).toBe(1);
    deleteChannel(db, 'ch1');
    expect(listChannels(db).length).toBe(0);
    expect(listRules(db).length).toBe(0);
  });

  it('setRules replaces all rules atomically', () => {
    upsertChannel(db, { id: 'ch1', type: 'webhook', config: {}, enabled: true });
    upsertChannel(db, { id: 'ch2', type: 'feishu', config: { webhook_url: 'http://x' }, enabled: true });
    setRules(db, [
      { event_type: 'oom_threshold', channel_id: 'ch1', enabled: true, min_severity: 'critical' },
      { event_type: 'plc_disconnect_5min', channel_id: 'ch2', enabled: true, min_severity: 'warn' },
    ]);
    expect(listRules(db).length).toBe(2);
    setRules(db, [{ event_type: 'process_restart', channel_id: 'ch1', enabled: false, min_severity: 'info' }]);
    expect(listRules(db).length).toBe(1);
    expect(listRules(db)[0].event_type).toBe('process_restart');
    expect(listRules(db)[0].enabled).toBe(false);
  });

  it('listRules returns empty when no rules', () => {
    expect(listRules(db)).toEqual([]);
  });
});
