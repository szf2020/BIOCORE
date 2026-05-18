# SP-FX-33 Design Spec: dict-en Translation Quality Review

**Sprint**: SP-FX-33  
**Date**: 2026-05-18  
**Scope**: `packages/web-ui/src/i18n/dict-en.json` only — zh frozen, keys immutable

---

## 1. Terminology Glossary (Standard Terms)

| Concept (ZH) | Standard EN | Do NOT use |
|---|---|---|
| 保存 | Save | save, save changes, Save Changes |
| 已修改 | Modified | Has been modified, Modified label |
| 标签 (PLC) | Tag | Label (in PLC/binding context) |
| PLC 标签 | PLC Tag | PLC label, plc tag |
| 实时数据 | Real-time Data | Realtime Data, Live Data |
| 报警 | Alarm | Alert, Warning (unless severity) |
| 确认写入 | Confirm Write | Confirm Writing, Sure?, OK |
| 搜索... | Search... | Search (no ellipsis for placeholders needs ...) |
| 设备配置 | Device Config | Device Configuration (too long) |
| PLC通讯配置 | PLC Communication | PLC Comm Config, PLC Connection |
| Phase模板 | Phase Templates | Phase Template Config |
| 互锁 | Interlock | Interlock/Safety |
| 就地清洗 | CIP (Clean-in-Place) | Clean-in-place (lowercase) |
| 就地灭菌 | SIP (Sterilize-in-Place) | Sterilize-in-place |
| 用户管理 | User Management | Users Management |
| 权限管理 | Permissions | Permission, ACL |
| 审计追踪 | Audit Trail | Audit Log (nav label only) |
| 软测量模型 | Soft Sensor Model | Soft sensor model |
| 数据浏览 | Data Explorer | Data Browse, Data Browser |

---

## 2. Sentence Case Rules

**Button labels**: Sentence case (first word capitalized only)
- "Save", "Cancel", "Confirm Write", "Add Binding", "Remove", "Create"

**Section titles / Panel headings**: Title Case allowed
- "SCADA Views", "Data Bindings", "Access Control", "Phase Templates"

**Descriptions / Subtitles**: Sentence case
- "Configure fermentor count, PLC connections, and heartbeat parameters"

**Navigation items**: Title Case
- "Process HMI", "Recipe Management", "Audit Trail"

**Placeholders**: end with "..." always
- "Search...", "Enter tag address...", "Enter view name..."

**State labels**: Sentence case single word
- "Running", "Idle", "Held", "Paused", "Stopped", "Complete"

---

## 3. Final Correction List (changes only)

10 keys to update:

1. `save-bar.modified`: "Modified label" → "Modified"
2. `toolbar.layer-up`: "Move Up" → "Bring Forward"
3. `toolbar.layer-down`: "Move Down" → "Send Backward"
4. `dashboard.customize-layout`: "Customize dashboard layout" → "Customize Layout"
5. `settings.device-config.desc`: add Oxford comma + expand "params" → "parameters"
6. `settings.plc-config.desc`: add Oxford comma + expand "params" → "parameters"
7. `settings.ai-config.desc`: add Oxford comma
8. `settings.data-maintenance.desc`: add Oxford comma
9. `clean.interlock-warning`: "Interlock: main fermentation running — CIP/SIP disabled" → "Interlock active: fermentation running — CIP/SIP locked out"
10. `dashboard.no-reactor-desc`: shorten and clarify sentence

---

## 4. dict-consistency Test Plan

New file: `packages/web-ui/src/i18n/__tests__/dict-consistency.test.ts`

5 tests:
1. **Key parity**: dict-en has exactly the same keys as dict-zh (no missing, no extra)
2. **No empty values**: every value in dict-en is a non-empty string
3. **Placeholder parity**: keys with `{{var}}` in zh also have matching `{{var}}` in en
4. **No "label" suffix artifact**: `save-bar.modified` does not contain "label"
5. **Layer term check**: `toolbar.layer-up` uses "Forward" not "Up"

---

## 5. Files Modified

- `packages/web-ui/src/i18n/dict-en.json` — 10 key corrections
- `packages/web-ui/src/i18n/__tests__/dict-consistency.test.ts` — new (5 tests, RED-first TDD)
- `docs/i18n-translation-guide.md` — new terminology + rules doc
