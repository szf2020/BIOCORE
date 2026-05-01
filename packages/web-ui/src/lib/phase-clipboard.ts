// ============================================================
// phase-clipboard.ts — Phase 剪贴板 (Sprint 3 M3.4)
//
// 用 localStorage 存 PhaseInstance[], 跨标签页 + 跨配方粘贴。
// 粘贴时自动重置 phase.id 避免 DnD-kit 冲突, phase_id 加 "_copy" 后缀避免唯一性冲突。
// ============================================================

const KEY = 'biocore_phase_clipboard';

// 与 recipes/[id]/edit/page.tsx 的 PhaseInstance 保持一致
export interface ClipboardPhase {
  id: string;             // DnD-kit 实例 ID (粘贴时重置)
  phase_id: string;       // 业务 ID (例如 'HEATING_01')
  type: string;           // phase 类型
  label: string;
  params: Record<string, any>;
  expanded: boolean;
}

export interface ClipboardPayload {
  phases: ClipboardPhase[];
  copiedAt: string;       // ISO timestamp
  sourceRecipeId?: string;
}

/**
 * 把 phases 写入剪贴板 (替换旧内容)
 */
export function copyPhases(phases: ClipboardPhase[], sourceRecipeId?: string): void {
  if (typeof window === 'undefined') return;
  const payload: ClipboardPayload = {
    phases: phases.map(p => ({
      ...p,
      // 保留参数的深拷贝, 防止原地修改污染剪贴板
      params: JSON.parse(JSON.stringify(p.params || {})),
    })),
    copiedAt: new Date().toISOString(),
    sourceRecipeId,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('phase-clipboard: localStorage 写入失败', e);
  }
}

/**
 * 读取剪贴板, 返回 null 表示空
 */
export function readClipboard(): ClipboardPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as ClipboardPayload;
    if (!payload || !Array.isArray(payload.phases)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * 清空剪贴板
 */
export function clearClipboard(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}

/**
 * 把剪贴板里的 phases 适配为可粘贴到目标配方的新 phases。
 * 新 id (DnD key) 用 Date.now + index 生成, phase_id 加 _copy 后缀。
 */
export function preparePaste(phases: ClipboardPhase[]): ClipboardPhase[] {
  const now = Date.now();
  return phases.map((p, i) => ({
    ...p,
    id: `${p.type}_${now}_${i}`,
    phase_id: `${p.phase_id}_COPY`,
    params: JSON.parse(JSON.stringify(p.params || {})),
    expanded: false,
  }));
}
