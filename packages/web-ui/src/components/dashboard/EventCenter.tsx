// ============================================================
// EventCenter — 报警 + 提示合并卡, Tabs 切换, 限高内滚
// 替代独立的 AlarmBanner + NoticeBanner, 减少右列垂直空间
// ============================================================

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, Sparkles, AlertTriangle, AlertCircle, Info, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alarm, AlarmSeverity } from '@/types';

const SEVERITY_TEXT: Record<AlarmSeverity, string> = {
  critical: 'text-red-700 dark:text-red-400',
  warning: 'text-orange-700 dark:text-orange-400',
  info: 'text-blue-700 dark:text-blue-400',
};

const SEVERITY_ICON: Record<AlarmSeverity, React.ElementType> = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};

interface Props {
  alarms: Alarm[];
  notices: Alarm[];
  onAcknowledge: (id: string) => void;
}

export function EventCenter({ alarms, notices, onAcknowledge }: Props) {
  const unackAlarms = alarms.filter(a => !a.acknowledged);
  const unackNotices = notices.filter(n => !n.acknowledged);

  // 默认 tab: 优先报警 (有未确认时), 否则提示
  const [tab, setTab] = useState<'alarm' | 'notice'>(
    unackAlarms.length > 0 ? 'alarm' : 'notice'
  );

  const current = tab === 'alarm' ? unackAlarms : unackNotices;
  const formatTime = (a: Alarm): string => {
    const raw = (a as any).triggered_at || (a as any).created_at;
    if (!raw) return '--:--:--';
    // SQLite 默认 datetime 用空格分隔, Safari 等浏览器需要 ISO 'T' 才能解析
    const iso = typeof raw === 'string' && raw.includes(' ') && !raw.includes('T')
      ? raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z')
      : raw;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '--:--:--';
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">事件中心</CardTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab('alarm')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all',
                tab === 'alarm'
                  ? 'bg-red-500/15 text-red-600 border border-red-500/30'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Bell className="w-3.5 h-3.5" /> 报警
              {unackAlarms.length > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-4 text-center">
                  {unackAlarms.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('notice')}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all',
                tab === 'notice'
                  ? 'bg-purple-500/15 text-purple-600 border border-purple-500/30'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Sparkles className="w-3.5 h-3.5" /> 提示
              {unackNotices.length > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-purple-500 text-white text-[10px] font-bold leading-4 text-center">
                  {unackNotices.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {current.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            {tab === 'alarm' ? '无未确认报警' : '无提示'}
          </div>
        ) : (
          <div className="max-h-44 overflow-y-auto mes-scroll divide-y divide-border">
            {current.map(item => {
              const isAlarm = tab === 'alarm';
              const Icon = isAlarm ? (SEVERITY_ICON[item.severity] || AlertCircle) : Info;
              const colorClass = isAlarm ? (SEVERITY_TEXT[item.severity] || 'text-foreground') : 'text-purple-700 dark:text-purple-400';
              return (
                <div key={item.id} className="flex items-start gap-2 px-3 py-2">
                  <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', colorClass)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 text-[10px] text-muted-foreground font-mono">
                      <span>{formatTime(item)}</span>
                      {item.channel && <span>{item.channel}</span>}
                    </div>
                    <div className={cn('text-xs leading-snug truncate', colorClass)} title={item.message}>
                      {item.message}
                    </div>
                  </div>
                  <button
                    onClick={() => onAcknowledge(item.id)}
                    className={cn(
                      'shrink-0 p-1 rounded hover:bg-muted transition-colors',
                      colorClass
                    )}
                    title={isAlarm ? '确认' : '已知悉'}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
