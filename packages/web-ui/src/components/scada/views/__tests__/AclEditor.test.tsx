// ============================================================
// AclEditor.test.tsx — ACL 编辑器组件测试 (SP-FX-24)
// ============================================================
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AclEditor } from '../AclEditor';

const defaultAcl = { users: ['u_alice'], roles: ['admin', 'operator'] };

describe('AclEditor', () => {
  it('渲染现有 users 列表', () => {
    render(
      <AclEditor
        viewId="v1"
        currentAcl={defaultAcl}
        currentUserId="u_admin"
        currentUserRole="admin"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByText('u_alice')).toBeTruthy();
  });

  it('渲染 roles 复选框', () => {
    render(
      <AclEditor
        viewId="v1"
        currentAcl={defaultAcl}
        currentUserId="u_admin"
        currentUserRole="admin"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    const adminCheckbox = screen.getByTestId('role-checkbox-admin') as HTMLInputElement;
    const operatorCheckbox = screen.getByTestId('role-checkbox-operator') as HTMLInputElement;
    expect(adminCheckbox.checked).toBe(true);
    expect(operatorCheckbox.checked).toBe(true);
  });

  it('点击 Cancel 调用 onClose', () => {
    const onClose = vi.fn();
    render(
      <AclEditor
        viewId="v1"
        currentAcl={defaultAcl}
        currentUserId="u_admin"
        currentUserRole="admin"
        onClose={onClose}
        onSaved={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('acl-cancel-btn'));
    expect(onClose).toHaveBeenCalled();
  });

  it('切换 role 复选框更新状态', () => {
    render(
      <AclEditor
        viewId="v1"
        currentAcl={{ users: [], roles: ['admin'] }}
        currentUserId="u_admin"
        currentUserRole="admin"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    const operatorCheckbox = screen.getByTestId('role-checkbox-operator') as HTMLInputElement;
    expect(operatorCheckbox.checked).toBe(false);
    fireEvent.click(operatorCheckbox);
    expect(operatorCheckbox.checked).toBe(true);
  });

  it('添加 user 到列表', () => {
    render(
      <AclEditor
        viewId="v1"
        currentAcl={{ users: [], roles: ['admin'] }}
        currentUserId="u_admin"
        currentUserRole="admin"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    const input = screen.getByTestId('acl-user-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'u_bob' } });
    fireEvent.click(screen.getByTestId('acl-add-user-btn'));
    expect(screen.getByText('u_bob')).toBeTruthy();
  });

  it('Save 按钮调用 fetch PATCH 并触发 onSaved', async () => {
    const onSaved = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as any);

    render(
      <AclEditor
        viewId="v1"
        currentAcl={defaultAcl}
        currentUserId="u_admin"
        currentUserRole="admin"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    fireEvent.click(screen.getByTestId('acl-save-btn'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/scada/views/v1/acl',
        expect.objectContaining({ method: 'PATCH' }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('删除 user 从列表', () => {
    render(
      <AclEditor
        viewId="v1"
        currentAcl={{ users: ['u_alice', 'u_bob'], roles: ['admin'] }}
        currentUserId="u_admin"
        currentUserRole="admin"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    const removeBtn = screen.getByTestId('remove-user-u_alice');
    fireEvent.click(removeBtn);
    expect(screen.queryByText('u_alice')).toBeNull();
    expect(screen.getByText('u_bob')).toBeTruthy();
  });
});
