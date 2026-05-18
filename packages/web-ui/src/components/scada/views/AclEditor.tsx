'use client';
// ============================================================
// AclEditor.tsx — 视图 ACL 编辑器 modal (SP-FX-24)
// ============================================================
// Props:
//   viewId          — 目标视图 ID
//   currentAcl      — 当前 ACL { users, roles }
//   currentUserId   — 当前用户 ID
//   currentUserRole — 当前用户角色
//   onClose         — 关闭 modal
//   onSaved         — 保存成功回调
// ============================================================

import React, { useState } from 'react';
import { useLocale } from '@/i18n/useLocale';

const ALL_ROLES = ['admin', 'operator', 'engineer', 'viewer'] as const;

export interface AclData {
  users: string[];
  roles: string[];
}

interface Props {
  viewId: string;
  currentAcl: AclData;
  currentUserId: string;
  currentUserRole: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AclEditor({ viewId, currentAcl, onClose, onSaved }: Props) {
  const { t } = useLocale();
  const [users, setUsers] = useState<string[]>(currentAcl.users);
  const [roles, setRoles] = useState<string[]>(currentAcl.roles);
  const [newUser, setNewUser] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addUser() {
    const trimmed = newUser.trim();
    if (!trimmed || users.includes(trimmed)) return;
    setUsers([...users, trimmed]);
    setNewUser('');
  }

  function removeUser(uid: string) {
    setUsers(users.filter(u => u !== uid));
  }

  function toggleRole(role: string) {
    if (roles.includes(role)) {
      setRoles(roles.filter(r => r !== role));
    } else {
      setRoles([...roles, role]);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/scada/views/${viewId}/acl`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users, roles }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? t('acl-editor.save'));
        return;
      }
      onSaved();
    } catch {
      setError(t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="acl-editor"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 8,
        padding: 24, minWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('acl-editor.title')}</h3>

        {/* Users 列表 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{t('acl-editor.user')}</div>
          <div style={{ marginBottom: 8 }}>
            {users.map(uid => (
              <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{uid}</span>
                <button
                  data-testid={`remove-user-${uid}`}
                  onClick={() => removeUser(uid)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#dc2626', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              data-testid="acl-user-input"
              value={newUser}
              onChange={e => setNewUser(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addUser(); }}
              placeholder={t('acl-editor.user')}
              style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
            />
            <button
              data-testid="acl-add-user-btn"
              onClick={addUser}
              style={{ padding: '4px 10px', border: '1px solid #3b82f6', borderRadius: 4, background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13 }}
            >
              添加
            </button>
          </div>
        </div>

        {/* Roles 复选框 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{t('acl-editor.role')}</div>
          {ALL_ROLES.map(role => (
            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                data-testid={`role-checkbox-${role}`}
                checked={roles.includes(role)}
                onChange={() => toggleRole(role)}
              />
              {role}
            </label>
          ))}
        </div>

        {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            data-testid="acl-cancel-btn"
            onClick={onClose}
            style={{ padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            取消
          </button>
          <button
            data-testid="acl-save-btn"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '6px 14px', border: 'none', borderRadius: 4, background: saving ? '#93c5fd' : '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13 }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
