// ============================================================
// useAuth — 认证状态 hook
// 提供 user/login/logout/loading,Provider 包在顶层
// ============================================================

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  AuthUser, getToken, setToken, clearToken, getStoredUser, setStoredUser, apiFetch, installFetchInterceptor,
} from '@/lib/auth';

// 浏览器端立即安装全局 fetch 拦截器, 让所有原生 fetch() 调用自动带 Authorization header + v1 unwrap
if (typeof window !== 'undefined') {
  installFetchInterceptor();
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // 启动时:有 token 则验证,无 token 直接结束 loading
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    // 用 stored user 立即水合,避免 UI 闪烁
    const stored = getStoredUser();
    if (stored) setUser(stored);
    // 后台验证 token 是否仍有效
    apiFetch(`${API}/api/auth/me`)
      .then(r => r.ok ? r.json() : null)
      .then((data: AuthUser | null) => {
        if (data) {
          setUser(data);
          setStoredUser(data);
        } else {
          clearToken();
          setUser(null);
        }
      })
      .catch(() => { /* network err - 保留 stored user */ })
      .finally(() => setLoading(false));
  }, []);
  // 路由守卫由 AppLayout 处理 (避免 setState during render 警告)

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || '登录失败' };
      setToken(data.token);
      setStoredUser(data.user);
      setUser(data.user);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message || '网络错误' };
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
