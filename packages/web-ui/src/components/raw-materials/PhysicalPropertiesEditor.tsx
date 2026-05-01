// 物性编辑器 — 密度 / pH / 操作温度范围 / 粘度曲线 (M2.6)
'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

export interface PhysicalProperties {
  density?: number | null;
  pH_range?: [number, number] | null;
  operating_temp_range?: [number, number] | null;
  viscosity_curve?: [number, number][];
}

interface Props {
  value: PhysicalProperties;
  onChange: (v: PhysicalProperties) => void;
}

/**
 * 物性编辑器 — 左侧表单, 粘度曲线用表格行增删。
 * 调用方通常把 ViscosityCurveChart 放右侧实时预览。
 */
export function PhysicalPropertiesEditor({ value, onChange }: Props) {
  const curve = value.viscosity_curve || [];

  const update = (patch: Partial<PhysicalProperties>) => onChange({ ...value, ...patch });

  const updateCurvePoint = (i: number, axis: 0 | 1, v: string) => {
    const next = curve.map((p, idx) => idx === i ? [...p] as [number, number] : p);
    const num = parseFloat(v);
    if (!isNaN(num)) next[i][axis] = num;
    update({ viscosity_curve: next });
  };

  const addCurvePoint = () => {
    const last = curve[curve.length - 1];
    const newPoint: [number, number] = last ? [last[0] + 5, last[1]] : [25, 1];
    update({ viscosity_curve: [...curve, newPoint] });
  };

  const removeCurvePoint = (i: number) => {
    update({ viscosity_curve: curve.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-4">
      {/* 密度 */}
      <div className="grid grid-cols-3 items-center gap-2">
        <Label className="text-xs text-right">密度 (g/cm³)</Label>
        <Input
          type="number"
          step="0.01"
          className="col-span-2 h-8 text-xs"
          placeholder="例如 1.05"
          value={value.density ?? ''}
          onChange={e => update({ density: e.target.value ? parseFloat(e.target.value) : null })}
        />
      </div>

      {/* pH 范围 */}
      <div className="grid grid-cols-3 items-start gap-2">
        <Label className="text-xs text-right pt-2">pH 范围</Label>
        <div className="col-span-2 flex items-center gap-1.5">
          <Input
            type="number"
            step="0.1"
            className="h-8 text-xs"
            placeholder="min"
            value={value.pH_range?.[0] ?? ''}
            onChange={e => {
              const n = e.target.value ? parseFloat(e.target.value) : 0;
              update({ pH_range: [n, value.pH_range?.[1] ?? n] });
            }}
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="number"
            step="0.1"
            className="h-8 text-xs"
            placeholder="max"
            value={value.pH_range?.[1] ?? ''}
            onChange={e => {
              const n = e.target.value ? parseFloat(e.target.value) : 0;
              update({ pH_range: [value.pH_range?.[0] ?? n, n] });
            }}
          />
        </div>
      </div>

      {/* 操作温度范围 */}
      <div className="grid grid-cols-3 items-start gap-2">
        <Label className="text-xs text-right pt-2">温度范围 (°C)</Label>
        <div className="col-span-2 flex items-center gap-1.5">
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="min"
            value={value.operating_temp_range?.[0] ?? ''}
            onChange={e => {
              const n = e.target.value ? parseFloat(e.target.value) : 0;
              update({ operating_temp_range: [n, value.operating_temp_range?.[1] ?? n] });
            }}
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="number"
            className="h-8 text-xs"
            placeholder="max"
            value={value.operating_temp_range?.[1] ?? ''}
            onChange={e => {
              const n = e.target.value ? parseFloat(e.target.value) : 0;
              update({ operating_temp_range: [value.operating_temp_range?.[0] ?? n, n] });
            }}
          />
        </div>
      </div>

      {/* 粘度曲线编辑 */}
      <div className="pt-3 border-t border-border/50">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">粘度-温度曲线</Label>
          <Button type="button" size="sm" variant="outline" onClick={addCurvePoint}>
            <Plus className="w-3 h-3 mr-1" />添加点
          </Button>
        </div>
        {curve.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-3">
            点击&quot;添加点&quot;录入粘度-温度对 (T°C, η mPa·s)
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
            {curve.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground w-6 text-right">#{i + 1}</span>
                <Input
                  type="number"
                  step="1"
                  className="h-7 text-xs flex-1"
                  placeholder="T (°C)"
                  value={p[0]}
                  onChange={e => updateCurvePoint(i, 0, e.target.value)}
                />
                <Input
                  type="number"
                  step="0.01"
                  className="h-7 text-xs flex-1"
                  placeholder="η (mPa·s)"
                  value={p[1]}
                  onChange={e => updateCurvePoint(i, 1, e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => removeCurvePoint(i)}
                >
                  <X className="w-3 h-3 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
