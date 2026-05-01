// ConditionExpressionEditor — 条件表达式编辑器 (M3.8 UI)
// 提供简易 3 栏 (field / op / value) + 自由文本输入 + 后端实时校验
'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { CheckCircle, AlertCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const FIELDS = ['temperature', 'pH', 'DO', 'OD600', 'weight', 'phase_elapsed_min', 'total_elapsed_min'] as const;
const OPS = ['>', '<', '>=', '<=', '==', '!='] as const;

interface Props {
  value: string;
  onChange: (expression: string, valid: boolean) => void;
}

export function ConditionExpressionEditor({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value);
  const [validity, setValidity] = useState<{ ok: boolean; error?: string } | null>(null);
  const [debouncing, setDebouncing] = useState(false);

  // 同步外部 value
  useEffect(() => { setDraft(value); }, [value]);

  // debounced 校验
  useEffect(() => {
    if (!draft.trim()) {
      setValidity(null);
      return;
    }
    setDebouncing(true);
    const timer = setTimeout(() => {
      apiFetch(`${API}/api/v1/recipes/validate-expression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: draft }),
      })
        .then(r => r.json())
        .then(data => {
          const ok = data?.valid === true;
          setValidity({ ok, error: data?.error });
          onChange(draft, ok);
        })
        .catch(() => setValidity({ ok: false, error: '校验失败' }))
        .finally(() => setDebouncing(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // 点击字段插入
  const insertToken = (token: string) => {
    setDraft(prev => prev ? `${prev} ${token}` : token);
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-muted-foreground">条件表达式</label>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder='例如: OD600 > 5 && temperature >= 37'
          rows={2}
          className={`mt-1 w-full px-2 py-1.5 rounded bg-background border text-xs font-mono
            ${validity?.ok === false ? 'border-red-500/50' : validity?.ok ? 'border-green-500/50' : 'border-border'}`}
        />
        <div className="mt-1 flex items-center gap-1 text-[10px]">
          {debouncing ? (
            <span className="text-muted-foreground">校验中...</span>
          ) : validity?.ok ? (
            <><CheckCircle className="w-3 h-3 text-emerald-600" /><span className="text-emerald-600">合法</span></>
          ) : validity ? (
            <><AlertCircle className="w-3 h-3 text-red-600" /><span className="text-red-600">{validity.error}</span></>
          ) : (
            <span className="text-muted-foreground">请输入表达式</span>
          )}
        </div>
      </div>

      <div>
        <div className="text-[10px] text-muted-foreground mb-1">快捷插入</div>
        <div className="flex flex-wrap gap-1 mb-1">
          {FIELDS.map(f => (
            <button key={f} type="button" onClick={() => insertToken(f)}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary hover:bg-primary/20">
              {f}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 mb-1">
          {OPS.map(op => (
            <button key={op} type="button" onClick={() => insertToken(op)}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-foreground hover:bg-muted/70">
              {op}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {['&&', '||'].map(l => (
            <button key={l} type="button" onClick={() => insertToken(l)}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-900/30 text-amber-300 hover:bg-amber-900/50">
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
