'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { useRealtimeStore } from '@/stores/realtime-store';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/auth';
import {
  LayoutDashboard, LineChart, BookOpen, History,
  Database, Bot, Settings, Wifi, WifiOff, Blocks, ChevronDown,
  Gauge, Users, Bell, User, Activity, Droplets, LogOut, Key, FileText, FlaskConical,
  ShieldCheck, Sigma, Shield, TrendingUp, Brain, Workflow, Building2, Sun, Moon, Monitor,
  ChevronUp,
} from 'lucide-react';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: '监控面板', children: [
    { href: '/dashboard/hmi', icon: Workflow, label: '工艺画面' },
    { href: '/clean', icon: Droplets, label: '清洗灭菌' },
    { href: '/trends', icon: LineChart, label: '趋势图表' },
  ]},
  { href: '/recipes', icon: BookOpen, label: '配方管理', children: [
    { href: '/recipes/review-queue', icon: ShieldCheck, label: '审核队列' },
    { href: '/doe', icon: Sigma, label: 'DoE 实验设计' },
  ]},
  // 原料库提升为一级菜单 — 与配方管理并列, 独立管理原料/试剂/缓冲液主数据
  { href: '/analysis/raw-materials', icon: FlaskConical, label: '原料库' },
  { href: '/analysis', icon: LineChart, label: '数据分析', children: [
    { href: '/batches', icon: History, label: '批次历史' },
    { href: '/explorer', icon: Database, label: '数据浏览' },
    { href: '/analysis/kpi', icon: Gauge, label: 'KPI 仪表盘' },
    { href: '/analysis/spc', icon: TrendingUp, label: 'SPC 控制图' },
    { href: '/analysis/audit-logs', icon: FileText, label: '审计追踪' },
    { href: '/analysis/soft-sensor', icon: Brain, label: '软测量模型' },
  ]},
  { href: '/ai', icon: Bot, label: 'AI助手' },
  { href: '/settings', icon: Settings, label: '系统设置', children: [
    { href: '/settings/site-meta', icon: Building2, label: '站点元数据' },
    { href: '/settings/device-config', icon: Activity, label: '设备配置' },
    { href: '/settings/plc-config', icon: Wifi, label: 'PLC通讯配置' },
    { href: '/settings/phase-templates', icon: Blocks, label: 'Phase模板配置' },
    { href: '/settings/calibration', icon: Gauge, label: '传感器校准' },
    { href: '/settings/formula-config', icon: Activity, label: '公式配置' },
    { href: '/settings/interlock-config', icon: Shield, label: '连锁/故障配置' },
    { href: '/settings/users', icon: Users, label: '用户管理' },
    { href: '/settings/permissions', icon: Shield, label: '权限管理' },
    { href: '/settings/api-keys', icon: Key, label: 'API 密钥' },
    { href: '/settings/ai-config', icon: Bot, label: 'AI配置' },
    { href: '/settings/data-maintenance', icon: Database, label: '数据维护' },
  ]},
];

// 判断父菜单 href 是否对应真实可导航页面 (例如 /dashboard, /analysis 是页面; /settings 也是页面)
// 注: /analysis 是新增的聚合落地页, 需要创建 (或者不创建, 让点击父菜单仅展开子菜单)
const NAVIGABLE_PARENTS = new Set(['/dashboard', '/settings', '/recipes']);

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// 系统级元数据 (面包屑) — 后端 /api/system-config 已合并 db>env>推导, 前端直接渲染返回值
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('zh-CN', { hour12: false }));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="font-mono text-xs text-muted-foreground">{time}</span>;
}

function getStateBadgeClass(state: string): string {
  switch (state) {
    case 'running': return 'mes-badge-running';
    case 'held': return 'mes-badge-held';
    case 'paused': return 'mes-badge-paused';
    case 'stopped': return 'mes-badge-stopped';
    case 'complete': return 'mes-badge-complete';
    default: return 'mes-badge-idle';
  }
}

function getStateLedClass(state: string): string {
  switch (state) {
    case 'running': return 'status-led-running';
    case 'held': return 'status-led-held';
    case 'paused': return 'status-led-paused';
    case 'stopped': return 'status-led-stopped';
    case 'complete': return 'status-led-complete';
    default: return 'status-led-idle';
  }
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  // 用 selector 拿稳定的 state, 不解构 actions (避免 hot reload 时函数引用变化触发 deps 警告)
  const wsConnected = useRealtimeStore(s => s.wsConnected);
  const stateUpdate = useRealtimeStore(s => s.stateUpdate);
  const alarms = useRealtimeStore(s => s.alarms);
  const heartbeatStatus = useRealtimeStore(s => s.heartbeatStatus);
  const [elapsed, setElapsed] = useState(0);
  const isLoginPage = pathname === '/login';

  // 侧栏折叠状态: key = 父菜单 href, value = 是否折叠
  // localStorage 持久化用户偏好
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem('biocore_nav_collapsed');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // 传入 currentCollapsed 代表按钮当前的真实状态 (含默认自动折叠逻辑), 避免从 undefined 取反的 bug
  const toggleCollapsed = useCallback((href: string, currentCollapsed: boolean) => {
    setCollapsed(prev => {
      const next = { ...prev, [href]: !currentCollapsed };
      try { localStorage.setItem('biocore_nav_collapsed', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // 路由守卫: loading 完毕且无 user 时跳 /login (排除 /login 自身)
  useEffect(() => {
    if (authLoading) return;
    if (!user && !isLoginPage) {
      router.replace('/login');
    }
  }, [authLoading, user, isLoginPage, router]);

  // 已登录时才连 WS (登录页不需要), 用 getState 避免 deps 包含函数引用
  useEffect(() => {
    if (user && !isLoginPage) useRealtimeStore.getState().connect();
  }, [user, isLoginPage]);

  // Dev 模式优化: 用户登录后,后台预取所有侧边栏页面 (避免首次点击的按需编译延迟)
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (!user || isLoginPage || prefetchedRef.current) return;
    prefetchedRef.current = true;
    const allHrefs: string[] = [];
    for (const item of NAV_ITEMS) {
      if (!item.children) allHrefs.push(item.href);
      else for (const c of item.children) allHrefs.push(c.href);
    }
    // 立即预取所有导航页面, 减少首次点击的编译/下载延迟
    for (const href of allHrefs) {
      try { router.prefetch(href); } catch { /* ignore */ }
    }
  }, [user, isLoginPage, router]);

  useEffect(() => {
    if (stateUpdate?.batch_elapsed_sec != null) {
      setElapsed(stateUpdate.batch_elapsed_sec);
    }
  }, [stateUpdate?.batch_elapsed_sec]);

  // 面包屑系统元数据 (后端合并 db > env > 自动推导)
  const [siteMeta, setSiteMeta] = useState<{ facility_name: string; line_name: string; reactor_group_name: string } | null>(null);
  useEffect(() => {
    if (!user || isLoginPage) return;
    apiFetch(`${API_BASE}/api/system-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSiteMeta(data); })
      .catch(() => { /* offline OK */ });
  }, [user, isLoginPage]);

  useEffect(() => {
    if (stateUpdate?.state !== 'running') return;
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [stateUpdate?.state]);

  // ── 条件 return (放在所有 hooks 之后) ──
  // ── 条件 return (放在所有 hooks 之后) ──
  if (isLoginPage) {
    return <>{children}</>;
  }
  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-xs text-muted-foreground">{authLoading ? '加载中...' : '正在跳转登录页...'}</div>
      </div>
    );
  }

  const unacknowledgedCount = alarms.filter((a) => !a.acknowledged).length;
  const currentState = stateUpdate?.state || 'idle';

  return (
    <div className="flex h-screen surface-base">
      {/* SideNav — no borders, uses surface-container-low for tonal separation */}
      <nav className="w-[224px] surface-low flex flex-col">
        <div className="px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #0F766E, #005c55)' }}>
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold tracking-tight text-foreground leading-none">BIOCore</h1>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono tracking-wider">v0.1.0 · MES</p>
            </div>
          </div>
        </div>
        <div className="flex-1 px-2 py-1 overflow-y-auto mes-scroll">
          {NAV_ITEMS.map(item => {
            const hasChildren = !!item.children && item.children.length > 0;
            const childActive = item.children?.some(c => pathname === c.href) || false;
            const selfActive = pathname === item.href;
            const isActive = selfActive || childActive;
            const isCollapsed = item.href in collapsed ? collapsed[item.href] : !(selfActive || childActive);
            const parentNavigable = hasChildren && NAVIGABLE_PARENTS.has(item.href);

            return (
              <div key={item.href} className="mb-0.5">
                {hasChildren && parentNavigable ? (
                  <div className={`flex items-center rounded-lg overflow-hidden ${
                    selfActive ? 'bg-primary text-white shadow-clinical' : ''
                  }`}>
                    <Link href={item.href}
                      className={`flex-1 flex items-center gap-3 px-3 py-2 text-sm transition-all ${
                        selfActive
                          ? 'text-white font-medium'
                          : isActive
                            ? 'text-primary font-medium hover:bg-accent'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}>
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(item.href, isCollapsed)}
                      className={`px-2.5 py-2 transition-colors ${
                        selfActive ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? `展开 ${item.label}` : `折叠 ${item.label}`}
                    >
                      <ChevronDown className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                    </button>
                  </div>
                ) : hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(item.href, isCollapsed)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${
                      isActive ? 'text-primary font-medium' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                    aria-expanded={!isCollapsed}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                    <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                  </button>
                ) : (
                  <Link href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all ${
                      pathname === item.href
                        ? 'bg-primary text-white font-medium shadow-clinical'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}>
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )}
                {hasChildren && !isCollapsed && (
                  <div className="mt-0.5 space-y-0.5">
                    {item.children!.map(child => (
                      <Link key={child.href} href={child.href}
                        className={`flex items-center gap-2.5 pl-9 pr-3 py-1.5 text-[13px] rounded-md transition-colors ${
                          pathname === child.href
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}>
                        <child.icon className="w-3.5 h-3.5" />
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Bottom connection status (原状: 只显 WS + PLC) */}
        <div className="px-4 py-3 text-xs text-muted-foreground space-y-1.5">
          <div className="flex items-center gap-2">
            <div className={`status-led ${wsConnected ? 'status-led-running' : 'status-led-stopped'}`} />
            <span className="font-mono text-[11px]">WS {wsConnected ? '已连接' : '未连接'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`status-led ${heartbeatStatus?.alive ? 'status-led-running' : 'status-led-idle'}`} />
            <span className="font-mono text-[11px]">PLC {heartbeatStatus?.alive ? '在线' : '离线'}</span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Clinical TopBar — no border, uses subtle bg shift */}
        <header className="h-14 surface-base flex items-center justify-between px-6 flex-shrink-0">
          {/* Left: MES breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{siteMeta?.facility_name || process.env.NEXT_PUBLIC_FACILITY_NAME || '生产车间'}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-muted-foreground">{siteMeta?.line_name || process.env.NEXT_PUBLIC_LINE_NAME || '发酵产线 #1'}</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-foreground font-semibold tracking-tight">
              {siteMeta?.reactor_group_name || process.env.NEXT_PUBLIC_REACTOR_GROUP_NAME || '反应器组未配置'}
            </span>

            {stateUpdate && (
              <>
                <span className="ml-3 text-muted-foreground/30">·</span>
                <span className={`mes-badge ${getStateBadgeClass(currentState)}`}>
                  {({ idle: '空闲', running: '运行中', held: '保持', paused: '暂停', stopped: '已停止', complete: '已完成' } as Record<string,string>)[currentState] || currentState}
                </span>
                {currentState !== 'idle' && (
                  <span className="text-muted-foreground text-xs font-mono tabular-nums">
                    {formatElapsed(elapsed)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Middle: 报警信息条 (撑满中部, 至 max-w-5xl) */}
          <TopBarAlarmStrip alarms={alarms} />

          {/* Right: theme + user + clock */}
          <div className="flex items-center gap-4 shrink-0">
            <ThemeToggle />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <span title={`${user.username} (${user.role})`} className="font-medium text-foreground">{user.display_name}</span>
              <button
                onClick={logout}
                title="退出登录"
                className="ml-1 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
            <LiveClock />
          </div>
        </header>

        {/* Page Content — on surface-base (lightest layer) */}
        <main className="flex-1 overflow-auto mes-scroll surface-base">{children}</main>
      </div>
    </div>
  );
}

// 判定 alarm 是否为 CUSUM/AI 类提示 (与 NoticeBanner.isNotice 一致)
function isNoticeAlarm(a: any): boolean {
  const src = String(a?.source || '');
  const code = String(a?.alarm_code || '');
  return src.startsWith('ai:') || src === 'cusum_anomaly' || code.startsWith('CUSUM_');
}

// TopBar 报警信息条 — 显示最新一条操作性报警, 上/下翻 (过滤掉 CUSUM 提示)
function TopBarAlarmStrip({ alarms }: { alarms: any[] }) {
  const unack = React.useMemo(
    () => alarms.filter(a => !a.acknowledged && !isNoticeAlarm(a)),
    [alarms]
  );
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (idx >= unack.length) setIdx(0);
  }, [unack.length, idx]);

  if (unack.length === 0) {
    return (
      <div className="ml-auto flex items-center gap-2 px-4 w-full max-w-5xl">
        <Bell className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
        <span className="text-xs text-muted-foreground/60">报警信息</span>
        <span className="flex-1 text-xs text-muted-foreground/50 truncate">无未确认报警</span>
      </div>
    );
  }

  const cur = unack[idx] || unack[0];
  const sev = (cur as any).severity || 'warning';
  const sevColor = sev === 'critical' ? 'bg-red-500/15 text-red-600 border-red-500/30'
    : sev === 'warning' ? 'bg-yellow-500/15 text-amber-600 border-yellow-500/30'
    : 'bg-blue-500/15 text-blue-600 border-blue-500/30';

  return (
    <div className="ml-auto flex items-center gap-2 px-3 w-full max-w-5xl rounded-md border border-border bg-card/60 h-9">
      <Bell className="w-3.5 h-3.5 text-mes-red shrink-0" />
      <span className="text-xs font-medium text-foreground/80 shrink-0">报警信息</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold border ${sevColor}`}>
        {unack.length}
      </span>
      <span className="flex-1 text-xs text-foreground truncate" title={cur.message}>
        {cur.message || '(无消息)'}
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground font-mono tabular-nums">
        {idx + 1}/{unack.length}
      </span>
      <button
        onClick={() => setIdx(i => (i - 1 + unack.length) % unack.length)}
        disabled={unack.length < 2}
        className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="上一条"
      >
        <ChevronUp className="w-3 h-3" />
      </button>
      <button
        onClick={() => setIdx(i => (i + 1) % unack.length)}
        disabled={unack.length < 2}
        className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="下一条"
      >
        <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  );
}

// 主题切换按钮 — 循环 light → dark → system
function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const LABEL: Record<ThemeMode, string> = { light: '浅色', dark: '深色', system: '跟随系统' };
  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  return (
    <button
      onClick={cycle}
      title={`主题: ${LABEL[mode]} (点击切换)`}
      className="p-1.5 rounded-md hover:bg-accent transition-colors"
    >
      <Icon className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}
