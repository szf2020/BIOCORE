// ============================================================
// useAudit — 审计追踪通用 hook
// 用法:
//   const audit = useAudit();
//   <button onClick={() => audit.confirm({
//     description: '修改 PID Kp',
//     action: 'pid_change', targetType: 'pid', targetId: 'TIC-101',
//     oldValue: '1.2', newValue: '1.5',
//     onConfirm: () => savePid(1.5),
//   })}>修改</button>
//   {audit.dialog}
// ============================================================

'use client';

import React, { useState, useCallback } from 'react';
import { AuditConfirmDialog } from '@/components/ui/audit-confirm';

export interface AuditRequest {
  description: string;        // 变更描述 (显示给用户)
  action: string;             // audit_logs.action
  targetType: string;         // audit_logs.target_type
  targetId: string;           // audit_logs.target_id
  oldValue?: string;          // 修改前的值
  newValue?: string;          // 修改后的值
  batchId?: string | null;
  title?: string;             // 对话框标题 (默认: 参数修改确认)
  // onConfirm 可选接收用户输入的 username + reason (例如用于配方拒绝, 把 reason 作为拒绝理由)
  onConfirm: (username?: string, reason?: string) => void | Promise<void>;
  onCancel?: () => void;
}

interface AuditState extends AuditRequest {
  open: boolean;
}

const EMPTY: AuditState = {
  open: false,
  description: '',
  action: '',
  targetType: '',
  targetId: '',
  onConfirm: () => {},
};

/**
 * 审计追踪 hook
 * 调用 confirm() 弹出对话框,用户输入用户名+原因,确认后写审计日志再执行 onConfirm
 */
export function useAudit() {
  const [state, setState] = useState<AuditState>(EMPTY);

  const confirm = useCallback((req: AuditRequest) => {
    setState({ ...req, open: true });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const handleConfirm = useCallback(async (username: string, reason: string) => {
    // 注: AuditConfirmDialog 内部已 POST 审计日志,此处只执行实际操作
    // 把 username/reason 透传给 onConfirm, 允许调用方复用 audit 对话框的"修改原因"字段 (例如拒绝理由)
    try {
      await Promise.resolve(state.onConfirm(username, reason));
    } catch (e) {
      console.error('audit onConfirm error:', e);
    } finally {
      close();
    }
  }, [state, close]);

  const handleCancel = useCallback(() => {
    close();
    state.onCancel?.();
  }, [state, close]);

  const dialog = (
    <AuditConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      action={state.action}
      targetType={state.targetType}
      targetId={state.targetId}
      oldValue={state.oldValue}
      newValue={state.newValue}
      batchId={state.batchId}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}
