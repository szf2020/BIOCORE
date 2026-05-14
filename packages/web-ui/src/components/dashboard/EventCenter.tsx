// ============================================================
// EventCenter — 报警 + 提示并列显示 (同一卡片内两栏)
// 报警 = 操作性故障 (泵故障/液位超限/RF), 提示 = AI/统计层 (CUSUM)
// ============================================================

'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Bell, Sparkles, AlertTriangle, AlertCircle, Info, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alarm, AlarmSeverity } from '@/types';

const SEVERITY_ICON: Record<AlarmSeverity, React.ElementType> = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};
const SEVERITY_TEXT: Record<AlarmSeverity, string> = {
  critical: 'text-red-700 dark:text-red-400',
  warning: 'text-orange-700 dark:text-orange-400',
  info: 'text-blue-700 dark:text-blue-400',
};

interface Props {
  alarms: Alarm[];
  notices: Alarm[];
  onAcknowledge: (id: string) => void;
}

function formatTime(a: Alarm): string {
  const raw = (a as any).triggered_at || (a as any).created_at;
  if (!raw) return '--:--:--';
  const iso = typeof raw === 'string' && raw.includes(' ') && !raw.includes('T')
    ? raw.replace(' ', 'T') + (raw.endsWith('Z') ? '' : 'Z')
    : raw;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function Row({ item, kind, onAck }: { item: Alarm; kind: 'alarm' | 'notice'; onAck: (id: string) => void }) {
  const isAlarm = kind === 'alarm';
  const Icon = isAlarm ? (SEVERITY_ICON[item.severity] || AlertCircle) : Info;
  const colorClass = isAlarm ? (SEVERITY_TEXT[item.severity] || 'text-foreground') : 'text-purple-700 dark:text-purple-400';
  return (
    <div className="flex items-start gap-2 px-3 py-1.5">
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
        onClick={() => onAck(item.id)}
        className={cn('shrink-0 p-1 rounded hover:bg-muted transition-colors', colorClass)}
        title={isAlarm ? '确认' : '已知悉'}
      >
        <Check className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Section({ title, icon: Icon, color, items, kind, onAck, emptyText }: {
  title: string;
  icon: React.ElementType;
  color: string;
  items: Alarm[];
  kind: 'alarm' | 'notice';
  onAck: (id: string) => void;
  emptyText: string;
}) {
  return (
    <div className="space-y-1">
      <div className={cn('flex items-center justify-between px-3 py-1.5 border-b border-border', color)}>
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Icon className="w-3.5 h-3.5" />
          {title}
          {items.length > 0 && (
            <span className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-current text-white text-[10px] font-bold leading-4 text-center">
              {items.length}
            </span>
          )}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="max-h-32 overflow-y-auto mes-scroll divide-y divide-border">
          {items.map(item => <Row key={item.id} item={item} kind={kind} onAck={onAck} />)}
        </div>
      )}
    </div>
  );
}

export function EventCenter({ alarms, notices, onAcknowledge }: Props) {
  const unackAlarms = alarms.filter(a => !a.acknowledged);
  const unackNotices = notices.filter(n => !n.acknowledged);

  return (
    <Card>
      <CardContent className="p-0">
        <Section
          title="报警信息"
          icon={Bell}
          color="text-red-600"
          items={unackAlarms}
          kind="alarm"
          onAck={onAcknowledge}
          emptyText="无未确认报警"
        />
        <Section
          title="提示信息"
          icon={Sparkles}
          color="text-purple-600"
          items={unackNotices}
          kind="notice"
          onAck={onAcknowledge}
          emptyText="无提示"
        />
      </CardContent>
    </Card>
  );
}
