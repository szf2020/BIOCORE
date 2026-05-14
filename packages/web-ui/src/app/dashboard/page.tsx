// ============================================================
// Dashboard 页面 -- MES风格操作员主屏幕
// 左侧: 控制面板
// 右侧: 大字参数卡片 → 实时趋势 → 报警信息
// 底部: 软件测算值横条
// ============================================================

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRealtimeStore } from '@/stores/realtime-store';
import dynamic from 'next/dynamic';
import { ControlPanel } from '@/components/dashboard/ControlPanel';
import { TrendChartGroup } from '@/components/dashboard/TrendChartGroup';
import { AlarmBanner } from '@/components/dashboard/AlarmBanner';
import { CalculatedParamsBar } from '@/components/dashboard/CalculatedParamsBar';
import { CusumAlertPanel } from '@/components/dashboard/CusumAlertPanel';
import { FeedAdvisorCard } from '@/components/dashboard/FeedAdvisorCard';
import { InterlockPanel } from '@/components/dashboard/InterlockPanel';
import { Server, Plus, Settings } from 'lucide-react';
import { loadDashboardLayout } from '@/components/dashboard/dashboard-layout-config';
import type { DashboardLayout } from '@/components/dashboard/dashboard-layout-config';

// @dnd-kit 较重, 仅在用户打开布局编辑器时才加载
const DashboardLayoutEditor = dynamic(
  () => import('@/components/dashboard/DashboardLayoutEditor').then(m => ({ default: m.DashboardLayoutEditor })),
  { ssr: false },
);

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ReactorInfo {
  id: string;
  state: string;
  batchId: string;
}

function getReactorLedClass(state: string): string {
  switch (state) {
    case 'running': return 'status-led-running';
    case 'held': return 'status-led-held';
    case 'paused': return 'status-led-paused';
    case 'stopped': return 'status-led-stopped';
    case 'complete': return 'status-led-complete';
    default: return 'status-led-idle';
  }
}

function getStateLabel(state: string): string {
  switch (state) {
    case 'running': return '运行';
    case 'held': return '保持';
    case 'paused': return '暂停';
    case 'stopped': return '停止';
    case 'complete': return '完成';
    default: return '空闲';
  }
}

// ─── 大字参数卡片 ───────────────────────────────────────────

interface BigParamCardProps {
  label: string;
  value: number | null;
  unit: string;
  sv?: number;
  precision?: number;
  color?: string; // accent color for the value
}

function BigParamCard({ label, value, unit, sv, precision = 1, color = 'text-foreground' }: BigParamCardProps) {
  const displayVal = value !== null && value !== undefined ? value.toFixed(precision) : '--';

  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col justify-between min-h-[130px]">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-2">
        <span className={`text-5xl font-bold font-mono tracking-tight ${color}`}>{displayVal}</span>
        <span className="text-base text-muted-foreground">{unit}</span>
      </div>
      {sv !== undefined && (
        <div className="mt-2">
          <span className="text-base font-mono font-semibold px-2.5 py-1 rounded bg-primary/15 text-primary">
            SP: {sv}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────

export default function DashboardPage() {
  const [selectedReactor, setSelectedReactor] = useState('');
  // 多反应器隔离: 按 selectedReactor 从 reactorData[id] 取数据
  // selectedReactor 缺失时退化为顶层 (启动期未拉到 reactor 列表前)
  const reactorData = useRealtimeStore(s => s.reactorData);
  const reactorStates = useRealtimeStore(s => s.reactorStates);
  const _topProcessValues = useRealtimeStore(s => s.processValues);
  const _topStateUpdate = useRealtimeStore(s => s.stateUpdate);
  const _topCalculatedParams = useRealtimeStore(s => s.calculatedParams);
  const _topAlarms = useRealtimeStore(s => s.alarms);
  const _topTrendBuffer = useRealtimeStore(s => s.trendBuffer);
  const _rd = selectedReactor ? reactorData[selectedReactor] : null;
  const processValues = _rd?.processValues ?? _topProcessValues;
  const stateUpdate = _rd?.stateUpdate ?? _topStateUpdate;
  const calculatedParams = _rd?.calculatedParams ?? _topCalculatedParams;
  const alarms = _rd?.alarms ?? _topAlarms;
  const trendBuffer = _rd?.trendBuffer ?? _topTrendBuffer;
  const [configuredIds, setConfiguredIds] = useState<string[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [dashLayout, setDashLayout] = useState<DashboardLayout>(() => loadDashboardLayout());

  // 一次性加载设备列表 (设备配置很少变, 不需要轮询)
  useEffect(() => {
    fetch(`${API}/api/reactor-configs`)
      .then(r => r.ok ? r.json() : [])
      .then((configs: { reactor_id: string; enabled: number }[]) => {
        const ids = configs.filter(c => c.enabled).map(c => c.reactor_id);
        setConfiguredIds(ids);
        setSelectedReactor(prev => (prev && ids.includes(prev)) ? prev : (ids[0] || ''));
        setConfigLoaded(true);
      })
      .catch(() => setConfigLoaded(true));
  }, []);

  // 派生 reactor list (运行时 state 来自 WS reactorStates map)
  const reactorList: ReactorInfo[] = configuredIds.map(id => {
    const ws = reactorStates[id];
    return {
      id,
      state: (ws?.state as string) || 'idle',
      batchId: (ws as any)?.batch_id || '',
    };
  });

  // 尚未配置设备 → 引导
  if (configLoaded && reactorList.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-5">
            <Server className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h2 className="text-xl font-bold mb-2">尚未配置发酵罐</h2>
          <p className="text-sm text-muted-foreground mb-6">
            请先在系统设置中添加发酵罐设备，配置PLC连接参数后即可开始使用监控面板。
          </p>
          <Link href="/settings/device-config"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/80 transition-colors">
            <Plus className="w-4 h-4" /> 前往设备配置
          </Link>
        </div>
      </div>
    );
  }

  // 从processValues中提取当前值
  const pv = processValues;
  const temp = pv?.['AI-0'] ?? null;
  const ph = pv?.['AI-2'] ?? null;
  const doVal = pv?.['AI-3'] ?? null;
  const rpm = pv?.rpm ?? null;
  const weight = pv?.['AI-6'] ?? null;
  const pressure = pv?.['AI-4'] ?? null;
  const airflow = pv?.['AI-5'] ?? null;
  const feedRate = pv?.P02_rate ?? null;

  return (
    <div className="h-full flex flex-col">
      {/* 反应器选择栏 */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-card/50">
        {reactorList.map(reactor => {
          const isSelected = selectedReactor === reactor.id;
          return (
            <button key={reactor.id} onClick={() => setSelectedReactor(reactor.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-primary/15 text-primary border border-primary/40'
                  : 'bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted hover:text-foreground'
              }`}>
              <div className={`status-led ${getReactorLedClass(reactor.state)}`} />
              <span className="font-mono font-semibold">{reactor.id}</span>
              <span className={`text-xs ${isSelected ? 'text-primary/70' : 'text-muted-foreground/70'}`}>
                {getStateLabel(reactor.state)}
              </span>
            </button>
          );
        })}
        {/* 布局自定义按钮 */}
        <div className="ml-auto">
          <button onClick={() => setLayoutEditorOpen(true)} title="自定义仪表盘布局"
            className="p-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* 左: 状态机连锁面板 + 控制面板 (连锁置顶, 启动前看到阻塞项) */}
        <div className="w-[360px] flex-shrink-0 flex flex-col gap-3 overflow-y-auto mes-scroll">
          {/* 状态机 RF/IL 连锁关联显示 — 置顶, 故障时强制可见 */}
          {selectedReactor && (
            <InterlockPanel
              reactorId={selectedReactor}
              currentState={(reactorStates[selectedReactor]?.state as string) || stateUpdate?.state}
              activeFaultCodes={alarms.filter(a => !a.acknowledged_at).map(a => (a as any).code).filter(Boolean)}
            />
          )}
          <ControlPanel state={stateUpdate} reactorId={selectedReactor} />
        </div>

        {/* 右: 参数 + 趋势 + 报警 */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto mes-scroll">

          {/* ① 大字参数卡片 — 按布局配置动态渲染 */}
          <div className="grid grid-cols-3 xl:grid-cols-6 gap-2.5">
            {dashLayout.bigParams.filter(p => p.visible).map(p => {
              // key → processValues 映射
              const pvLookup: Record<string, number | null> = {
                temperature: temp,
                pH: ph,
                DO: doVal,
                rpm: rpm,
                weight: weight,
                pressure: pressure,
              };
              const precisionLookup: Record<string, number> = {
                temperature: 1, pH: 2, DO: 1, rpm: 0, weight: 1, pressure: 2,
              };
              return (
                <BigParamCard
                  key={p.key}
                  label={p.label}
                  value={pvLookup[p.key] ?? null}
                  unit={p.unit}
                  sv={p.sv}
                  precision={precisionLookup[p.key] ?? 1}
                />
              );
            })}
          </div>

          {/* ② 次要参数行 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card px-5 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">通气量</span>
              <span className="font-mono font-bold text-xl">{airflow !== null ? airflow.toFixed(1) : '--'} <span className="text-sm text-muted-foreground font-normal">NL/min</span></span>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">补料速率</span>
              <span className="font-mono font-bold text-xl">{feedRate !== null ? feedRate.toFixed(1) : '--'} <span className="text-sm text-muted-foreground font-normal">mL/h</span></span>
            </div>
          </div>

          {/* ③ 实时趋势图 (按布局配置显隐) */}
          {dashLayout.showTrends && (
          <TrendChartGroup
            tempHistory={trendBuffer.temperature}
            phHistory={trendBuffer.pH}
            doHistory={trendBuffer.DO}
            currentTemp={temp}
            currentPH={ph}
            currentDO={doVal}
          />
          )}

          {/* ④ 报警信息 (按布局配置显隐) */}
          {dashLayout.showAlarms && (
          <AlarmBanner alarms={alarms} onAcknowledge={async (id) => {
            try {
              const res = await fetch(`${API}/api/alarms/${id}/acknowledge`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: 'admin-001' }),
              });
              if (res.ok) useRealtimeStore.getState().acknowledgeAlarm(id);
            } catch (err) { console.error('[Dashboard] Failed to acknowledge alarm:', err); }
          }} />
          )}

          {/* ⑤ CUSUM 实时异常检测 */}
          <CusumAlertPanel batchId={reactorList.find(r => r.id === selectedReactor)?.batchId} reactorId={selectedReactor} />

          {/* ⑥ 补料建议 */}
          <FeedAdvisorCard batchId={reactorList.find(r => r.id === selectedReactor)?.batchId} />
        </div>
      </div>

      {/* 底部测算值横条 (按布局配置显隐) */}
      {dashLayout.showCalculated && <CalculatedParamsBar params={calculatedParams} />}

      {/* 布局编辑器弹窗 */}
      <DashboardLayoutEditor
        open={layoutEditorOpen}
        onClose={() => { setLayoutEditorOpen(false); setDashLayout(loadDashboardLayout()); }}
      />
    </div>
  );
}
