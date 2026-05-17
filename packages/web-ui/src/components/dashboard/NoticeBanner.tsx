// ============================================================
// NoticeBanner — 提示信息 (统计/分析层非阻塞性提示)
// 与 AlarmBanner 区分: CUSUM 检测等"提示"性质消息归此, 操作性故障归报警
// ============================================================

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Info } from 'lucide-react';
import type { Alarm } from '@/types';

interface NoticeBannerProps {
  notices: Alarm[];
  onAcknowledge: (id: string) => void;
}

export function NoticeBanner({ notices, onAcknowledge }: NoticeBannerProps) {
  const unack = notices.filter(n => !n.acknowledged).slice(0, 5);

  const formatTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return '--:--:--'; }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium text-muted-foreground flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          提示信息
          {unack.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-sm font-bold">
              {unack.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {unack.length === 0 && (
          <div className="text-base text-muted-foreground py-3 text-center">
            无提示
          </div>
        )}

        {unack.map(n => (
          <div
            key={n.id}
            className="flex items-start gap-2.5 rounded-md border p-3 bg-purple-50 dark:bg-purple-500/10 border-purple-300 dark:border-purple-500/40"
          >
            <Info className="w-5 h-5 mt-0.5 shrink-0 text-purple-700 dark:text-purple-400" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-purple-700 dark:text-purple-400">
                  {formatTime(n.triggered_at || n.created_at)}
                </span>
                {n.channel && (
                  <span className="text-sm text-muted-foreground font-mono">{n.channel}</span>
                )}
                <span className="text-sm uppercase tracking-wider text-muted-foreground">
                  {n.source}
                </span>
              </div>
              <div className="text-base leading-snug text-purple-700 dark:text-purple-300">
                {n.message}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-sm h-7 px-2 text-purple-700 dark:text-purple-400"
              onClick={() => onAcknowledge(n.id)}
            >
              已知悉
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// 判定: 一条 alarm 是"提示"性质 (统计/AI 检测) 还是"报警"性质 (操作故障)
export function isNotice(alarm: { source?: string; alarm_code?: string } & Record<string, any>): boolean {
  const src = String(alarm.source || '');
  const code = String(alarm.alarm_code || '');
  if (src.startsWith('ai:') || src === 'cusum_anomaly') return true;
  if (code.startsWith('CUSUM_')) return true;
  return false;
}
