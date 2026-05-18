// ============================================================
// ChannelManager — 通知通道列表 + 编辑器 modal (T42)
// ============================================================
'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useLocale } from '@/i18n/useLocale';

const TYPES = ['feishu', 'dingtalk', 'telegram', 'webhook'] as const;
export type ChannelType = typeof TYPES[number];

export interface Channel {
  id: string;
  type: ChannelType;
  config: { webhook_url?: string; secret?: string };
  enabled: boolean;
  created_at?: string;
}

async function callApi(url: string, init?: RequestInit): Promise<any> {
  const res = await apiFetch(url, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body: any = await res.json();
      if (body?.message) detail = body.message;
      else if (body?.error) detail = body.error;
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  try {
    const body: any = await res.json();
    return (body && typeof body === 'object' && 'data' in body && 'code' in body) ? body.data : body;
  } catch {
    return null;
  }
}

export function ChannelManager({
  const { t } = useLocale();
  channels, onChange, apiBase,
}: {
  channels: Channel[];
  onChange: () => void;
  apiBase: string;
}) {
  const [editing, setEditing] = useState<Channel | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});

  const handleTest = async (id: string) => {
    setTestStatus((s) => ({ ...s, [id]: '发送中…' }));
    try {
      await callApi(`${apiBase}/api/v1/notifications/channels/${encodeURIComponent(id)}/test`, {
        method: 'POST',
      });
      setTestStatus((s) => ({ ...s, [id]: '✓ 已发送' }));
    } catch (e: any) {
      setTestStatus((s) => ({ ...s, [id]: `✗ ${e?.message ?? '失败'}` }));
    }
    setTimeout(() => {
      setTestStatus((s) => {
        const { [id]: _, ...rest } = s;
        return rest;
      });
    }, 5000);
  };

  const handleDelete = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`删除通道 "${id}"？`)) return;
    try {
      await callApi(`${apiBase}/api/v1/notifications/channels/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      onChange();
    } catch (e: any) {
      window.alert(`删除失败：${e?.message ?? '未知错误'}`);
    }
  };

  return (
    <div className="bg-card border rounded p-4 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-lg">通道</h2>
        <button
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          onClick={() => setEditing({ id: '', type: 'webhook', config: {}, enabled: true })}
        >
          + 新增通道
        </button>
      </div>

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          还没有通道。先创建一个再配置规则。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="py-2">ID</th>
              <th>类型</th>
              <th>启用</th>
              <th>测试</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2 font-mono">{c.id}</td>
                <td>{c.type}</td>
                <td>{c.enabled ? '✓' : '—'}</td>
                <td>
                  <button
                    onClick={() => handleTest(c.id)}
                    className="text-blue-600 hover:underline"
                  >
                    {testStatus[c.id] ?? '发送测试'}
                  </button>
                </td>
                <td className="space-x-2">
                  <button
                    onClick={() => setEditing(c)}
                    className="text-blue-600 hover:underline"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
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

      {editing && (
        <ChannelEditor
          channel={editing}
          isNew={!channels.find((c) => c.id === editing.id)}
          apiBase={apiBase}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChange(); }}
        />
      )}
    </div>
  );
}

function ChannelEditor({
  channel, isNew, apiBase, onClose, onSaved,
}: {
  channel: Channel;
  isNew: boolean;
  apiBase: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [c, setC] = useState<Channel>(channel);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!c.id.trim()) { setErr('ID 不能为空'); return; }
    if (!c.config.webhook_url?.trim()) { setErr('webhook_url 不能为空'); return; }
    setSaving(true);
    setErr(null);
    try {
      await callApi(`${apiBase}/api/v1/notifications/channels/${encodeURIComponent(c.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: c.type, config: c.config, enabled: c.enabled }),
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const needsSecret = c.type === 'dingtalk' || c.type === 'telegram';
  const secretLabel = c.type === 'telegram' ? 'chat_id' : 'sign secret';
  const secretPlaceholder = c.type === 'telegram' ? '例如 -100123456789' : '例如 SECxxxxxx';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card border rounded-lg p-5 w-[28rem] space-y-3 shadow-xl">
        <h3 className="font-bold text-lg">{isNew ? '新建通道' : `编辑 ${c.id}`}</h3>
        {err && <div className="text-sm text-red-600">{err}</div>}

        <label className="block text-sm">
          <span className="text-muted-foreground">ID</span>
          <input
            disabled={!isNew}
            className="w-full border rounded p-2 mt-1 font-mono text-sm disabled:bg-muted"
            placeholder="例如 main_feishu"
            value={c.id}
            onChange={(e) => setC({ ...c, id: e.target.value })}
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted-foreground">类型</span>
          <select
            className="w-full border rounded p-2 mt-1 bg-background"
            value={c.type}
            onChange={(e) => setC({ ...c, type: e.target.value as ChannelType })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-muted-foreground">webhook_url</span>
          <input
            className="w-full border rounded p-2 mt-1 text-sm"
            placeholder="https://..."
            value={c.config.webhook_url ?? ''}
            onChange={(e) => setC({ ...c, config: { ...c.config, webhook_url: e.target.value } })}
          />
        </label>

        {needsSecret && (
          <label className="block text-sm">
            <span className="text-muted-foreground">{secretLabel}</span>
            <input
              className="w-full border rounded p-2 mt-1 text-sm"
              placeholder={secretPlaceholder}
              value={c.config.secret ?? ''}
              onChange={(e) => setC({ ...c, config: { ...c.config, secret: e.target.value } })}
            />
          </label>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={c.enabled}
            onChange={(e) => setC({ ...c, enabled: e.target.checked })}
          />
          启用
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1 text-muted-foreground hover:bg-muted rounded"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
