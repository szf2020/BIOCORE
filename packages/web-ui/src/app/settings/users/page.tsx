'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Users, Pencil } from 'lucide-react';
import { useAudit } from '@/hooks/useAudit';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const ROLES = [
  { value: 'admin', label: '管理员', color: 'bg-red-500/20 text-red-600' },
  { value: 'engineer', label: '工程师', color: 'bg-blue-500/20 text-blue-600' },
  { value: 'operator', label: '操作员', color: 'bg-green-500/20 text-emerald-600' },
  { value: 'viewer', label: '观察者', color: 'bg-gray-500/20 text-gray-400' },
];

interface User {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  is_active: number;
  created_at: string;
  last_login_at: string | null;
}

export default function UsersPage() {
  const { t } = useLocale();
  const [users, setUsers] = useState<User[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', display_name: '', password: '', role: 'operator' });
  const [error, setError] = useState('');
  const audit = useAudit();

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/users`);
      if (res.ok) setUsers(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function doCreate() {
    try {
      const res = await fetch(`${API}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '创建失败'); return; }
      setShowAdd(false);
      setForm({ username: '', display_name: '', password: '', role: 'operator' });
      fetchUsers();
    } catch (e) { setError((e as Error).message); }
  }

  function handleCreate() {
    setError('');
    if (!form.username || !form.display_name || !form.password) { setError('请填写所有必填字段'); return; }
    audit.confirm({
      description: `创建用户 ${form.username} (${ROLES.find(r => r.value === form.role)?.label})`,
      action: 'user_create', targetType: 'user', targetId: form.username,
      newValue: `${form.display_name} / ${form.role}`,
      onConfirm: doCreate,
    });
  }

  async function doUpdate() {
    if (!editUser) return;
    try {
      const body: any = { display_name: form.display_name, role: form.role };
      if (form.password) body.password = form.password;
      const res = await fetch(`${API}/api/users/${editUser.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || '更新失败'); return; }
      setEditUser(null);
      fetchUsers();
    } catch (e) { setError((e as Error).message); }
  }

  function handleUpdate() {
    if (!editUser) return;
    setError('');
    const oldStr = `${editUser.display_name} / ${editUser.role}`;
    const newStr = `${form.display_name} / ${form.role}${form.password ? ' (含密码重置)' : ''}`;
    audit.confirm({
      description: `编辑用户 ${editUser.username}`,
      action: 'user_update', targetType: 'user', targetId: editUser.user_id,
      oldValue: oldStr, newValue: newStr,
      onConfirm: doUpdate,
    });
  }

  async function doDelete(userId: string) {
    await fetch(`${API}/api/users/${userId}`, { method: 'DELETE' });
    fetchUsers();
  }

  function handleDelete(user: User) {
    audit.confirm({
      description: `删除用户 ${user.username} (${user.display_name})`,
      action: 'user_delete', targetType: 'user', targetId: user.user_id,
      oldValue: `${user.display_name} / ${user.role}`,
      onConfirm: () => doDelete(user.user_id),
    });
  }

  async function doToggleActive(user: User) {
    await fetch(`${API}/api/users/${user.user_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: user.is_active ? 0 : 1 }),
    });
    fetchUsers();
  }

  function handleToggleActive(user: User) {
    audit.confirm({
      description: `${user.is_active ? '禁用' : '启用'}用户 ${user.username}`,
      action: 'user_toggle_active', targetType: 'user', targetId: user.user_id,
      oldValue: user.is_active ? '启用' : '禁用',
      newValue: user.is_active ? '禁用' : '启用',
      onConfirm: () => doToggleActive(user),
    });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6" /> 用户管理</h1>
          <p className="text-muted-foreground mt-1">管理系统用户和角色权限 (admin/engineer/operator/viewer)</p>
        </div>
        <Button onClick={() => { setShowAdd(true); setError(''); setForm({ username: '', display_name: '', password: '', role: 'operator' }); }}>
          <Plus className="w-4 h-4 mr-1" /> 添加用户
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 bg-white/5">
              <th className="px-4 py-3 text-left">用户名</th>
              <th className="px-4 py-3 text-left">显示名</th>
              <th className="px-4 py-3 text-left">角色</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3 text-left">最后登录</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {users.map(u => {
                const r = ROLES.find(r => r.value === u.role) || ROLES[3];
                return (
                  <tr key={u.user_id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 font-mono">{u.username}</td>
                    <td className="px-4 py-3">{u.display_name}</td>
                    <td className="px-4 py-3"><Badge className={`text-sm ${r.color}`}>{r.label}</Badge></td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleActive(u)} className="cursor-pointer">
                        <Badge className={u.is_active ? 'bg-green-500/20 text-emerald-600' : 'bg-gray-500/20 text-gray-400'}>
                          {u.is_active ? '启用' : '禁用'}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{u.last_login_at || '从未'}</td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditUser(u); setError('');
                        setForm({ username: u.username, display_name: u.display_name, password: '', role: u.role });
                      }}><Pencil className="w-3.5 h-3.5" /></Button>
                      {u.user_id !== 'admin-001' && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(u)}><Trash2 className="w-3.5 h-3.5 text-red-600" /></Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">暂无用户数据</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 添加用户对话框 */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加用户</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="text-red-600 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
            <div><Label>用户名 *</Label><Input value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="登录用户名" /></div>
            <div><Label>显示名 *</Label><Input value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})} placeholder="显示名称" /></div>
            <div><Label>密码 *</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="登录密码" /></div>
            <div><Label>角色</Label>
              <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>取消</Button>
            <Button onClick={handleCreate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户对话框 */}
      <Dialog open={!!editUser} onOpenChange={open => { if (!open) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑用户: {editUser?.username}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {error && <div className="text-red-600 text-sm bg-red-500/10 p-2 rounded">{error}</div>}
            <div><Label>显示名</Label><Input value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})} /></div>
            <div><Label>新密码 (留空不修改)</Label><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="留空保持不变" /></div>
            <div><Label>角色</Label>
              <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditUser(null)}>取消</Button>
            <Button onClick={handleUpdate}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {audit.dialog}
    </div>
  );
}
