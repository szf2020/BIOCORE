// ============================================================
// /settings/api-keys — API Key 管理页
//
// 功能:
// - 列出当前用户创建的 API Keys (不含 raw key)
// - 创建新 Key → 弹出大模态框显示 raw key 一次, 关闭后无法找回
// - 撤销 Key (走 useAudit)
// - 显示 last_used_at 监控使用情况
// ============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Key, Copy, AlertTriangle, Check } from 'lucide-react';
import { useAudit } from '@/hooks/useAudit';
import { apiFetch } from '@/lib/auth';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiKey {
  key_id: string;
  name: string;
  scopes: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked: number;
}

export default function ApiKeysPage() {
  const { t } = useLocale();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const audit = useAudit();

  const fetchKeys = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/api/v1/api-keys`);
      if (res.ok) setKeys(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function doCreate() {
    setCreating(true);
    setError('');
    try {
      const res = await apiFetch(`${API}/api/v1/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || '创建失败'); return; }
      // data 已被 apiFetch 自动 unwrap (来自 v1 路径)
      setCreatedRawKey(data.rawKey);
      setNewKeyName('');
      fetchKeys();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function handleCreate() {
    if (!newKeyName.trim()) { setError('请输入 Key 名称'); return; }
    audit.confirm({
      description: `创建 API Key: ${newKeyName.trim()}`,
      action: 'api_key_create', targetType: 'api_key', targetId: newKeyName.trim(),
      newValue: newKeyName.trim(),
      onConfirm: doCreate,
    });
  }

  async function doRevoke(key: ApiKey) {
    try {
      const res = await apiFetch(`${API}/api/v1/api-keys/${key.key_id}`, { method: 'DELETE' });
      if (res.ok) fetchKeys();
    } catch { /* ignore */ }
  }

  function handleRevoke(key: ApiKey) {
    audit.confirm({
      description: `撤销 API Key: ${key.name} (${key.key_id}) — 撤销后无法恢复, 必须创建新 key`,
      action: 'api_key_revoke', targetType: 'api_key', targetId: key.key_id,
      oldValue: '启用',
      newValue: '已撤销',
      onConfirm: () => doRevoke(key),
    });
  }

  function copyKey() {
    if (!createdRawKey) return;
    navigator.clipboard.writeText(createdRawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeRawKeyDialog() {
    setCreatedRawKey(null);
    setShowCreate(false);
    setCopied(false);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Key className="w-6 h-6" /> API 密钥</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            供 MES 等外部系统调用 biocore 使用的长期 API Keys。注意 raw key 只在创建时显示一次。
          </p>
        </div>
        <Button onClick={() => { setShowCreate(true); setError(''); setNewKeyName(''); }}>
          <Plus className="w-4 h-4 mr-1" /> 创建 API Key
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 bg-white/5">
              <th className="px-4 py-3 text-left">名称</th>
              <th className="px-4 py-3 text-left">Key ID</th>
              <th className="px-4 py-3 text-left">权限范围</th>
              <th className="px-4 py-3 text-left">创建时间</th>
              <th className="px-4 py-3 text-left">最后使用</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.key_id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-sm text-muted-foreground">{k.key_id}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{k.scopes}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{k.created_at}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{k.last_used_at || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge className={k.revoked ? 'bg-gray-500/20 text-gray-400' : 'bg-green-500/20 text-emerald-600'}>
                      {k.revoked ? '已撤销' : '启用'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!k.revoked && (
                      <Button variant="ghost" size="sm" onClick={() => handleRevoke(k)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  暂无 API Key, 点击右上角创建第一个
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 创建 API Key 对话框 */}
      <Dialog open={showCreate && !createdRawKey} onOpenChange={(v) => { if (!v) setShowCreate(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新 API Key</DialogTitle>
            <DialogDescription>
              为 MES 或其他外部系统创建一个长期 API Key。Raw key 将在下一步显示一次, 请立即保存。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {error && <div className="text-red-600 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
            <div>
              <Label>Key 名称 *</Label>
              <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                placeholder="例如: mes-prod / mes-dev / external-bi"
                className="mt-1" autoFocus />
              <p className="text-sm text-muted-foreground mt-1">用于识别此 key 的用途, 撤销时会显示</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={creating}>取消</Button>
            <Button onClick={handleCreate} disabled={creating || !newKeyName.trim()}>
              {creating ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raw Key 显示对话框 (创建成功后) */}
      <Dialog open={!!createdRawKey} onOpenChange={(v) => { if (!v) closeRawKeyDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              API Key 已创建 — 仅显示一次
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-sm text-yellow-200">
              ⚠ 此 raw key 关闭后无法找回。请立即复制并保存到密码管理器或 .env 文件中,
              然后在调用 biocore API 时设置 HTTP header: <code className="text-yellow-300">X-API-Key: {'<raw key>'}</code>
            </div>
            <div>
              <Label>Raw API Key</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input value={createdRawKey || ''} readOnly
                  className="font-mono text-sm"
                  onClick={(e) => (e.target as HTMLInputElement).select()} />
                <Button onClick={copyKey} variant={copied ? 'default' : 'outline'} size="sm">
                  {copied ? <><Check className="w-3.5 h-3.5 mr-1" /> 已复制</> : <><Copy className="w-3.5 h-3.5 mr-1" /> 复制</>}
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              使用示例:
              <pre className="mt-1.5 bg-black/30 p-2 rounded font-mono text-sm overflow-x-auto">{`curl -H "X-API-Key: ${createdRawKey}" http://localhost:3001/api/v1/reactors`}</pre>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={closeRawKeyDialog}>我已保存, 关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {audit.dialog}
    </div>
  );
}
