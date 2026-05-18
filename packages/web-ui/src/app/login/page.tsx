// ============================================================
// /login — JWT 登录页
// ============================================================

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Activity, LogIn, AlertCircle } from 'lucide-react';
import { useLocale } from '@/i18n/useLocale';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const { t } = useLocale();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 已登录用户访问 /login 直接跳转 dashboard
  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError(t('login.error-empty'));
      return;
    }
    setSubmitting(true);
    const result = await login(username.trim(), password);
    setSubmitting(false);
    if (result.ok) {
      router.replace('/dashboard');
    } else {
      setError(result.error || t('login.error-failed'));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg shadow-2xl p-8">
        {/* Logo & 标题 */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <Activity className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">BIOCore</h1>
        </div>
        <p className="text-center text-sm text-muted-foreground mb-6 font-mono">
          v0.1.0 | {t('login.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">{t('login.username')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              className="w-full h-10 px-3 rounded bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full h-10 px-3 rounded bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 h-10 rounded text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-border text-center">
          <p className="text-[12px] text-muted-foreground">
            {t('login.hint')} <span className="font-mono text-foreground">admin / admin123</span>
          </p>
        </div>
      </div>
    </div>
  );
}
