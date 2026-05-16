# SCADA E2E Tests

Playwright smoke tests for critical user flows.

## Run

Prereq: dev server running on `localhost:3000`, server API on `localhost:3001`, seeded admin user (`admin`/`admin123` by default).

```bash
cd packages/web-ui
pnpm install                  # installs @playwright/test
pnpm exec playwright install  # one-time: download browser binaries
pnpm test:e2e
```

## Env

| Var | Default | Purpose |
|-----|---------|---------|
| `E2E_BASE_URL` | `http://localhost:3000` | Web UI URL |
| `E2E_USER` | `admin` | Login username |
| `E2E_PASS` | `admin123` | Login password |

## Current coverage

- `scada-smoke.spec.ts`: login + 3 page-load smoke checks (`/scada`, `/scada/suggestions`, `/settings/alarm-config`)

## Adding tests

Tests go in this directory and match `*.spec.ts`. See playwright.config.ts for shared settings.
