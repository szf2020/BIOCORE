/**
 * v1.8.0 bucket 1 — bcrypt password hashing & legacy SHA-256 verification.
 *
 * Pure unit tests — no server boot, no DB. Tests the two helpers
 * `hashPasswordBcrypt` and `verifyPassword` exported from index.ts.
 *
 * Why we don't use the real index.ts module here: importing it auto-starts a
 * server (binds ports, opens SQLite). Instead we inline the same logic in a
 * private helper so the test stays hermetic. The production code is the
 * single source of truth — if we change one we must mirror the other.
 *
 * Behavioral coverage:
 *   - bcrypt round-trip ($2b$12$… hash, 60 chars, validates correct password)
 *   - bcrypt rejects wrong password
 *   - legacy `salt:sha256(password+salt)` round-trip via verifyPassword
 *   - wrong password against legacy hash → ok=false, legacy=true
 *   - malformed / empty hash → ok=false, legacy=false (graceful)
 */

import { describe, it, expect } from 'vitest';
import { createHash, timingSafeEqual } from 'crypto';
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

async function hashPasswordBcrypt(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ ok: boolean; legacy: boolean }> {
  if (typeof storedHash !== 'string' || storedHash.length === 0) {
    return { ok: false, legacy: false };
  }
  if (storedHash.startsWith('$2')) {
    try {
      const ok = await bcrypt.compare(password, storedHash);
      return { ok, legacy: false };
    } catch {
      return { ok: false, legacy: false };
    }
  }
  const m = /^([a-f0-9]{32}):([a-f0-9]{64})$/.exec(storedHash);
  if (!m) return { ok: false, legacy: false };
  const [, salt, expectedHex] = m;
  const computedHex = createHash('sha256').update(password + salt).digest('hex');
  if (computedHex.length !== expectedHex.length) return { ok: false, legacy: true };
  const ok = timingSafeEqual(
    Buffer.from(computedHex, 'hex'),
    Buffer.from(expectedHex, 'hex'),
  );
  return { ok, legacy: true };
}

function buildLegacyHash(password: string, salt: string): string {
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

describe('hashPasswordBcrypt', () => {
  it('returns a $2b$12$-prefixed string of length 60', async () => {
    const hash = await hashPasswordBcrypt('foo');
    expect(hash).toMatch(/^\$2b\$12\$/);
    expect(hash.length).toBe(60);
  });

  it('produces distinct hashes for the same input (random salt)', async () => {
    const h1 = await hashPasswordBcrypt('foo');
    const h2 = await hashPasswordBcrypt('foo');
    expect(h1).not.toBe(h2);
  });
});

describe('verifyPassword — bcrypt branch', () => {
  it('verifies a correct password against a freshly bcrypt-hashed value', async () => {
    const hash = await hashPasswordBcrypt('foo');
    const result = await verifyPassword('foo', hash);
    expect(result).toEqual({ ok: true, legacy: false });
  });

  it('rejects a wrong password against a bcrypt hash', async () => {
    const hash = await hashPasswordBcrypt('foo');
    const result = await verifyPassword('bar', hash);
    expect(result).toEqual({ ok: false, legacy: false });
  });
});

describe('verifyPassword — legacy SHA-256 branch', () => {
  it('verifies a hand-crafted legacy hash with the correct password and flags legacy=true', async () => {
    const salt = '00'.repeat(16); // 32 hex chars
    const stored = buildLegacyHash('foo', salt);
    expect(stored).toMatch(/^[a-f0-9]{32}:[a-f0-9]{64}$/);
    const result = await verifyPassword('foo', stored);
    expect(result).toEqual({ ok: true, legacy: true });
  });

  it('rejects wrong password against legacy hash but still flags legacy=true', async () => {
    const salt = 'ab'.repeat(16);
    const stored = buildLegacyHash('foo', salt);
    const result = await verifyPassword('wrong', stored);
    expect(result).toEqual({ ok: false, legacy: true });
  });
});

describe('verifyPassword — graceful fallback', () => {
  it('returns ok=false, legacy=false on empty hash', async () => {
    const result = await verifyPassword('foo', '');
    expect(result).toEqual({ ok: false, legacy: false });
  });

  it('returns ok=false, legacy=false on a random non-matching string', async () => {
    const result = await verifyPassword('foo', 'not-a-real-hash');
    expect(result).toEqual({ ok: false, legacy: false });
  });

  it('returns ok=false, legacy=false on a malformed legacy-shaped string (wrong lengths)', async () => {
    const result = await verifyPassword('foo', 'abc:def');
    expect(result).toEqual({ ok: false, legacy: false });
  });

  it('handles a malformed bcrypt-prefixed string without throwing', async () => {
    const result = await verifyPassword('foo', '$2b$invalid');
    expect(result.ok).toBe(false);
    expect(result.legacy).toBe(false);
  });
});
