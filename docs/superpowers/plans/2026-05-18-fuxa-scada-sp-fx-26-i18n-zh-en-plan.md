# SP-FX-26 i18n zh/en 实施计划

**日期**: 2026-05-18  
**Sprint**: SP-FX-26

---

## 任务列表

### T1: useLocale hook + LocaleProvider + 6 tests (TDD RED-first)

**文件**:
- `packages/web-ui/src/i18n/locale.ts`
- `packages/web-ui/src/i18n/dict-zh.json`
- `packages/web-ui/src/i18n/dict-en.json`
- `packages/web-ui/src/i18n/useLocale.ts`
- `packages/web-ui/src/i18n/__tests__/useLocale.test.ts`

**步骤**:
1. 写 test (RED)
2. 写 locale.ts 类型
3. 写空字典
4. 写 useLocale.ts 实现 (GREEN)
5. vitest 验证

**验证**: 6 tests pass

---

### T2: LocaleSwitcher + 4 tests + 嵌 AppLayout

**文件**:
- `packages/web-ui/src/components/layout/LocaleSwitcher.tsx`
- `packages/web-ui/src/components/layout/__tests__/LocaleSwitcher.test.tsx`
- `packages/web-ui/src/components/layout/AppLayout.tsx` (嵌入 LocaleSwitcher + useLocale)
- `packages/web-ui/src/app/layout.tsx` (加 LocaleProvider)

**步骤**:
1. 写 test (RED)
2. 实现 LocaleSwitcher
3. 嵌 AppLayout header
4. 加 LocaleProvider 到 RootLayout
5. vitest 验证

**验证**: 4 tests pass

---

### T3: dict-zh + dict-en 基础 key (50 高频词)

AppLayout nav items + 状态标签 + 通用操作词 (保存/取消/确认/删除等)

---

### T4: Mechanical replace — Layout + Login + Dashboard

**文件**:
- `packages/web-ui/src/components/layout/AppLayout.tsx`
- `packages/web-ui/src/app/login/page.tsx`
- `packages/web-ui/src/app/dashboard/page.tsx`
- `packages/web-ui/src/app/dashboard/hmi/page.tsx`
- `packages/web-ui/src/app/layout.tsx` (metadata 不转)
- `packages/web-ui/src/app/loading.tsx`
- loading pages

**验证**: vitest 不破

---

### T5: Mechanical replace — SCADA pages

**文件**:
- `packages/web-ui/src/components/scada/pages/ViewListPanel.tsx`
- `packages/web-ui/src/components/scada/pages/ViewCard.tsx`
- `packages/web-ui/src/components/scada/pages/ViewListRows.tsx`
- `packages/web-ui/src/components/scada/pages/ViewListSearchBar.tsx`
- `packages/web-ui/src/components/scada/pages/ViewListToolbar.tsx`
- `packages/web-ui/src/components/scada/pages/ViewPaginator.tsx`
- `packages/web-ui/src/components/scada/pages/TemplatePicker.tsx`
- `packages/web-ui/src/components/scada/pages/WidgetLinkPanel.tsx`
- `packages/web-ui/src/components/scada/pages/WidgetWriteIntentPanel.tsx`
- `packages/web-ui/src/components/scada/views/AclEditor.tsx`

**验证**: vitest 不破

---

### T6: Mechanical replace — Editor (scada-engine)

**文件**:
- `packages/web-ui/src/scada-engine/editor/editor-shell.tsx`
- `packages/web-ui/src/scada-engine/editor/EditorCanvas.tsx`
- `packages/web-ui/src/scada-engine/editor/toolbar/Toolbar.tsx`
- `packages/web-ui/src/scada-engine/editor/palette/ShapePicker.tsx`
- `packages/web-ui/src/scada-engine/editor/properties/PropertyPanel.tsx`
- `packages/web-ui/src/scada-engine/editor/properties/widget-schemas.tsx`
- `packages/web-ui/src/scada-engine/editor/properties/PropertiesPlaceholder.tsx`
- `packages/web-ui/src/components/scada/editor/PropertyPanel.tsx`
- `packages/web-ui/src/components/scada/editor/SaveBar.tsx`
- `packages/web-ui/src/components/scada/editor/WidgetPalette.tsx`
- `packages/web-ui/src/components/scada/editor/NewViewDialog.tsx`
- `packages/web-ui/src/components/scada/editor/BindingsEditor.tsx`

**验证**: vitest 不破

---

### T7: Mechanical replace — Dialogs + Runtime

**文件**:
- `packages/web-ui/src/components/scada/runtime/WriteIntentDialog.tsx`
- `packages/web-ui/src/components/scada/runtime/SuggestionsBar.tsx`
- `packages/web-ui/src/scada-engine/dialogs/*.tsx`
- `packages/web-ui/src/scada-engine/runtime/RuntimeCanvas.tsx`

**验证**: vitest 不破

---

### T8: Mechanical replace — App pages + Settings + Others

**文件**:
- `packages/web-ui/src/app/scada2/**/*.tsx`
- `packages/web-ui/src/app/settings/**/*.tsx`
- `packages/web-ui/src/app/recipes/**/*.tsx`
- `packages/web-ui/src/app/analysis/**/*.tsx`
- `packages/web-ui/src/app/batches/**/*.tsx`
- `packages/web-ui/src/components/dashboard/*.tsx`
- `packages/web-ui/src/components/recipe-graph/*.tsx`
- `packages/web-ui/src/components/notifications/*.tsx`
- `packages/web-ui/src/hooks/useAudit.tsx`, `useAuth.tsx`
- `packages/web-ui/src/lib/*.ts`
- remaining components

**验证**: vitest 不破

---

### T9: Key page t() 验证 tests (6 tests)

写 6 个 vitest 验证关键 page 确实调用了 t()。

---

### T10: PW e2e — locale switch

1 Playwright test:
- login → header LocaleSwitcher
- click → 验中文界面
- click → 英文界面
- URL ?lang=en
- reload 保持

---

### T11: regression + push

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
cd packages/web-ui && pnpm test
git pull --rebase origin main
git push origin main
```

**验证**: web-ui tests >= 1128 (1113 + 15), 0 fail

---

## Key 命名约定

`<file-slug>.<field-slug>` e.g. `app-layout.ws-connected`
