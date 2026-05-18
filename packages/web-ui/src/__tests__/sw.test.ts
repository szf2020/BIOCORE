/**
 * SP-FX-44: Service Worker 单测
 *
 * 通过模拟 caches API + fetch，直接测试 sw.js 的路由判断与策略函数。
 * 策略函数在测试文件中复制（保持与 public/sw.js 同步），
 * 并通过 Mock 注入 cachesApi + fetchImpl 实现白盒测试。
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Mock Cache API ─────────────────────────────────────────────────────────

function makeMockCache() {
  const store = new Map<string, Response>();
  return {
    add: vi.fn(async (url: string) => {
      store.set(url, new Response('offline', { status: 200 }));
    }),
    put: vi.fn(async (req: Request | string, res: Response) => {
      const key = typeof req === 'string' ? req : req.url;
      store.set(key, res.clone());
    }),
    match: vi.fn(async (req: Request | string) => {
      const key = typeof req === 'string' ? req : req.url;
      return store.get(key) ?? undefined;
    }),
    delete: vi.fn(async () => true),
    _store: store,
  };
}

function makeMockCaches() {
  const cacheMap = new Map<string, ReturnType<typeof makeMockCache>>();
  return {
    open: vi.fn(async (name: string) => {
      if (!cacheMap.has(name)) cacheMap.set(name, makeMockCache());
      return cacheMap.get(name)!;
    }),
    match: vi.fn(async (req: Request | string, opts?: { cacheName?: string }) => {
      if (opts?.cacheName && cacheMap.has(opts.cacheName)) {
        return cacheMap.get(opts.cacheName)!.match(req);
      }
      for (const cache of cacheMap.values()) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      return undefined;
    }),
    keys: vi.fn(async () => [...cacheMap.keys()]),
    delete: vi.fn(async (name: string) => cacheMap.delete(name)),
    _cacheMap: cacheMap,
  };
}

type MockCaches = ReturnType<typeof makeMockCaches>;

// ─── SW 路由判断函数 (与 public/sw.js 保持同步) ──────────────────────────────

const STATIC_PATTERNS = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /^\/scada-shapes\//,
];
const STATIC_EXTENSIONS = /\.(js|css|woff2|woff|ttf|otf|png|jpg|jpeg|svg|ico|webp)$/i;
const API_CACHEABLE_PATTERNS = [
  /^\/api\/v1\/scada\/views/,
  /^\/api\/v1\/scada\/projects/,
];
const NEVER_CACHE_PATTERNS = [
  /^\/api\/v1\/auth\//,
  /^\/admin\//,
];
const API_TIMEOUT_MS = 5000;
const CACHE_STATIC = 'biocore-static-v1';
const CACHE_API = 'biocore-api-v1';
const CACHE_OFFLINE = 'biocore-offline-v1';
const OFFLINE_URL = '/offline';

function isStaticRequest(pathname: string): boolean {
  return STATIC_PATTERNS.some(p => p.test(pathname)) || STATIC_EXTENSIONS.test(pathname);
}

function isApiCacheable(pathname: string): boolean {
  return API_CACHEABLE_PATTERNS.some(p => p.test(pathname));
}

function isNeverCache(pathname: string): boolean {
  return NEVER_CACHE_PATTERNS.some(p => p.test(pathname));
}

async function cacheFirstStatic(
  request: Request,
  cachesApi: MockCaches,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const cached = await cachesApi.match(request);
  if (cached) return cached;
  try {
    const response = await fetchImpl(request);
    if (response.ok) {
      const cache = await cachesApi.open(CACHE_STATIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Resource unavailable offline', { status: 503 });
  }
}

async function networkFirstApi(
  request: Request,
  cachesApi: MockCaches,
  fetchImpl: typeof fetch,
  timeoutMs = API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(request);
    clearTimeout(timeoutId);
    if (response.ok) {
      const cache = await cachesApi.open(CACHE_API);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    clearTimeout(timeoutId);
    const cached = await cachesApi.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ success: false, error: 'offline', data: null }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function networkFirstNavigate(
  request: Request,
  cachesApi: MockCaches,
  fetchImpl: typeof fetch,
): Promise<Response> {
  try {
    return await fetchImpl(request);
  } catch {
    const offlinePage = await cachesApi.match(OFFLINE_URL, { cacheName: CACHE_OFFLINE });
    if (offlinePage) return offlinePage;
    return new Response('<h1>离线</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SW 路由判断', () => {
  it('静态路径 /_next/static/ 命中', () => {
    expect(isStaticRequest('/_next/static/chunks/main.js')).toBe(true);
  });

  it('静态路径 /icons/ 命中', () => {
    expect(isStaticRequest('/icons/icon-192.png')).toBe(true);
  });

  it('静态扩展名 .css 命中', () => {
    expect(isStaticRequest('/some/path/style.css')).toBe(true);
  });

  it('never-cache — auth endpoint', () => {
    expect(isNeverCache('/api/v1/auth/login')).toBe(true);
  });

  it('never-cache — admin endpoint', () => {
    expect(isNeverCache('/admin/users')).toBe(true);
  });

  it('API 可缓存 — scada views', () => {
    expect(isApiCacheable('/api/v1/scada/views')).toBe(true);
    expect(isApiCacheable('/api/v1/scada/views/abc-123')).toBe(true);
  });

  it('API 可缓存 — scada projects', () => {
    expect(isApiCacheable('/api/v1/scada/projects')).toBe(true);
  });

  it('普通 API 路径不走 cacheable', () => {
    expect(isApiCacheable('/api/v1/reactors')).toBe(false);
  });
});

describe('SW Cache-First 静态策略', () => {
  it('命中 cache → 不发 fetch', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn();
    const req = new Request('https://example.com/_next/static/main.js');
    // 预热 cache
    const cache = await mockCaches.open(CACHE_STATIC);
    await cache.put(req, new Response('cached-content', { status: 200 }));
    mockCaches.match = vi.fn().mockResolvedValue(new Response('cached', { status: 200 }));

    await cacheFirstStatic(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cache miss → 发 fetch + 存入 cache', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn().mockResolvedValue(new Response('fresh', { status: 200 }));
    const req = new Request('https://example.com/_next/static/chunk.js');

    await cacheFirstStatic(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const cache = await mockCaches.open(CACHE_STATIC);
    expect(cache.put).toHaveBeenCalled();
  });

  it('fetch 失败 → 返回 503', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    const req = new Request('https://example.com/_next/static/chunk.js');

    const result = await cacheFirstStatic(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(result.status).toBe(503);
  });
});

describe('SW Network-First API 策略', () => {
  it('网络成功 → 存 cache + 返回 200', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const req = new Request('https://example.com/api/v1/scada/views');

    const result = await networkFirstApi(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(result.status).toBe(200);
    const cache = await mockCaches.open(CACHE_API);
    expect(cache.put).toHaveBeenCalled();
  });

  it('网络失败 → fallback cache → 返回 200', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn().mockRejectedValue(new Error('offline'));
    const req = new Request('https://example.com/api/v1/scada/views');
    mockCaches.match = vi.fn().mockResolvedValue(new Response('{"data":[]}', { status: 200 }));

    const result = await networkFirstApi(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(result.status).toBe(200);
  });

  it('网络失败 + 无 cache → 返回 503 JSON', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn().mockRejectedValue(new Error('offline'));
    const req = new Request('https://example.com/api/v1/scada/views');

    const result = await networkFirstApi(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(result.status).toBe(503);
    const body = await result.json();
    expect(body.error).toBe('offline');
  });
});

describe('SW Navigate 策略', () => {
  it('导航成功 → 返回页面', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn().mockResolvedValue(new Response('<html>OK</html>', { status: 200 }));
    const req = new Request('https://example.com/dashboard');

    const result = await networkFirstNavigate(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(result.status).toBe(200);
  });

  it('导航失败 → 返回 offline page (cache hit)', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn().mockRejectedValue(new Error('offline'));
    mockCaches.match = vi.fn().mockResolvedValue(
      new Response('<html>offline page</html>', { status: 200 }),
    );
    const req = new Request('https://example.com/dashboard');

    const result = await networkFirstNavigate(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(result.status).toBe(200);
  });

  it('导航失败 + 无 offline cache → 返回 503 HTML', async () => {
    const mockCaches = makeMockCaches();
    const mockFetch = vi.fn().mockRejectedValue(new Error('offline'));
    const req = new Request('https://example.com/dashboard');

    const result = await networkFirstNavigate(req, mockCaches, mockFetch as unknown as typeof fetch);
    expect(result.status).toBe(503);
    const text = await result.text();
    expect(text).toContain('离线');
  });
});
