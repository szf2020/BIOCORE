// 计算参数公式配置页 — 查看/修改发酵计算公式的系数
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Calculator, RotateCcw, Save, Check, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/auth';
import { useAudit } from '@/hooks/useAudit';
import { useLocale } from '@/i18n/useLocale';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface FormulaConfig {
  id: string;
  name: string;
  description: string;
  category: string;
  formula_type: string;
  formula_display: string;
  coefficients: Record<string, number | string>;
  expression: string | null;
  input_vars: string[];
  output_unit: string;
  is_enabled: number;
  updated_at: string;
}

const COEF_LABELS: Record<string, Record<string, string>> = {
  kLa: { C: 'Van\'t Riet 常数 C', a: 'P/V 指数 a', b: 'Vs 指数 b', tankArea: '罐截面积 A (m²)', rpmRef: '参考转速 (rpm)', pvMultiplier: '功率乘数' },
  OUR: { DOStar: 'DO 饱和值 DO* (%)' },
  mu: { windowSize: '滑动窗口大小 (点)' },
  F0: { Tref: '参考温度 Tref (°C)', z: 'z 值 (°C)', threshold: '累积阈值 (°C)' },
  Vs: { tankArea: '罐截面积 A (m²)' },
  PV: { rpmRef: '参考转速 (rpm)', multiplier: '功率乘数' },
  cumFeed: { pumpChannel: '泵通道', intervalSec: '积分间隔 (s)' },
  cumBase: { pumpChannel: '泵通道', intervalSec: '积分间隔 (s)' },
  cumAcid: { pumpChannel: '泵通道', intervalSec: '积分间隔 (s)' },
  Vliquid: { initialVolume: '初始体积 V₀ (L)', density: '密度 ρ (kg/L)' },
  CER: { CO2_in: '进气 CO₂ 浓度 (%)', estimateFromRQ: '无尾气时用RQ估算', defaultRQ: '默认 RQ 值' },
  RQ: {},
  OTR: { DOStar: 'DO 饱和值 (%)', CStar: '饱和溶氧 C* (mmol/L)' },
  qp: { productField: '产物字段名', biomassField: '生物量字段名', OD_to_DCW: 'OD→DCW 换算系数 (g/L)' },
  Yxs: { biomassField: '生物量字段名', substrateField: '底物字段名', OD_to_DCW: 'OD→DCW 换算系数' },
  Yps: { productField: '产物字段名', substrateField: '底物字段名' },
};

const CATEGORY_COLORS: Record<string, string> = {
  kLa: 'border-blue-500/40', OUR: 'border-green-500/40', mu: 'border-purple-500/40',
  F0: 'border-red-500/40', Vs: 'border-cyan-500/40', PV: 'border-orange-500/40',
  cumFeed: 'border-emerald-500/40', cumBase: 'border-yellow-500/40', cumAcid: 'border-pink-500/40',
  O2total: 'border-sky-500/40', Vliquid: 'border-teal-500/40',
  CER: 'border-amber-500/40', RQ: 'border-rose-500/40', OTR: 'border-indigo-500/40',
  qp: 'border-lime-500/40', Yxs: 'border-fuchsia-500/40', Yps: 'border-violet-500/40',
};

export default function FormulaConfigPage() {
  const audit = useAudit();
  const [formulas, setFormulas] = useState<FormulaConfig[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [editCoefs, setEditCoefs] = useState<Record<string, string>>({});
  const [editExpr, setEditExpr] = useState('');
  const [editMode, setEditMode] = useState<'parametric' | 'expression'>('parametric');
  const [validateResult, setValidateResult] = useState<{ valid: boolean; error: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API}/api/v1/formula-configs`);
      if (r.ok) {
        const d = await r.json();
        const list = Array.isArray(d?.data ?? d) ? (d?.data ?? d) : [];
        setFormulas(list);
        if (!selected && list.length > 0) setSelected(list[0].id);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const current = formulas.find(f => f.id === selected);

  // 选中时初始化编辑状态
  useEffect(() => {
    if (current) {
      const coefs: Record<string, string> = {};
      for (const [k, v] of Object.entries(current.coefficients)) {
        coefs[k] = String(v);
      }
      setEditCoefs(coefs);
      setEditMode(current.formula_type as any || 'parametric');
      setEditExpr(current.expression || '');
      setValidateResult(null);
    }
  }, [selected, current?.updated_at]);

  // 验证自定义表达式
  const validateExpr = async () => {
    if (!editExpr.trim()) { setValidateResult({ valid: false, error: '表达式不能为空' }); return; }
    try {
      const r = await apiFetch(`${API}/api/v1/formula-configs/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: editExpr }),
      });
      const d = await r.json();
      setValidateResult(d?.data ?? d);
    } catch { setValidateResult({ valid: false, error: '网络错误' }); }
  };

  const saveFormula = () => {
    if (!current) return;
    const isExpr = editMode === 'expression';
    const parsed: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(editCoefs)) {
      const num = parseFloat(v);
      parsed[k] = isNaN(num) ? v : num;
    }
    const desc = isExpr
      ? `将公式 "${current.name}" 切换为自定义表达式: ${editExpr}`
      : `修改公式 "${current.name}" 的系数`;
    audit.confirm({
      description: desc,
      action: 'formula_update',
      targetType: 'formula_config',
      targetId: current.id,
      oldValue: current.formula_type === 'expression' ? current.expression || '' : JSON.stringify(current.coefficients),
      newValue: isExpr ? editExpr : JSON.stringify(parsed),
      onConfirm: async () => {
        setSaving(true);
        const body: any = { formula_type: editMode };
        if (isExpr) {
          body.expression = editExpr;
        } else {
          body.coefficients = parsed;
          body.expression = null;
        }
        const r = await apiFetch(`${API}/api/v1/formula-configs/${current.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) await load();
        else alert('保存失败');
        setSaving(false);
      },
    });
  };

  const resetToDefault = () => {
    if (!current) return;
    audit.confirm({
      description: `将公式 "${current.name}" 恢复为默认值`,
      action: 'formula_reset',
      targetType: 'formula_config',
      targetId: current.id,
      onConfirm: async () => {
        const r = await apiFetch(`${API}/api/v1/formula-configs/${current.id}/reset`, { method: 'POST' });
        if (r.ok) await load();
        else alert('恢复失败');
      },
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {audit.dialog}

      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" /> 计算参数公式配置
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          配置发酵过程中 OUR、kLa、μ、F₀ 等计算参数的系数。修改后实时生效。
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* 左侧: 公式列表 */}
        <div className="space-y-1.5">
          {loading && <p className="text-sm text-muted-foreground">加载中...</p>}
          {formulas.map(f => (
            <button
              key={f.id}
              onClick={() => setSelected(f.id)}
              className={`w-full text-left rounded-lg border p-3 transition-all ${
                selected === f.id ? 'border-primary bg-primary/5' : `${CATEGORY_COLORS[f.id] || 'border-border'} hover:border-primary/40`
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{f.name}</span>
                <div className="flex items-center gap-1">
                  {f.formula_type === 'expression' && <span className="text-[12px] bg-yellow-500/15 text-amber-600 px-1 rounded">自定义</span>}
                  <span className="text-[12px] text-muted-foreground font-mono">{f.output_unit}</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground font-mono mt-1 truncate">
                {f.formula_type === 'expression' && f.expression ? f.expression : f.formula_display}
              </div>
            </button>
          ))}
        </div>

        {/* 右侧: 编辑面板 */}
        <div className="md:col-span-2">
          {current ? (
            <Card>
              <CardContent className="p-5 space-y-4">
                {/* 公式展示 */}
                <div>
                  <h2 className="text-sm font-bold">{current.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{current.description}</p>
                  <div className="mt-2 bg-muted/30 rounded p-3 font-mono text-sm text-primary">
                    {current.formula_display}
                  </div>
                  <div className="flex gap-2 mt-2 text-sm text-muted-foreground">
                    <span>输出单位: {current.output_unit}</span>
                    <span>·</span>
                    <span>输入变量: {current.input_vars?.join(', ')}</span>
                  </div>
                </div>

                {/* 模式切换: 参数化 / 自定义表达式 */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">模式:</span>
                  <button onClick={() => setEditMode('parametric')}
                    className={`px-3 py-1 rounded text-sm font-semibold border transition-all ${editMode === 'parametric' ? 'bg-primary/15 text-primary border-primary/40' : 'bg-muted/30 text-muted-foreground border-border'}`}>
                    参数化 (系数可调)
                  </button>
                  <button onClick={() => setEditMode('expression')}
                    className={`px-3 py-1 rounded text-sm font-semibold border transition-all ${editMode === 'expression' ? 'bg-primary/15 text-primary border-primary/40' : 'bg-muted/30 text-muted-foreground border-border'}`}>
                    自定义表达式
                  </button>
                </div>

                {editMode === 'parametric' ? (
                  /* 参数化模式: 系数编辑 */
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">可调系数</h3>
                    {Object.keys(editCoefs).length === 0 ? (
                      <p className="text-sm text-muted-foreground">此公式无可调系数</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Object.entries(editCoefs).map(([key, val]) => (
                          <div key={key}>
                            <label className="text-sm text-muted-foreground">
                              {COEF_LABELS[current.id]?.[key] || key}
                            </label>
                            <Input
                              value={val}
                              onChange={e => setEditCoefs({ ...editCoefs, [key]: e.target.value })}
                              className="mt-1 h-8 font-mono text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* 自定义表达式模式 */
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-1">自定义公式表达式</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        使用数学表达式定义计算公式。支持: +, -, *, /, ^ (幂), pow(), sqrt(), log(), ln(), exp(), abs(), min(), max()
                      </p>
                      <textarea
                        value={editExpr}
                        onChange={e => { setEditExpr(e.target.value); setValidateResult(null); }}
                        className="w-full h-20 px-3 py-2 rounded bg-background border border-border font-mono text-sm resize-none"
                        placeholder="例: 0.026 * pow(PV, 0.4) * pow(Vs, 0.5) * 3600"
                      />
                    </div>

                    {/* 可用变量列表 */}
                    <div>
                      <span className="text-sm text-muted-foreground">可用变量: </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {['rpm', 'airflow', 'DO', 'temperature', 'pH', 'pressure', 'weight',
                          'feed_P01', 'feed_P02', 'feed_P04',
                          'kLa', 'OUR', 'Vs', 'PV', 'mu', 'cumFeed', 'cumBase', 'cumAcid', 'Vliquid',
                        ].map(v => (
                          <button key={v} onClick={() => setEditExpr(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + v)}
                            className="text-sm font-mono bg-muted/50 hover:bg-primary/15 hover:text-primary px-1.5 py-0.5 rounded cursor-pointer transition-colors">
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 验证按钮 + 结果 */}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={validateExpr}>
                        <Check className="w-3.5 h-3.5 mr-1" />验证语法
                      </Button>
                      {validateResult && (
                        <span className={`text-sm flex items-center gap-1 ${validateResult.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                          {validateResult.valid
                            ? <><Check className="w-3 h-3" />语法正确</>
                            : <><AlertCircle className="w-3 h-3" />{validateResult.error}</>}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button size="sm" onClick={saveFormula} disabled={saving}>
                    <Save className="w-3.5 h-3.5 mr-1" />{saving ? '保存中...' : '保存修改'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetToDefault}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />恢复默认
                  </Button>
                  {current.formula_type === 'expression' && (
                    <span className="text-[12px] bg-yellow-500/15 text-amber-600 px-2 py-0.5 rounded">自定义</span>
                  )}
                  <span className="text-[12px] text-muted-foreground ml-auto">
                    更新: {current.updated_at?.slice(0, 16) || '—'}
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                <Calculator className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm">选择左侧公式查看和编辑系数</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
