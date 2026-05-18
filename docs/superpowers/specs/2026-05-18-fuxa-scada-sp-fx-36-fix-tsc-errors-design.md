# SP-FX-36 Design: Fix 27 TSC Errors

**Sprint**: SP-FX-36  
**Date**: 2026-05-18  
**Status**: Approved

## Root Cause

SP-FX-26 mechanical i18n replace inserted `const { t } = useLocale();` into the **parameter destructuring block** of function components instead of the **function body**. This causes TypeScript syntax errors (TS1003, TS1005, TS1109, TS1131, TS1138, TS1434).

## Error Inventory (27 errors across 6 files)

| File | Lines | Error Codes | Root Cause |
|------|-------|-------------|------------|
| `src/app/scada2/view-v2/[viewId]/page.tsx` | 13 | TS1005 x2 | `t` injection placed in default export params |
| `src/components/dashboard/DashboardLayoutEditor.tsx` | 28-31 | TS1003, TS1005 x3, TS1109, TS1434 | `t` injection placed in import block |
| `src/components/dashboard/RootCausePanel.tsx` | 18-22 | TS1131, TS1005 x4, TS1138 | `t` injection placed in props destructuring |
| `src/components/dashboard/TrendChartGroup.tsx` | 114 | TS1005 x2 | `t` injection placed in component params |
| `src/components/notifications/ChannelManager.tsx` | 41 | TS1005 x2 | `t` injection placed in component params |
| `src/components/notifications/RuleTable.tsx` | 22 | TS1005 x2 | `t` injection placed in component params |
| `src/hooks/useAuth.tsx` | 11-13 | TS1003, TS1005 x2, TS1109, TS1434 | `t` injection placed in import block |

## Fix Pattern

**Wrong** (mechanical insert into params/imports):
```tsx
export function MyComp({
  const { t } = useLocale();  // WRONG: inside destructure
  propA, propB,
}: Props) {
```

**Correct** (move to function body first line):
```tsx
export function MyComp({ propA, propB }: Props) {
  const { t } = useLocale();  // CORRECT: inside function body
```

## Scope

- Fix: 6 `.tsx` files in web-ui
- No changes to: dict files, useLocale.ts, migrations, ViewCard.tsx, playwright.config.ts
- No new dependencies
- vitest baseline 1142 must not decrease

## Note on t Usage

After moving `const { t } = useLocale()` to the function body, verify whether `t` is actually used in each component. If not used, remove the `useLocale` import and the `const { t }` line to avoid TS6133 unused variable errors.

For `useAuth.tsx`: the hook itself does not render UI, `t` is not needed -- remove both import and the misplaced line.
