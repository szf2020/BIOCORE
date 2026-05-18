// ============================================================
// RuleTable — 通知触发规则编辑表 (T42)
//   - 事件类型 → 通道 路由 + 严重度阈值
//   - 全表 PUT 替换语义；本地 dirty 跟踪 + 一键保存
// ============================================================
'use client';

import React, { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/useLocale';

export interface Rule {
  id?: number;
  event_type: string;
  channel_id: string;
  enabled: boolean;
  min_severity: 'info' | 'warn' | 'critical';
}

interface ChannelRef { id: string }

export function RuleTable({
  rules: initial, channels, eventTypes, onSave,
}: {
  rules: Rule[];
  channels: ChannelRef[];
  eventTypes: string[];
  onSave: (rules: Rule[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Rule[]>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 父组件 reload 后同步 draft，并清掉 dirty 标记
  useEffect(() => {
    setDraft(initial);
    setDirty(false);
    setErr(null);
  }, [initial]);

  const update = (idx: number, patch: Partial<Rule>) => {
    setDraft((d) => d.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const add = () => {
    setDraft((d) => [
      ...d,
      {
        event_type: eventTypes[0] ?? 'process_restart',
        channel_id: channels[0]?.id ?? '',
        enabled: true,
        min_severity: 'warn',
      },
    ]);
    setDirty(true);
  };

  const remove = (idx: number) => {
    setDraft((d) => d.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await onSave(draft);
    } catch (e: any) {
      setErr(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const noChannels = channels.length === 0;

  return (
    <div className="bg-card border rounded p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-lg">触发规则</h2>
        <div className="flex gap-2">
          <button
            onClick={add}
            disabled={noChannels}
            className="px-3 py-1 border rounded text-sm hover:bg-muted disabled:opacity-50"
            title={noChannels ? '先创建至少一个通道' : ''}
          >
            + 添加规则
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? '保存中…' : dirty ? '保存改动' : '已保存'}
          </button>
        </div>
      </div>

      {err && (
        <div className="p-2 text-sm text-red-700 bg-red-50 border border-red-300 rounded">
          {err}
        </div>
      )}

      {draft.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          还没有规则。点击「+ 添加规则」开始。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="py-2">事件</th>
              <th>通道</th>
              <th>启用</th>
              <th>严重度阈值</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">
                  <select
                    value={r.event_type}
                    onChange={(e) => update(i, { event_type: e.target.value })}
                    className="border rounded p-1 bg-background"
                  >
                    {/* 兼容服务端历史值 */}
                    {!eventTypes.includes(r.event_type) && (
                      <option value={r.event_type}>{r.event_type}</option>
                    )}
                    {eventTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={r.channel_id}
                    onChange={(e) => update(i, { channel_id: e.target.value })}
                    className="border rounded p-1 bg-background"
                  >
                    {!channels.find((c) => c.id === r.channel_id) && r.channel_id && (
                      <option value={r.channel_id}>{r.channel_id}（缺失）</option>
                    )}
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>{c.id}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) => update(i, { enabled: e.target.checked })}
                  />
                </td>
                <td>
                  <select
                    value={r.min_severity}
                    onChange={(e) => update(i, { min_severity: e.target.value as Rule['min_severity'] })}
                    className="border rounded p-1 bg-background"
                  >
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="critical">critical</option>
                  </select>
                </td>
                <td>
                  <button
                    onClick={() => remove(i)}
                    className="text-red-600 hover:underline"
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
