// ============================================================
// 认证工具 — JWT token 存储 + apiFetch 拦截器
// ============================================================

const TOKEN_KEY = 'biocore_token';
const USER_KEY = 'biocore_user';

export interface AuthUser {
  user_id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'engineer' | 'operator' | 'viewer';
}

// ── token 存储 (localStorage,SSR 安全) ─────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthUser; } catch { return null; }
}

export function setStoredUser(user: AuthUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ── fetch 拦截器核心逻辑 ───────────────────────────────────
// 1. 自动加 Authorization: Bearer {token} (对 biocore API 请求)
// 2. 401 时清 token 并跳 /login
// 3. /api/v1/* 路径返回 {code, msg, data, trace_id} 格式时自动 unwrap data 字段
//    (调用方代码不需要改, 透明适配新旧路径)

const BIOCORE_API_HOST = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function isBiocoreApiUrl(url: string): boolean {
  return url.startsWith(BIOCORE_API_HOST) || url.startsWith('/api/');
}

async function biocoreFetch(originalFetch: typeof fetch, input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string'
    ? input
    : (input instanceof URL ? input.toString() : (input as Request).url);

  // 非 biocore API 请求直接透传 (例如 Next.js 的 RSC payload, Google Fonts 等)
  if (!url || !isBiocoreApiUrl(url)) {
    return originalFetch(input, init);
  }

  // 注入 Authorization header
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await originalFetch(input, { ...init, headers });

  // 401 → 清 token + 跳 /login
  if (res.status === 401 && typeof window !== 'undefined') {
    clearToken();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  // /api/v1/* 路径自动 unwrap: 用 Proxy 拦截 .json() 调用
  if (url.includes('/api/v1/')) {
    return new Proxy(res, {
      get(target, prop) {
        if (prop === 'json') {
          return async () => {
            const body = await target.clone().json();
            if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
              return body.data;
            }
            return body;
          };
        }
        const value = (target as any)[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  return res;
}

// ── apiFetch: 显式调用 (推荐, 用于新代码) ──
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return biocoreFetch(fetch, input, init);
}

// ── 全局 fetch 拦截器 (P2 修复: 让所有旧代码的原生 fetch 自动带 token) ──
// 由 AuthProvider 在浏览器端调用, 只安装一次
let interceptorInstalled = false;
export function installFetchInterceptor(): void {
  if (interceptorInstalled || typeof window === 'undefined') return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => biocoreFetch(originalFetch, input, init || {})) as typeof fetch;
  interceptorInstalled = true;
}
