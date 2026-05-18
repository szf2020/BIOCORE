// ============================================================
// backup/page.tsx — SP-FX-20 Backup / Restore UI 页面
// ============================================================
// 路由: /scada2/backup
// 功能: 列出备份、触发备份、下载、恢复 (admin only)
// ============================================================

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/scada-engine/dialogs/ConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface BackupFile {
  filename: string;
  size: number;
  mtime: string;
}

// SP-FX-39: Scheduler 状态
interface SchedulerState {
  enabled: boolean;
  intervalHours: number;
  retentionDays: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

// 格式化字节数
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 格式化时间
function formatMtime(mtime: string): string {
  try {
    return new Date(mtime).toLocaleString('zh-CN');
  } catch {
    return mtime;
  }
}

export default function BackupPage() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 恢复确认 dialog 状态
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);

  // SP-FX-39: schedule 状态
  const [schedule, setSchedule] = useState<SchedulerState | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [schedIntervalHours, setSchedIntervalHours] = useState<number>(24);
  const [schedRetentionDays, setSchedRetentionDays] = useState<number>(30);
  const [schedSaving, setSchedSaving] = useState(false);

  // 非 admin 阻断
  if (user && user.role !== 'admin') {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#ef4444' }}>无权限：仅 admin 可访问备份管理页面。</p>
      </div>
    );
  }

  // ─── 加载备份列表 ─────────────────────────────────────────
  const fetchBackups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/admin/backups`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? '加载失败');
        return;
      }
      // v1ResponseWrapper: body.data.backups or body.backups
      const list: BackupFile[] = body?.data?.backups ?? body?.backups ?? [];
      setBackups(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchBackups(); }, [fetchBackups]);

  // SP-FX-39: ─── 加载 schedule 状态 ───────────────────────────
  const fetchSchedule = useCallback(async () => {
    setScheduleError(null);
    try {
      const res = await fetch(`${API}/api/v1/admin/backup/schedule`);
      const body = await res.json();
      if (!res.ok) {
        setScheduleError(body.error ?? '调度未启用');
        return;
      }
      const state = body as SchedulerState;
      setSchedule(state);
      setSchedIntervalHours(state.intervalHours);
      setSchedRetentionDays(state.retentionDays);
    } catch (e) {
      setScheduleError((e as Error).message);
    }
  }, []);

  useEffect(() => { void fetchSchedule(); }, [fetchSchedule]);

  // SP-FX-39: ─── 保存 schedule 设置 ──────────────────────────
  const handleSaveSchedule = useCallback(async () => {
    setSchedSaving(true);
    setScheduleError(null);
    try {
      const res = await fetch(`${API}/api/v1/admin/backup/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalHours: schedIntervalHours, retentionDays: schedRetentionDays }),
      });
      const body = await res.json();
      if (!res.ok) {
        setScheduleError(body.error ?? '保存失败');
        return;
      }
      setSchedule(body as SchedulerState);
      setToast('调度设置已保存');
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setScheduleError((e as Error).message);
    } finally {
      setSchedSaving(false);
    }
  }, [schedIntervalHours, schedRetentionDays]);

  // ─── 立即备份 ─────────────────────────────────────────────
  const handleBackupNow = useCallback(async () => {
    setBacking(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/admin/backup`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? '备份失败');
        return;
      }
      setToast(`备份成功: ${body?.data?.filename ?? body?.filename ?? ''}`);
      await fetchBackups();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBacking(false);
      setTimeout(() => setToast(null), 4000);
    }
  }, [fetchBackups]);

  // ─── 恢复确认 ─────────────────────────────────────────────
  const handleRestoreClick = useCallback((filename: string) => {
    setConfirmTarget(filename);
    setConfirmOpen(true);
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    if (!confirmTarget) return;
    setConfirmOpen(false);
    setRestoring(true);
    setError(null);
    try {
      // 先下载备份文件内容，再以 multipart 上传到 restore endpoint
      const downloadRes = await fetch(`${API}/api/v1/admin/backups/${encodeURIComponent(confirmTarget)}`);
      if (!downloadRes.ok) {
        setError('获取备份文件失败');
        return;
      }
      const blob = await downloadRes.blob();
      const formData = new FormData();
      formData.append('file', blob, confirmTarget);

      const res = await fetch(`${API}/api/v1/admin/restore`, {
        method: 'POST',
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? '恢复失败');
        return;
      }
      setToast('恢复成功，请重启 server 使更改生效');
      await fetchBackups();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(false);
      setConfirmTarget(null);
      setTimeout(() => setToast(null), 6000);
    }
  }, [confirmTarget, fetchBackups]);

  // ─── 渲染 ─────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>数据库备份与恢复</h2>
        <button
          type="button"
          onClick={handleBackupNow}
          disabled={backing || restoring}
          style={{
            padding: '8px 16px',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: backing ? 'not-allowed' : 'pointer',
            opacity: backing ? 0.7 : 1,
          }}
        >
          {backing ? '备份中…' : '立即备份'}
        </button>
      </div>

      {/* Toast 通知 */}
      {toast && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 4, color: '#065f46', fontSize: 14 }}>
          {toast}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, color: '#991b1b', fontSize: 14 }}>
          错误: {error}
        </div>
      )}

      {/* 备份列表 */}
      {loading ? (
        <p style={{ color: '#6b7280' }}>加载中…</p>
      ) : backups.length === 0 ? (
        <p style={{ color: '#6b7280' }}>暂无备份</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>文件名</th>
              <th style={{ padding: '8px 12px' }}>大小</th>
              <th style={{ padding: '8px 12px' }}>时间</th>
              <th style={{ padding: '8px 12px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.filename} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{b.filename}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{formatBytes(b.size)}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{formatMtime(b.mtime)}</td>
                <td style={{ padding: '8px 12px', display: 'flex', gap: 8 }}>
                  {/* 下载 */}
                  <a
                    href={`${API}/api/v1/admin/backups/${encodeURIComponent(b.filename)}`}
                    download={b.filename}
                    style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, textDecoration: 'none', color: '#374151', fontSize: 13 }}
                  >
                    下载
                  </a>
                  {/* 恢复 */}
                  <button
                    type="button"
                    disabled={restoring}
                    onClick={() => handleRestoreClick(b.filename)}
                    style={{
                      padding: '4px 10px',
                      background: '#fff7ed',
                      border: '1px solid #fb923c',
                      borderRadius: 4,
                      color: '#c2410c',
                      fontSize: 13,
                      cursor: restoring ? 'not-allowed' : 'pointer',
                      opacity: restoring ? 0.6 : 1,
                    }}
                  >
                    恢复
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 恢复确认 Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="确认恢复数据库?"
        message={`即将使用备份 "${confirmTarget}" 恢复数据库。此操作不可撤销，恢复后需重启 server。`}
        confirmLabel="确认恢复"
        cancelLabel="取消"
        danger
        onConfirm={handleRestoreConfirm}
        onCancel={() => { setConfirmOpen(false); setConfirmTarget(null); }}
      />

      {/* SP-FX-39: 自动备份调度 Section */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>自动备份调度</h3>

        {scheduleError ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>{scheduleError}</p>
        ) : schedule ? (
          <>
            <div style={{ fontSize: 14, marginBottom: 12, color: '#374151' }}>
              <span>状态: <strong>{schedule.enabled ? '运行中' : '已停止'}</strong></span>
              {schedule.lastRunAt && (
                <span style={{ marginLeft: 16 }}>
                  上次运行: {new Date(schedule.lastRunAt).toLocaleString('zh-CN')}
                </span>
              )}
              {schedule.nextRunAt && (
                <span style={{ marginLeft: 16 }}>
                  下次运行: {new Date(schedule.nextRunAt).toLocaleString('zh-CN')}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                间隔 (小时):
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={schedIntervalHours}
                  onChange={e => setSchedIntervalHours(Number(e.target.value))}
                  style={{ width: 70, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14 }}
                />
              </label>
              <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                保留天数:
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={schedRetentionDays}
                  onChange={e => setSchedRetentionDays(Number(e.target.value))}
                  style={{ width: 70, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14 }}
                />
              </label>
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={schedSaving}
                style={{
                  padding: '6px 14px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: schedSaving ? 'not-allowed' : 'pointer',
                  opacity: schedSaving ? 0.7 : 1,
                  fontSize: 14,
                }}
              >
                {schedSaving ? '保存中…' : '保存调度设置'}
              </button>
            </div>
          </>
        ) : (
          <p style={{ color: '#6b7280', fontSize: 14 }}>加载调度信息中…</p>
        )}
      </div>
    </div>
  );
}
