// ============================================================
// AlarmBanner — 实时报警横幅
// 显示最近3条未确认报警, 按严重级别着色
// ============================================================

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, AlertCircle, Info, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Alarm, AlarmSeverity } from '@/types';
import { useLocale } from '@/i18n/useLocale';

const SEVERITY_CONFIG: Record<AlarmSeverity, {
  bg: string; border: string; text: string; icon: React.ElementType;
}> = {
  critical: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', icon: AlertTriangle },
  warning:  { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', icon: AlertCircle },
  info:     { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: Info },
};

interface AlarmBannerProps {
  alarms: Alarm[];
  onAcknowledge: (alarmId: string) => void;
  onViewAll?: () => void;
}

export function AlarmBanner({ alarms, onAcknowledge, onViewAll }: AlarmBannerProps) {
  const { t } = useLocale();
  const unacknowledged = alarms
    .filter((a) => !a.acknowledged)
    .slice(0, 3);

  const formatTime = (iso: string): string => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '--:--:--';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium text-muted-foreground flex items-center gap-2">
            <Bell className="w-5 h-5" />
            报警信息
            {unacknowledged.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-sm font-bold">
                {unacknowledged.length}
              </span>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {unacknowledged.length === 0 && (
          <div className="text-base text-muted-foreground py-3 text-center">
            无未确认报警
          </div>
        )}

        {unacknowledged.map((alarm) => {
          const config = SEVERITY_CONFIG[alarm.severity];
          const Icon = config.icon;
          return (
            <div
              key={alarm.id}
              className={cn(
                'flex items-start gap-2.5 rounded-md border p-3',
                config.bg, config.border,
              )}
            >
              <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', config.text)} />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-baseline gap-2">
                  <span className={cn('text-sm font-medium', config.text)}>
                    {formatTime(alarm.created_at)}
                  </span>
                  {alarm.channel && (
                    <span className="text-sm text-muted-foreground font-mono">
                      {alarm.channel}
                    </span>
                  )}
                </div>
                <div className={cn('text-base leading-snug', config.text)}>
                  {alarm.message}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className={cn('shrink-0 text-sm h-7 px-2', config.text)}
                onClick={() => onAcknowledge(alarm.id)}
              >
                确认
              </Button>
            </div>
          );
        })}

        {onViewAll && (
          <button
            onClick={onViewAll}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1 transition-colors"
          >
            查看全部报警 &rarr;
          </button>
        )}
      </CardContent>
    </Card>
  );
}
