'use client';
// ============================================================
// analytics/page.tsx — Analytics Dashboard (SP-FX-43)
// ============================================================
// admin only. 4 panel:
//   1. View Usage — table (view_id | access_count)
//   2. Widget Types — table (type | count)
//   3. User Activity — DAU 柱状图 + WAU summary
//   4. Write-Intent Stats — accept/reject 数字 + reject_reasons table
// ============================================================

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Range = '7d' | '30d' | '90d';

interface ViewUsageRow {
  view_id: string;
  access_count: number;
}

interface WidgetTypeRow {
  type: string;
  count: number;
}

interface DauRow {
  day: string;
  dau: number;
}

interface WauRow {
  week: string;
  wau: number;
}

interface RejectReasonRow {
  reason: string;
  count: number;
}

interface WriteIntentData {
  accept_count: number;
  reject_count: number;
  accept_rate: number;
  reject_reasons: RejectReasonRow[];
}

// ── 样式常量 ─────────────────────────────────────────────────

const PANEL_STYLE: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  background: '#fff',
};

const TABLE_STYLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const TH_STYLE: React.CSSProperties = {
  padding: '6px 8px',
  background: '#f9fafb',
  borderBottom: '1px solid #e5e7eb',
  textAlign: 'left',
  fontWeight: 600,
  color: '#374151',
};

const TD_STYLE: React.CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid #f3f4f6',
  color: '#1f2937',
};

const PANEL_TITLE_STYLE: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 15,
  fontWeight: 600,
  color: '#111827',
};

// ── Panel Components ──────────────────────────────────────────

function ViewUsagePanel({ range }: { range: Range }) {
  const [data, setData] = useState<ViewUsageRow[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/analytics/view-usage?range=${range}`)
      .then(r => r.json())
      .then((d: { data?: ViewUsageRow[] }) => setData(Array.isArray(d.data) ? d.data : []))
      .catch(() => setData([]));
  }, [range]);

  return (
    <div style={PANEL_STYLE}>
      <h3 style={PANEL_TITLE_STYLE}>View Usage — 画面访问排名</h3>
      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <th style={TH_STYLE}>View ID</th>
            <th style={TH_STYLE}>访问次数</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.view_id}>
              <td style={TD_STYLE}>{row.view_id}</td>
              <td style={TD_STYLE}>{row.access_count}</td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td style={TD_STYLE} colSpan={2}>暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WidgetTypesPanel({ range }: { range: Range }) {
  const [data, setData] = useState<WidgetTypeRow[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/analytics/widget-types?range=${range}`)
      .then(r => r.json())
      .then((d: { data?: WidgetTypeRow[] }) => setData(Array.isArray(d.data) ? d.data : []))
      .catch(() => setData([]));
  }, [range]);

  return (
    <div style={PANEL_STYLE}>
      <h3 style={PANEL_TITLE_STYLE}>Widget Types — 组件类型频次</h3>
      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <th style={TH_STYLE}>Widget 类型</th>
            <th style={TH_STYLE}>使用次数</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.type}>
              <td style={TD_STYLE}>{row.type}</td>
              <td style={TD_STYLE}>{row.count}</td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td style={TD_STYLE} colSpan={2}>暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function UserActivityPanel({ range }: { range: Range }) {
  const [dau, setDau] = useState<DauRow[]>([]);
  const [wau, setWau] = useState<WauRow[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/analytics/user-activity?range=${range}`)
      .then(r => r.json())
      .then((d: { dau?: DauRow[]; wau?: WauRow[] }) => {
        setDau(Array.isArray(d.dau) ? d.dau : []);
        setWau(Array.isArray(d.wau) ? d.wau : []);
      })
      .catch(() => { setDau([]); setWau([]); });
  }, [range]);

  const maxDauVal = dau.length > 0 ? Math.max(...dau.map(d => d.dau), 1) : 1;

  return (
    <div style={PANEL_STYLE}>
      <h3 style={PANEL_TITLE_STYLE}>User Activity — 用户活跃度</h3>
      <div style={{ marginBottom: 6, fontSize: 13, color: '#6b7280' }}>DAU (每日活跃用户数)</div>
      {dau.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, marginBottom: 12 }}>
          {dau.map(d => (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: '100%',
                  background: '#3b82f6',
                  height: `${Math.round((d.dau / maxDauVal) * 60)}px`,
                  minHeight: 2,
                  borderRadius: 2,
                }}
                title={`${d.day}: ${d.dau}`}
              />
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.day.slice(5)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 12 }}>暂无数据</div>
      )}
      {wau.length > 0 && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          近期 WAU: {wau.at(-1)?.wau ?? 0} 用户/周
        </div>
      )}
    </div>
  );
}

function WriteIntentPanel({ range }: { range: Range }) {
  const [data, setData] = useState<WriteIntentData | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/analytics/write-intent-stats?range=${range}`)
      .then(r => r.json())
      .then((d: WriteIntentData) => setData(d))
      .catch(() => setData(null));
  }, [range]);

  if (!data) {
    return (
      <div style={PANEL_STYLE}>
        <h3 style={PANEL_TITLE_STYLE}>Write-Intent Stats — 写入建议统计</h3>
        <div style={{ color: '#9ca3af', fontSize: 13 }}>加载中…</div>
      </div>
    );
  }

  const acceptPct = data.accept_count + data.reject_count > 0
    ? Math.round(data.accept_rate * 100)
    : 0;

  return (
    <div style={PANEL_STYLE}>
      <h3 style={PANEL_TITLE_STYLE}>Write-Intent Stats — 写入建议统计</h3>
      <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#10b981' }}>{data.accept_count}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>接受</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>{data.reject_count}</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>拒绝</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{acceptPct}%</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>接受率</div>
        </div>
      </div>
      {data.reject_reasons.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 6 }}>拒绝原因分布</div>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <th style={TH_STYLE}>原因</th>
                <th style={TH_STYLE}>次数</th>
              </tr>
            </thead>
            <tbody>
              {data.reject_reasons.map(r => (
                <tr key={r.reason}>
                  <td style={TD_STYLE}>{r.reason}</td>
                  <td style={TD_STYLE}>{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>('7d');

  if (!user || user.role !== 'admin') {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#ef4444', fontWeight: 600 }}>无权访问</p>
        <p style={{ color: '#6b7280' }}>此页面仅管理员可访问。</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#111827' }}>
          Analytics 分析仪表盘
        </h2>
        <select
          value={range}
          onChange={e => setRange(e.target.value as Range)}
          style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
        >
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
          <option value="90d">最近 90 天</option>
        </select>
      </div>

      {/* 2×2 Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ViewUsagePanel range={range} />
        <WidgetTypesPanel range={range} />
        <UserActivityPanel range={range} />
        <WriteIntentPanel range={range} />
      </div>
    </div>
  );
}
