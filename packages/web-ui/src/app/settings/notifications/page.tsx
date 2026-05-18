// ============================================================
// /settings/notifications — 通知通道与规则管理 (T42)
//   - ChannelManager: 飞书 / 钉钉 / Telegram / 通用 webhook 通道 CRUD + 测试
//   - RuleTable: 事件 → 通道 路由表，规则改动立即生效（不需要重启）
// ============================================================
'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { ChannelManager, type Channel } from '@/components/notifications/ChannelManager';
import { RuleTable, type Rule } from '@/components/notifications/RuleTable';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: any = await res.json();
  // /api/v1/* 经过 apiFetch 拦截器自动 unwrap, 但兜底再剥一层 {data}
  return (body && typeof body === 'object' && 'data' in body && 'code' in body) ? body.data : body;
}

export default function NotificationsSettingsPage() {
  const { t } = useLocale();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      const [a, b] = await Promise.all([
        fetchJson<{ channels: Channel[] }>(`${API}/api/v1/notifications/channels`),
        fetchJson<{ rules: Rule[]; available_event_types: string[] }>(`${API}/api/v1/notifications/rules`),
      ]);
      setChannels(Array.isArray(a?.channels) ? a.channels : []);
      setRules(Array.isArray(b?.rules) ? b.rules : []);
      setEventTypes(Array.isArray(b?.available_event_types) ? b.available_event_types : []);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">通知设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置通道（飞书 / 钉钉 / Telegram / 通用 webhook）+ 触发规则。规则改动立即生效，无需重启。
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">加载中…</div>
      ) : (
        <>
          <ChannelManager channels={channels} onChange={reload} apiBase={API} />
          <RuleTable
            rules={rules}
            channels={channels}
            eventTypes={eventTypes}
            onSave={async (next) => {
              await fetchJson(`${API}/api/v1/notifications/rules`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rules: next }),
              });
              await reload();
            }}
          />
        </>
      )}
    </div>
  );
}
