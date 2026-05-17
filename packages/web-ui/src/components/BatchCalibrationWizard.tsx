// ============================================================
// BatchCalibrationWizard -- 多通道并行校准向导
//
// 三步向导: 选通道 → 输入校准点 → 审核提交
// 对标 DASware 多通道同时校准功能
// ============================================================

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/auth';
import { ChevronRight, ChevronLeft, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

/** 通道定义 */
export interface CalibrationChannel {
  channel: string;   // e.g. 'AI-0'
  label: string;     // 中文标签 e.g. '温度'
  sensorType: string; // e.g. 'PT100'
}

/** 审计回调接口 (与 useAudit 兼容) */
interface AuditHandler {
  confirm: (req: {
    description: string;
    action: string;
    targetType: string;
    targetId: string;
    oldValue?: string;
    newValue?: string;
    onConfirm: (username?: string, reason?: string) => void | Promise<void>;
  }) => void;
  dialog: React.ReactNode;
}

interface BatchCalibrationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: CalibrationChannel[];
  apiBase?: string;
  audit: AuditHandler;
  onCompleted?: () => void;
}

/** 单通道校准数据 */
interface ChannelCalData {
  low_raw: string;
  low_eng: string;
  high_raw: string;
  high_eng: string;
}

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: '选择通道',
  2: '输入校准点',
  3: '确认提交',
};

export function BatchCalibrationWizard({
  open, onOpenChange, channels, apiBase, audit, onCompleted,
}: BatchCalibrationWizardProps) {
  const API = apiBase || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // 向导步骤
  const [step, setStep] = useState<Step>(1);

  // Step 1: 通道选择 + 操作人
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [operator, setOperator] = useState('');

  // Step 2: 校准数据 (key = channel id)
  const [calData, setCalData] = useState<Record<string, ChannelCalData>>({});

  // Step 3: 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // 切换通道选中
  const toggleChannel = useCallback((ch: string) => {
    setSelectedChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  }, []);

  // 初始化校准数据 (进入 Step 2 时)
  const initCalData = useCallback(() => {
    const data: Record<string, ChannelCalData> = {};
    for (const ch of selectedChannels) {
      data[ch] = calData[ch] || { low_raw: '0', low_eng: '0', high_raw: '27648', high_eng: '0' };
    }
    setCalData(data);
  }, [selectedChannels, calData]);

  // 更新单个通道的校准值
  const updateCalField = useCallback((ch: string, field: keyof ChannelCalData, value: string) => {
    setCalData(prev => ({
      ...prev,
      [ch]: { ...prev[ch], [field]: value },
    }));
  }, []);

  // 计算斜率
  const getSlope = useCallback((d: ChannelCalData): string => {
    const lr = parseFloat(d.low_raw);
    const le = parseFloat(d.low_eng);
    const hr = parseFloat(d.high_raw);
    const he = parseFloat(d.high_eng);
    if (isNaN(lr) || isNaN(le) || isNaN(hr) || isNaN(he)) return '--';
    if (hr === lr) return '--';
    return ((he - le) / (hr - lr)).toFixed(6);
  }, []);

  // 选中通道的详细信息
  const selectedChannelList = useMemo(() =>
    channels.filter(c => selectedChannels.has(c.channel)),
    [channels, selectedChannels],
  );

  // Step 1 → Step 2
  const goStep2 = useCallback(() => {
    if (selectedChannels.size === 0 || !operator.trim()) return;
    initCalData();
    setStep(2);
  }, [selectedChannels, operator, initCalData]);

  // Step 2 → Step 3
  const goStep3 = useCallback(() => {
    setStep(3);
    setSubmitResult(null);
  }, []);

  // 提交校准 (通过审计确认)
  const handleSubmit = useCallback(() => {
    const summary = selectedChannelList.map(c => {
      const d = calData[c.channel];
      return `${c.channel}(${c.label}): slope=${getSlope(d)}`;
    }).join('; ');

    audit.confirm({
      description: `批量校准 ${selectedChannelList.length} 个通道: ${summary}`,
      action: 'batch_calibration',
      targetType: 'calibration',
      targetId: selectedChannelList.map(c => c.channel).join(','),
      newValue: summary,
      onConfirm: async (_username, reason) => {
        setSubmitting(true);
        setSubmitResult(null);

        try {
          const calibrations = selectedChannelList.map(c => {
            const d = calData[c.channel];
            return {
              channel: c.channel,
              sensor_type: c.sensorType,
              calibrated_by: operator.trim(),
              cal_point_low_raw: parseFloat(d.low_raw),
              cal_point_low_eng: parseFloat(d.low_eng),
              cal_point_high_raw: parseFloat(d.high_raw),
              cal_point_high_eng: parseFloat(d.high_eng),
            };
          });

          const res = await apiFetch(`${API}/api/v1/calibrations/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calibrations, reason: reason || '' }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => null);
            throw new Error(errData?.msg || errData?.message || `提交失败 (${res.status})`);
          }

          setSubmitResult({ ok: true, msg: `成功校准 ${calibrations.length} 个通道` });
          onCompleted?.();
        } catch (e) {
          setSubmitResult({ ok: false, msg: (e as Error).message });
        } finally {
          setSubmitting(false);
        }
      },
    });
  }, [selectedChannelList, calData, operator, getSlope, audit, API, onCompleted]);

  // 关闭重置
  const handleClose = useCallback((v: boolean) => {
    if (!v) {
      setStep(1);
      setSelectedChannels(new Set());
      setOperator('');
      setCalData({});
      setSubmitResult(null);
    }
    onOpenChange(v);
  }, [onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              多通道并行校准
              {/* 步骤指示器 */}
              <div className="flex items-center gap-1 text-sm font-normal ml-auto">
                {([1, 2, 3] as Step[]).map((s, i) => (
                  <React.Fragment key={s}>
                    {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                    <span className={`px-2 py-0.5 rounded text-sm ${
                      s === step
                        ? 'bg-primary/15 text-primary font-medium'
                        : s < step
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/50'
                    }`}>
                      {s}. {STEP_LABELS[s]}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* ── Step 1: 选择通道 + 操作人 ── */}
            {step === 1 && (
              <>
                <div>
                  <Label className="mb-2 block">操作人 *</Label>
                  <Input
                    value={operator}
                    onChange={e => setOperator(e.target.value)}
                    placeholder="输入操作人姓名"
                    className="max-w-xs"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="mb-2 block">选择校准通道</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {channels.map(c => {
                      const checked = selectedChannels.has(c.channel);
                      return (
                        <label
                          key={c.channel}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors
                            ${checked
                              ? 'bg-primary/10 border-primary/40 text-foreground'
                              : 'border-border hover:bg-muted/30 text-muted-foreground'}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleChannel(c.channel)}
                            className="accent-primary"
                          />
                          <span className="font-mono text-sm">{c.channel}</span>
                          <span className="text-sm">{c.label}</span>
                          <span className="text-sm text-muted-foreground ml-auto">{c.sensorType}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── Step 2: 校准点输入 (网格布局, 每通道一列) ── */}
            {step === 2 && (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  为每个通道输入低点和高点的原始值/工程值
                </div>
                <div className="grid gap-3" style={{
                  gridTemplateColumns: `repeat(${Math.min(selectedChannelList.length, 4)}, 1fr)`,
                }}>
                  {selectedChannelList.map(c => {
                    const d = calData[c.channel];
                    if (!d) return null;
                    const slope = getSlope(d);
                    return (
                      <Card key={c.channel}>
                        <CardContent className="p-3 space-y-2">
                          <div className="text-sm font-medium flex items-center gap-1.5">
                            <span className="font-mono text-primary">{c.channel}</span>
                            <span>{c.label}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">{c.sensorType}</div>

                          <div className="space-y-1.5">
                            <div>
                              <Label className="text-sm">低点原始值</Label>
                              <Input type="number" value={d.low_raw}
                                onChange={e => updateCalField(c.channel, 'low_raw', e.target.value)}
                                className="h-7 text-sm" />
                            </div>
                            <div>
                              <Label className="text-sm">低点工程值</Label>
                              <Input type="number" value={d.low_eng}
                                onChange={e => updateCalField(c.channel, 'low_eng', e.target.value)}
                                className="h-7 text-sm" />
                            </div>
                            <div>
                              <Label className="text-sm">高点原始值</Label>
                              <Input type="number" value={d.high_raw}
                                onChange={e => updateCalField(c.channel, 'high_raw', e.target.value)}
                                className="h-7 text-sm" />
                            </div>
                            <div>
                              <Label className="text-sm">高点工程值</Label>
                              <Input type="number" value={d.high_eng}
                                onChange={e => updateCalField(c.channel, 'high_eng', e.target.value)}
                                className="h-7 text-sm" />
                            </div>
                          </div>

                          <div className="text-sm text-muted-foreground pt-1 border-t border-border">
                            斜率: <span className="font-mono font-semibold text-foreground">{slope}</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Step 3: 确认审核 ── */}
            {step === 3 && (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">请确认以下校准参数:</div>
                <div className="text-sm">
                  <span className="text-muted-foreground">操作人:</span>{' '}
                  <span className="font-medium">{operator}</span>
                </div>

                {/* 汇总表格 */}
                <div className="overflow-x-auto border border-border rounded-md">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-sm text-muted-foreground">
                        <th className="px-3 py-2 text-left">通道</th>
                        <th className="px-3 py-2 text-left">传感器</th>
                        <th className="px-3 py-2 text-right">低点 (raw/eng)</th>
                        <th className="px-3 py-2 text-right">高点 (raw/eng)</th>
                        <th className="px-3 py-2 text-right">斜率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedChannelList.map(c => {
                        const d = calData[c.channel];
                        if (!d) return null;
                        return (
                          <tr key={c.channel} className="border-t border-border">
                            <td className="px-3 py-1.5 font-mono">{c.channel} ({c.label})</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{c.sensorType}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{d.low_raw} / {d.low_eng}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{d.high_raw} / {d.high_eng}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-semibold">{getSlope(d)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 提交结果 */}
                {submitResult && (
                  <div className={`flex items-center gap-2 text-sm p-3 rounded ${
                    submitResult.ok
                      ? 'bg-green-500/10 text-emerald-600'
                      : 'bg-red-500/10 text-red-600'
                  }`}>
                    {submitResult.ok
                      ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                    {submitResult.msg}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {/* 返回上一步 */}
            {step > 1 && (
              <Button
                variant="ghost"
                onClick={() => setStep((step - 1) as Step)}
                disabled={submitting}
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> 上一步
              </Button>
            )}

            <div className="flex-1" />

            <Button variant="ghost" onClick={() => handleClose(false)} disabled={submitting}>
              取消
            </Button>

            {/* 下一步 / 提交 */}
            {step === 1 && (
              <Button
                onClick={goStep2}
                disabled={selectedChannels.size === 0 || !operator.trim()}
              >
                下一步 <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === 2 && (
              <Button onClick={goStep3}>
                下一步 <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === 3 && !submitResult?.ok && (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> 提交中...</>
                ) : (
                  '提交'
                )}
              </Button>
            )}
            {step === 3 && submitResult?.ok && (
              <Button onClick={() => handleClose(false)}>
                完成
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 审计确认对话框 (由 useAudit 提供) */}
      {audit.dialog}
    </>
  );
}
