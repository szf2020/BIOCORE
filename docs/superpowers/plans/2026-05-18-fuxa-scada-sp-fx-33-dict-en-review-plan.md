# SP-FX-33 Plan: dict-en Translation Quality Review

**Sprint**: SP-FX-33  
**Date**: 2026-05-18  
**Baseline**: web-ui vitest 1119 (must not decrease)

---

## Tasks

### T1: RED — Write dict-consistency tests (failing)
- Create `packages/web-ui/src/i18n/__tests__/dict-consistency.test.ts`
- 5 tests targeting current bugs (e.g., "Modified label", "Move Up")
- Run vitest → expect failures on target assertions
- Verify: `pnpm --filter web-ui test -- dict-consistency` shows RED

### T2: GREEN — Fix dict-en.json (10 keys)
- Apply all 10 corrections from design spec
- Run vitest → dict-consistency tests pass
- Verify: total web-ui test count = 1119 + 5 = 1124

### T3: Add i18n translation guide doc
- Create `docs/i18n-translation-guide.md`
- Terminology table + Sentence case rules + "how to add new keys" workflow
- commit

### T4: Push
- `git pull --rebase origin main`
- `git push origin main`
- Verify: no conflicts, clean push

---

## Constraints
- Do NOT touch dict-zh.json
- Do NOT change any i18n key names
- Do NOT touch .tsx, server, plc-driver, RuntimeCanvas, PW specs
- pnpm path: `export PATH=$HOME/.hermes/node/bin:$PATH`
