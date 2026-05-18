'use client';
// ============================================================
// audit-log/page.tsx — 管理员审计日志查看页 (SP-FX-19)
// ============================================================
// 仅 admin 角色可访问.
// 列出 audit_log 最近记录, 支持 userId / resourceType 过滤 + 分页.
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/i18n/useLocale';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 20;

interface AuditRow {
  id: number;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip: string | null;
  timestamp: string;
}

const RESOURCE_TYPES = ['batches', 'recipes', 'views', 'users', 'scada', 'permissions'];

export default function AuditLogPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [userId, setUserId] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (userId) params.set('userId', userId);
    if (resourceType) params.set('resourceType', resourceType);
    const url = `${API_BASE}/api/v1/audit-log?${params}`;
    fetch(url)
      .then(r => r.json())
      .then((data: AuditRow[]) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [userId, resourceType, page]);

  useEffect(() => {
    if (user?.role === 'admin') fetchLogs();
  }, [user, fetchLogs]);

  // 角色检查
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
      <h2 style={{ margin: '0 0 12px' }}>用户操作审计日志</h2>

      {/* 过滤器 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="用户ID 过滤"
          value={userId}
          onChange={e => { setUserId(e.target.value); setPage(0); }}
          style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, minWidth: 160 }}
        />
        <select
          value={resourceType}
          onChange={e => { setResourceType(e.target.value); setPage(0); }}
          style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4 }}
        >
          <option value="">全部资源类型</option>
          {RESOURCE_TYPES.map(rt => (
            <option key={rt} value={rt}>{rt}</option>
          ))}
        </select>
      </div>

      {/* 表格 */}
      {loading ? (
        <p style={{ color: '#6b7280' }}>加载中…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>时间</th>
              <th style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>用户</th>
              <th style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>操作</th>
              <th style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>资源类型</th>
              <th style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>资源ID</th>
              <th style={{ padding: '6px 8px', borderBottom: '1px solid #e5e7eb' }}>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '5px 8px', color: '#6b7280', whiteSpace: 'nowrap' }}>{row.timestamp}</td>
                <td style={{ padding: '5px 8px' }}>{row.user_id ?? '—'}</td>
                <td style={{ padding: '5px 8px', fontWeight: 500 }}>{row.action}</td>
                <td style={{ padding: '5px 8px' }}>{row.resource_type}</td>
                <td style={{ padding: '5px 8px', color: '#6b7280' }}>{row.resource_id ?? '—'}</td>
                <td style={{ padding: '5px 8px', color: '#6b7280' }}>{row.ip ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>暂无记录</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* 分页 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          style={{ padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: 4, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}
        >上一页</button>
        <span style={{ color: '#6b7280', fontSize: 13 }}>第 {page + 1} 页</span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={rows.length < PAGE_SIZE}
          style={{ padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: 4, cursor: rows.length < PAGE_SIZE ? 'default' : 'pointer', opacity: rows.length < PAGE_SIZE ? 0.5 : 1 }}
        >下一页</button>
      </div>
    </div>
  );
}
