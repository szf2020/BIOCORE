// 权限管理页 — 精细 RBAC 矩阵编辑 (F5)
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Plus, Trash2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Permission {
  id: number;
  role: string;
  resource: string;
  action: string;
  allowed: number;
}

const ROLES = ['engineer', 'operator', 'viewer'] as const;
const ROLE_LABELS: Record<string, string> = {
  admin: '管理员', engineer: '工程师', operator: '操作员', viewer: '观察者',
};

const RESOURCES = [
  'reactor:*', 'batch:*', 'recipe:*', 'calibration:*', 'user:*',
];
const ACTIONS = [
  'read', 'start_batch', 'stop_batch', 'hold_batch',
  'add_sample', 'edit_recipe', 'approve_recipe', 'calibrate', 'manage_users',
];
const ACTION_LABELS: Record<string, string> = {
  read: '只读', start_batch: '启动批次', stop_batch: '停止批次', hold_batch: '保持/暂停',
  add_sample: '添加取样', edit_recipe: '编辑配方', approve_recipe: '审批配方',
  calibrate: '传感器校准', manage_users: '用户管理',
};

export default function PermissionsPage() {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API}/api/v1/permissions`);
      if (r.ok) {
        const data = await r.json();
        setPerms(Array.isArray(data) ? data : (data?.data ?? []));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 检查某 role+resource+action 是否已启用
  const isAllowed = (role: string, resource: string, action: string): boolean => {
    return perms.some(p => p.role === role && p.resource === resource && p.action === action && p.allowed === 1);
  };

  // 切换权限
  const toggle = async (role: string, resource: string, action: string) => {
    const current = isAllowed(role, resource, action);
    await apiFetch(`${API}/api/v1/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, resource, action, allowed: current ? 0 : 1 }),
    });
    await load();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" /> 权限管理
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          按角色/资源/操作分配权限 · admin 角色拥有全部权限 (不可编辑)
        </p>
      </div>

      {loading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1" />加载中...
        </CardContent></Card>
      ) : (
        RESOURCES.map(resource => (
          <Card key={resource}>
            <CardContent className="p-4">
              <div className="text-sm font-semibold mb-3 font-mono">{resource}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1 px-2 text-muted-foreground w-24">操作</th>
                      {ROLES.map(role => (
                        <th key={role} className="text-center py-1 px-2 text-muted-foreground w-24">
                          {ROLE_LABELS[role]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ACTIONS.map(action => (
                      <tr key={action} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="py-1.5 px-2 text-muted-foreground">
                          {ACTION_LABELS[action] || action}
                        </td>
                        {ROLES.map(role => {
                          const on = isAllowed(role, resource, action);
                          return (
                            <td key={role} className="text-center py-1.5 px-2">
                              <button
                                onClick={() => toggle(role, resource, action)}
                                className={`w-6 h-6 rounded border text-xs font-bold transition-colors ${
                                  on
                                    ? 'bg-green-500/20 border-green-500/50 text-emerald-600'
                                    : 'bg-muted/30 border-border text-muted-foreground/40 hover:border-muted-foreground/60'
                                }`}
                                title={on ? '已授权 — 点击撤销' : '未授权 — 点击授权'}
                              >
                                {on ? '✓' : '—'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
