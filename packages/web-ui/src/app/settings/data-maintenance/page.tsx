'use client';

import React, { useState, useEffect } from 'react';
import { useAudit } from '@/hooks/useAudit';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface MaintenanceConfig {
  auto_backup: boolean;
  backup_interval_h: number;
  retention_days: number;
  log_cleanup_days: number;
}

export default function DataMaintenancePage() {
  const { t } = useLocale();
  const [config, setConfig] = useState<MaintenanceConfig>({
    auto_backup: false,
    backup_interval_h: 24,
    retention_days: 365,
    log_cleanup_days: 90,
  });
  const [originalConfig, setOriginalConfig] = useState<MaintenanceConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState('');
  const audit = useAudit();

  useEffect(() => {
    fetch(`${API}/api/settings/data-maintenance`).then(r => r.json()).then(c => { setConfig(c); setOriginalConfig(c); }).catch(() => {});
  }, []);

  const summarize = (c: MaintenanceConfig) =>
    `自动备份:${c.auto_backup ? '开' : '关'}/间隔${c.backup_interval_h}h/保留${c.retention_days}天/日志${c.log_cleanup_days}天`;

  const doSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`${API}/api/settings/data-maintenance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) { setSaved(true); setOriginalConfig(config); }
    } finally { setSaving(false); }
  };

  const handleSave = () => {
    audit.confirm({
      description: '更新数据维护配置 (备份/保留策略)',
      action: 'maintenance_config_update', targetType: 'settings', targetId: 'data-maintenance',
      oldValue: originalConfig ? summarize(originalConfig) : undefined,
      newValue: summarize(config),
      onConfirm: doSave,
    });
  };

  const doBackupNow = async () => {
    setBackingUp(true);
    setBackupResult('');
    try {
      const res = await fetch(`${API}/api/settings/data-maintenance/backup`, { method: 'POST' });
      const data = await res.json();
      if (data.success) setBackupResult(`备份成功: ${data.path}`);
      else setBackupResult(`备份失败: ${data.error}`);
    } catch (e) {
      setBackupResult(`备份失败: ${(e as Error).message}`);
    } finally { setBackingUp(false); }
  };

  const handleBackupNow = () => {
    audit.confirm({
      description: '立即创建 SQLite 数据库完整备份',
      action: 'maintenance_backup', targetType: 'database', targetId: 'sqlite',
      newValue: '手动触发备份',
      onConfirm: doBackupNow,
    });
  };

  const doCleanup = async () => {
    setCleaning(true);
    setCleanResult('');
    try {
      const res = await fetch(`${API}/api/settings/data-maintenance/cleanup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: config.log_cleanup_days }),
      });
      const data = await res.json();
      if (data.success) setCleanResult(`清理完成: 删除 ${data.transitions_deleted} 条状态记录, ${data.steps_deleted} 条步骤记录`);
    } catch (e) {
      setCleanResult(`清理失败: ${(e as Error).message}`);
    } finally { setCleaning(false); }
  };

  const handleCleanup = () => {
    audit.confirm({
      description: `清理 ${config.log_cleanup_days} 天前的历史日志 — 此操作不可撤销 (audit_logs 不受影响)`,
      action: 'maintenance_log_cleanup', targetType: 'database', targetId: 'sqlite',
      newValue: `删除 ${config.log_cleanup_days} 天前的 state_transitions 和 step_logs`,
      onConfirm: doCleanup,
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">数据维护</h1>
      <p className="text-sm text-muted-foreground mb-6">管理数据备份、保留策略和日志清理</p>

      <div className="space-y-6">
        {/* 手动备份 */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold mb-2">手动备份</h2>
          <p className="text-sm text-muted-foreground mb-3">创建SQLite数据库完整备份到 data/backups/</p>
          <button onClick={handleBackupNow} disabled={backingUp}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[#1677ff] text-white hover:bg-[#1677ff]/80 disabled:opacity-50">
            {backingUp ? '备份中...' : '立即备份'}
          </button>
          {backupResult && <p className={`text-sm mt-2 ${backupResult.includes('成功') ? 'text-emerald-600' : 'text-red-600'}`}>{backupResult}</p>}
        </div>

        {/* 自动备份 */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input id="autoBackup" type="checkbox" checked={config.auto_backup}
              onChange={e => setConfig({ ...config, auto_backup: e.target.checked })} className="rounded" />
            <label className="text-sm font-medium" htmlFor="autoBackup">启用自动备份</label>
          </div>
          {config.auto_backup && (
            <div className="ml-6 space-y-2">
              <label className="text-sm text-muted-foreground">备份间隔 (小时)</label>
              <input type="number" min={1} max={168} value={config.backup_interval_h}
                onChange={e => setConfig({ ...config, backup_interval_h: Number(e.target.value) })}
                className="w-32 px-3 py-2 text-sm rounded-md border border-white/10 bg-white/5" />
            </div>
          )}
        </div>

        {/* 数据保留 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">原始数据保留天数 (InfluxDB)</label>
          <input type="number" min={30} max={3650} value={config.retention_days}
            onChange={e => setConfig({ ...config, retention_days: Number(e.target.value) })}
            className="w-32 px-3 py-2 text-sm rounded-md border border-white/10 bg-white/5" />
          <p className="text-sm text-muted-foreground">1分钟分辨率数据的保留期，过期后自动降采样归档</p>
        </div>

        {/* 日志清理 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">日志清理天数 (SQLite)</label>
          <input type="number" min={7} max={365} value={config.log_cleanup_days}
            onChange={e => setConfig({ ...config, log_cleanup_days: Number(e.target.value) })}
            className="w-32 px-3 py-2 text-sm rounded-md border border-white/10 bg-white/5" />
          <p className="text-sm text-muted-foreground">清理已完成批次的state_transitions和step_logs (audit_logs不受影响)</p>
          <button onClick={handleCleanup} disabled={cleaning}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-red-500/30 text-red-600 hover:bg-red-500/10 disabled:opacity-50">
            {cleaning ? '清理中...' : `清理 ${config.log_cleanup_days} 天前的日志`}
          </button>
          {cleanResult && <p className={`text-sm ${cleanResult.includes('完成') ? 'text-emerald-600' : 'text-red-600'}`}>{cleanResult}</p>}
        </div>

        {/* 保存 */}
        <div className="flex items-center gap-3 pt-4 border-t border-white/10">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[#1677ff] text-white hover:bg-[#1677ff]/80 disabled:opacity-50">
            {saving ? '保存中...' : '保存配置'}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ 已保存</span>}
        </div>
      </div>

      {audit.dialog}
    </div>
  );
}
