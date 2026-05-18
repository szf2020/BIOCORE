# BIOCore i18n Translation Guide

**Scope**: `packages/web-ui/src/i18n/dict-zh.json` + `dict-en.json`  
**Last updated**: 2026-05-18 (SP-FX-33)

---

## 1. Files

| File | Purpose | Who edits |
|---|---|---|
| `dict-zh.json` | Canonical source (Chinese) | Product / designer |
| `dict-en.json` | English translation | i18n reviewer |

Rules:
- Keys are fixed — changing a key breaks all callers.
- `dict-zh.json` is the source of truth. Never change a zh value without review.
- Both files must have identical key sets. CI checks this via `dict-consistency.test.ts`.

---

## 2. Adding a New Key

1. Add the key + zh value to `dict-zh.json`
2. Add the same key + en value to `dict-en.json`
3. Run tests: `pnpm --filter web-ui test -- dict-consistency` — must pass
4. Use the key in code: `t('your.new.key')`

---

## 3. Standard Terminology (EN)

Use these terms consistently. Do NOT invent synonyms.

| Concept | Standard EN | Do NOT use |
|---|---|---|
| 保存 | Save | save, Save Changes |
| 已修改 | Modified | Has been modified, Modified label |
| 取消 | Cancel | Abort (except CIP/SIP stop actions) |
| 确认 | Confirm | Sure, OK (as action) |
| 确认写入 | Confirm Write | Confirm Writing, Write OK |
| PLC 标签 | PLC Tag | PLC Label, plc tag |
| 标签 (binding) | Tag | Label (in data binding context) |
| 实时数据 | Real-time Data | Realtime Data, Live Data |
| 报警 | Alarm | Alert, Warning (unless severity level) |
| 互锁 | Interlock | Interlock/Safety |
| 就地清洗 | CIP (Clean-in-Place) | Clean In Place |
| 就地灭菌 | SIP (Sterilize-in-Place) | Sterilize In Place |
| 设备配置 | Device Config | Device Configuration |
| PLC通讯 | PLC Communication | PLC Comm, PLC Connection |
| Phase模板 | Phase Templates | Phase Template Configuration |
| 权限管理 | Permissions | Permission, ACL |
| 审计追踪 | Audit Trail | Audit Log, Audit Logs |
| 软测量模型 | Soft Sensor Model | Soft Sensor |
| 数据浏览 | Data Explorer | Data Browse |
| 空闲 | Idle | Free, Standby |
| 保持 | Held | Hold, On Hold |
| 上移一层 | Bring Forward | Move Up, Move Forward |
| 下移一层 | Send Backward | Move Down, Move Backward |
| 置顶 | Bring to Front | Move to Top |
| 置底 | Send to Back | Move to Bottom |

---

## 4. Sentence Case Rules

### Button labels — Sentence case

First word capitalized only:

```
Save    Cancel    Confirm Write    Add Binding    Remove    Create    Duplicate
```

### Section headings / Panel titles — Title Case allowed

```
SCADA Views    Data Bindings    Access Control    Phase Templates    System Settings
```

### Navigation items — Title Case

```
Process HMI    Recipe Management    Audit Trail    Data Explorer    Soft Sensor Model
```

### Descriptions / Subtitles — Sentence case

```
Configure fermentor count, PLC connections, and heartbeat parameters
Manage PLC connections, variable mapping, and communication parameters
```

### Placeholders — always end with "..."

```
Search...    Enter tag address...    Enter view name...    Search views...
```

### State labels — single capitalized word

```
Running    Idle    Held    Paused    Stopped    Complete
```

---

## 5. Oxford Comma

Always use Oxford comma (serial comma) in English lists:

```
# Correct
"Configure fermentor count, PLC connections, and heartbeat parameters"

# Wrong
"Configure fermentor count, PLC connections and heartbeat parameters"
```

---

## 6. Placeholders

Preserve `{{varName}}` tokens exactly as they appear in zh:

```json
// zh
"view-list-panel.view-count": "共 {{count}} 个视图"

// en — same token, different position is fine
"view-list-panel.view-count": "{{count}} views total"
```

CI test `T3` verifies placeholder parity for every key.

---

## 7. Abbreviations

| Full form | Abbreviation allowed | Context |
|---|---|---|
| parameters | params | NOT in UI text — spell out |
| configuration | Config | Nav labels, card titles OK |
| PLC Communication | PLC Comm | Never — use full form |

---

## 8. CI Checks

File: `packages/web-ui/src/i18n/__tests__/dict-consistency.test.ts`

| Test | What it checks |
|---|---|
| T1 | Key parity (zh ↔ en, no missing, no extra) |
| T2 | No empty values in en |
| T3 | Placeholder `{{var}}` parity per key |
| T4 | `save-bar.modified` = "Modified" (regression guard) |
| T5 | Layer terms: "Bring Forward" / "Send Backward" (SCADA standard) |

Run locally:
```bash
export PATH=$HOME/.hermes/node/bin:$PATH
pnpm --filter web-ui test -- dict-consistency
```
