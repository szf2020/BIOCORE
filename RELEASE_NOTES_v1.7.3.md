# BIOCore v1.7.3 — P0 Security Patches

**Release date:** 2026-05-01
**Branch:** `v1.7.3-security-patches`
**Predecessor:** v1.7.2 (boot-recovery + listener hardening)

This is a security-focused release derived from a 4-reviewer audit
(TS / Security / Architecture / Performance). Only **P0** findings are
addressed here. Each fix is one commit so reviewers can inspect each
diff in isolation.

## Summary

| # | Severity | Area | Fix |
|---|----------|------|-----|
| 1 | High | plc-driver | Bind to `127.0.0.1` by default; warn on public bind |
| 2 | Critical | auth | Add `requireRole` middleware factory |
| 3 | Critical (C2) | server | Apply role guards to recipe approval, reactor control, user mgmt |
| 4 | High (H1+H2) | auth | Remove `/ai/report` and `/admin/metrics` from `PUBLIC_PATHS`; switch to exact-match |
| 5 | High (H4) | server | CORS requires `ALLOWED_ORIGINS` in production; safer dev default |
| 6 | High (H7) | server | Await migrations before `server.listen` |
| 7 | High (H3) | web-ui | DOMPurify on AI report preview |
| 8 | Critical (C3-partial) | server | Never log default admin password |

## Detail

### Fix 1 — plc-driver bind (commit `a8d505d`)
`packages/plc-driver/src/server.ts` now binds to `process.env.BIND_HOST || '127.0.0.1'` by
default. If an operator deliberately sets `BIND_HOST=0.0.0.0` (or `::`), a startup
warning is emitted: *"WARNING: bound to all interfaces without auth — set
AUTH_ENABLED=true on main server and route through it instead."* This driver is
standalone and intentionally has no auth middleware (cross-package coupling
would create a circular dep). Top-of-file comment documents the constraint.

### Fix 2 — `requireRole` factory (commit `2cd29d9`)
New `requireRole(...allowedRoles: string[])` exported from `auth.ts`.
- `!req.user` → `401`
- `req.user.role === 'admin'` → bypass (admin > everything)
- `!allowedRoles.includes(role)` → `403 { error: 'Forbidden: requires role X|Y|Z' }`
- API-key role `'service'` is granted **only** when explicitly listed in `allowedRoles`.

### Fix 3 — Role guards on dangerous routes (commit `96d8fff`)
Inserted `requireRole(...)` between path and handler for:
- `POST /recipes/:id/approve` → `admin`
- `POST /recipes/:id/status` → `admin`
- `POST /reactors` → `admin`
- `POST /reactors/:id/start` → `admin, engineer, operator, service`
- `POST /reactors/:id/stop` → `admin, engineer, operator, service`
- `POST /reactors/:id/estop` → `admin, engineer, operator, service` (emergency, broad)
- `POST /reactors/:id/restart` → `admin, engineer, operator` (no `service`; restart requires human supervision)
- `POST /reactors/:id/download-recipe` → `admin, engineer`
- `POST /users` → `admin`
- `PUT /users/:id` → `admin`

Removed dead local `requireRole(minRole: string)` (level-based, never called) and
its `ROLE_LEVELS` map — they conflicted with the new factory import and weren't
in use anywhere.

### Fix 4 — Public-path tightening (commit `7bbaf25`)
`PUBLIC_PATHS` reduced to `['/auth/login', '/status', '/docs.json',
'/admin/health/liveness']`. `/ai/report` and `/admin/metrics` are no longer
public — they require a valid token or API key. Matching switched from
`startsWith(p + '/')` to `req.path === p` (exact match) to prevent future
prefix-bypass surprises. A small `DOCS_PUBLIC_PREFIXES = ['/docs']` list
preserves swagger-ui sub-path serving (`/docs/swagger-ui.css` etc.).

### Fix 5 — CORS hardening (commit `5525432`)
- If `ALLOWED_ORIGINS` env var is set → parsed as comma-separated list.
- Else if `NODE_ENV === 'production'` → `console.error` + `process.exit(1)` at startup.
- Else (dev) → fallback `origin: 'http://localhost:3000'` + warn (no longer `origin: true`).
- `origin: true` + `credentials: true` (CSRF risk) is no longer reachable.

### Fix 6 — Await migrations before listen (commit `643b945`)
The fire-and-forget migration IIFE is now exposed as a `migrationsReady: Promise<void>`,
and `server.listen(...)` is wrapped in an `async function start()` that
`await`s `migrationsReady` first. SIGINT/SIGTERM handlers remain at module top.
`setAuthDb` still runs at module load — it just sets a `dbRef` consumed at
request time, which by then is post-migration. Failure to migrate now
fails-fast at startup instead of accepting requests against an un-migrated
schema.

### Fix 7 — DOMPurify on AI report (commit `1fc65df`)
Added `dompurify` + `@types/dompurify` to `@biocore/web-ui`. `ReportPreview.tsx`
wraps `renderMarkdown(content)` in `DOMPurify.sanitize(...)` before
`dangerouslySetInnerHTML`. SSR-safe: `typeof window === 'undefined'` guard
returns `''`, and the file already had `'use client'` so client-side rendering
is the actual code path.

### Fix 8 — Don't log admin password (commit `1267f43`)
Replaced both `console.log('...admin密码已重置为 admin123')` and
`console.log('...已创建默认admin用户 (admin/admin123)')` with neutral
`[BOOT] Default admin account ... Password set in DB; reset via reset-admin
script before production.` log lines. Password generation/hash logic untouched
(the broader hard-coded-`admin123` fix is queued for v1.8.0 / Fix 9 territory).

## Out of scope (deferred to v1.8.0)

- Replacing literal `admin123` with a random password printed to a one-time
  bootstrap file (Fix 9 in the audit).
- Replacing the home-rolled JWT (HMAC-SHA256 over header.body.SECRET) with
  `jsonwebtoken` or `jose`.
- API-key scope enforcement (currently advisory).

## Verification

- `pnpm -r build` — clean
- `pnpm --filter @biocore/batch-engine test` — must remain 65/65
- `pnpm --filter @biocore/data-service test` — boot-recovery 4/4 must pass
- Smoke: `MOCK_PLC=true PORT=3094 npx tsx packages/server/src/index.ts` boots
  cleanly, banner prints, no startup errors.

See `git log v1.7.2..v1.7.3` for the 8 individual commits.
