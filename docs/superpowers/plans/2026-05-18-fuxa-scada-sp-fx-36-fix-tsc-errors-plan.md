# SP-FX-36 Plan: Fix 27 TSC Errors

**Sprint**: SP-FX-36  
**Date**: 2026-05-18

## Tasks

### Task 1: Fix useAuth.tsx (import block corruption)
- Remove `import { useLocale } from '@/i18n/useLocale';` (not needed in auth hook)
- Remove the misplaced `const { t } = useLocale();` line
- Verify: tsc error count drops by 5

### Task 2: Fix DashboardLayoutEditor.tsx (import block corruption)
- Remove the misplaced `import { useLocale }` line from the middle of the import block
- `const { t } = useLocale();` is already correctly placed at line 101 in the function body
- Verify: tsc error count drops by 7

### Task 3: Fix page.tsx + TrendChartGroup.tsx (param block injection)
- `page.tsx`: move `const { t } = useLocale();` out of default export params, into function body
- `TrendChartGroup.tsx`: move `const { t } = useLocale();` out of params, into function body
- Check if `t` is actually used in each; if not, remove import too
- Verify: tsc error count drops by 4

### Task 4: Fix RootCausePanel.tsx + ChannelManager.tsx + RuleTable.tsx (props destructuring injection)
- Each: move `const { t } = useLocale();` from props destructure into function body first line
- Check if `t` is actually used; if not, remove import too
- Verify: tsc error count drops by 6 -> total 0

### Task 5: Final validation
- Run pnpm tsc --noEmit: expect 0 errors
- Run pnpm vitest run: expect 1142+ pass
- git pull --rebase origin main
- git push origin main
