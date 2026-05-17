"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";
import { apiFetch } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface AuditConfirmProps {
  open: boolean;
  title?: string;
  description?: string;          // 变更描述 (自动填写)
  targetType?: string;           // audit_logs.target_type
  targetId?: string;             // audit_logs.target_id
  action?: string;               // audit_logs.action
  oldValue?: string;             // 修改前的值
  newValue?: string;             // 修改后的值
  batchId?: string | null;
  onConfirm: (username: string, reason: string) => void;
  onCancel: () => void;
}

/**
 * 审计确认对话框
 * 任何参数修改前弹出此对话框，要求输入用户名和修改原因。
 * 确认后将审计记录写入SQLite audit_logs表。
 */
export function AuditConfirmDialog({
  open, title, description, targetType, targetId, action,
  oldValue, newValue, batchId,
  onConfirm, onCancel,
}: AuditConfirmProps) {
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    if (!username.trim()) { setError("请输入用户名"); return; }
    if (!reason.trim()) { setError("请输入修改原因"); return; }
    setError("");
    setSaving(true);

    try {
      // 写入审计日志
      const res = await apiFetch(`${API}/api/audit-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batch_id: batchId || null,
          user_id: username.trim(),
          action: action || "param_change",
          target_type: targetType || "parameter",
          target_id: targetId || "",
          old_value: oldValue || null,
          new_value: newValue || null,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) { setError("审计日志写入失败"); setSaving(false); return; }
      onConfirm(username.trim(), reason.trim());
      // 重置
      setUsername("");
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setUsername("");
    setReason("");
    setError("");
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title || "参数修改确认"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {description && (
            <div className="text-sm bg-muted/50 rounded p-2.5 border border-border">
              {description}
            </div>
          )}
          {oldValue && newValue && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="font-mono">{oldValue}</span>
              <span className="text-primary">→</span>
              <span className="font-mono font-semibold text-foreground">{newValue}</span>
            </div>
          )}
          {error && <div className="text-red-600 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
          <div>
            <Label>操作人 *</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="输入用户名" className="mt-1" autoFocus />
          </div>
          <div>
            <Label>修改原因 *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="简要说明修改原因" className="mt-1"
              onKeyDown={(e) => { if (e.key === "Enter" && username && reason) handleConfirm(); }} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel} disabled={saving}>取消</Button>
          <Button onClick={handleConfirm} disabled={saving || !username.trim() || !reason.trim()}>
            {saving ? "提交中..." : "确认修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
