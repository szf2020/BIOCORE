# SP-FX-26 i18n zh/en 双语设计

**日期**: 2026-05-18  
**Sprint**: SP-FX-26  
**范围**: `packages/web-ui`

---

## 目标

BIOCore web-ui 当前全中文 hardcode in JSX。本 sprint 加轻量 zh/en 双语 toggle，零新第三方 dep。

---

## 架构

### 文件结构

```
packages/web-ui/src/i18n/
  locale.ts          — Locale 类型 + 常量
  dict-zh.json       — 中文字典 (key → 中文字符串)
  dict-en.json       — 英文字典 (key → English string)
  useLocale.ts       — LocaleProvider + useLocale hook
```

### useLocale API

```typescript
type Locale = 'zh' | 'en';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

// Provider
export function LocaleProvider({ children }: { children: React.ReactNode }): JSX.Element;

// Hook
export function useLocale(): LocaleContextValue;
```

### t() 行为

1. 字典查找 `dict[locale][key]`
2. 不存在 → fallback to key 本身
3. `params` 替换 `{{name}}` 插值
4. 默认 locale: `'zh'`

### 持久化 & URL 同步

- `localStorage 'biocore.locale'` 持久化
- URL `?lang=en` / `?lang=zh` 双向同步 (useSearchParams + router.replace)
- 优先级: URL > localStorage > 默认 'zh'

---

## i18n Key 命名约定

格式: `<file-slug>.<field-slug>`

示例:
- `app-layout.ws-connected` → "已连接" / "Connected"
- `login.title` → "登录" / "Sign In"
- `view-list-panel.new-view` → "新建视图" / "New View"

规则:
- file-slug = 文件名 kebab-case (去掉 .tsx 后缀)
- field-slug = 语义描述 kebab-case
- 避免过深嵌套 (最多 2 层)

---

## LocaleSwitcher 组件

```
packages/web-ui/src/components/layout/LocaleSwitcher.tsx
```

- 简单 toggle button: `中文 / EN`
- 嵌入 AppLayout header 右侧 (TopBarAlarmStrip 左边)
- 使用 `useLocale().setLocale()` 切换

---

## Mechanical Replace 策略

1. `grep -rn "[一-龥]"` 找所有含中文的 .tsx/.ts
2. 排除: test 文件 / console.log / 注释 / SVG widget tag label
3. 每文件:
   a. 导入 `useLocale` (如果是 React component)
   b. component 内 `const { t } = useLocale()`
   c. 中文 string → `t('file-slug.field-slug')`
   d. 两个 dict 加对应 key

**不转换范围**:
- `*.test.tsx` / `*.test.ts` (test fixture 保持中文)
- `console.log` / `console.error` 内的中文
- 代码注释中的中文
- SVG widget 内 PLC tag label (数据, 非 UI)
- `metadata` (SEO, 非 UI)

---

## 字典结构

```json
// dict-zh.json
{
  "app-layout.loading": "加载中...",
  "app-layout.ws-connected": "已连接",
  ...
}

// dict-en.json  
{
  "app-layout.loading": "Loading...",
  "app-layout.ws-connected": "Connected",
  ...
}
```

---

## 测试计划

### useLocale (6 tests)
1. 默认 locale 是 zh
2. setLocale 切换到 en
3. localStorage 持久化
4. URL ?lang=en 覆盖 locale
5. 未知 key fallback to key 本身
6. {{name}} 插值

### LocaleSwitcher (4 tests)
1. 渲染 "中文" 按钮 (zh locale)
2. click → 切换到 en
3. 切换后显示 "EN" 激活状态
4. 再次 click → 切回 zh

### 关键 page 验证 (6 tests)
1. AppLayout 使用 t()
2. LoginPage 使用 t()
3. ViewListPanel 使用 t()
4. EditorShell 使用 t()
5. WriteIntentDialog 使用 t()
6. AclEditor 使用 t()

---

## 约束

- ZERO 新第三方 dep
- 老中文断言仍 pass (zh locale 返中文)
- 不破 1113 baseline
