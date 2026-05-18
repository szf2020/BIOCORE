---
name: shape-sync
description: 同步 SCADA shape SVG 资源. assets/shapes/ 增删改 SVG 后调用 — 重新生成 catalog + 复制到 public/scada-shapes/ + 运行 vitest. 单步替代 SP-FX-5 README 中的 3 步手动流程, 避免漏 cp 导致 404.
---

# shape-sync

同步 BIOCore SCADA shape SVG 资源.

## 何时调用

`packages/web-ui/src/scada-engine/assets/shapes/` 增/删/改任意 `*.svg` 后. Catalog 与 public mirror 必须重新对齐, 否则:
- Palette ShapePicker 显示旧条目 → 缺/多
- `<image href="/scada-shapes/X.svg">` 404 (Next.js 不自动镜像)

## 步骤 (按序执行)

工作目录: `/Volumes/SSD/projects/BIOCore`. pnpm 路径必须先 export.

### Step 1: 计数源

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
SRC_COUNT=$(ls packages/web-ui/src/scada-engine/assets/shapes/*.svg 2>/dev/null | wc -l | tr -d ' ')
echo "source SVG count: $SRC_COUNT"
```

如果 `SRC_COUNT == 0` → 中止, 提示用户检查 `assets/shapes/` 是否被误清空.

### Step 2: 重新生成 catalog

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm gen:shape-catalog
```

期望 stdout: `gen-shape-catalog: wrote $SRC_COUNT shapes to .../shape-catalog.ts`.

### Step 3: 镜像到 public

```bash
rm -f packages/web-ui/public/scada-shapes/*.svg
cp packages/web-ui/src/scada-engine/assets/shapes/*.svg packages/web-ui/public/scada-shapes/
DST_COUNT=$(ls packages/web-ui/public/scada-shapes/*.svg | wc -l | tr -d ' ')
[ "$SRC_COUNT" = "$DST_COUNT" ] || { echo "MISMATCH: src=$SRC_COUNT dst=$DST_COUNT"; exit 1; }
```

注意 `rm -f` 删旧 mirror 再 cp — 防止源已删的 SVG 残留在 public/.

### Step 4: 跑 gen-shape-catalog 测试

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm -C scripts vitest run
```

期望 5 passed.

### Step 5: 验 web-ui ShapePicker 测试

```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter @biocore/web-ui vitest run src/scada-engine/editor/palette/__tests__/ShapePicker.test.tsx
```

期望 6 passed (ShapePicker 用 SHAPE_CATALOG.length, 自动适应新计数).

### Step 6: 提交

显示 diff 给用户; 默认提交消息:

```
chore(scada-engine): sync shape catalog + public mirror (<N> shapes)
```

`<N>` = 当前 SRC_COUNT. 文件清单:

```bash
git add \
  packages/web-ui/src/scada-engine/editor/palette/shape-catalog.ts \
  packages/web-ui/public/scada-shapes \
  packages/web-ui/src/scada-engine/assets/shapes
```

如果用户改了 assets/README.md 同时 add. 不要 add 其他无关文件.

## 失败处理

- gen-shape-catalog 输出 0 shapes → 看 `scripts/gen-shape-catalog.ts` 的 SRC_DIR_DEFAULT 是否被误改
- cp 失败 (权限/磁盘满) → 报错给用户, 不要静默继续
- ShapePicker 测试失败 → catalog 含非法字符? 检查 T0 fix `0f542d9` 的 JSON.stringify 是否被回滚

## 约束 (BIOCore 全局)

- 所有用户面回复中文
- pnpm 路径 `$HOME/.hermes/node/bin`
- macOS BSD sed — 不要用 `sed -i ''` 编辑文件, 用 Edit 工具
- 不动 `scripts/gen-shape-catalog.ts` 本身 (T0 已稳定)
- 不动现有 ShapePicker / Palette 测试 (SP-FX-5 已就绪)

## 相关

- 实现在 `packages/web-ui/src/scada-engine/assets/README.md` (SP-FX-5 T1)
- Catalog generator `scripts/gen-shape-catalog.ts` (SP-FX-5 T0)
- 后续自动化: SP-FX-8 build hook 可消除此 skill 的手动 cp 步骤
