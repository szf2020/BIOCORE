// SP-RG-4: Phase Instances 管理页 — phase class 绑定到 reactor 的中间层。
'use client';

import React, { useEffect, useState } from 'react';
import { usePhaseInstances, type PhaseInstance } from '@/hooks/usePhaseInstances';

interface ClassMeta { type: string; label: string; color: string; default_params: Record<string, unknown> }
interface ReactorMeta { reactor_id: string; name: string }

function jwtHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const t = localStorage.getItem('biocore_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: jwtHeader() });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j && typeof j === 'object' && 'data' in j ? j.data : j) as T;
}

export default function PhaseInstancesPage(): JSX.Element {
  const [reactorFilter, setReactorFilter] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('');
  const { instances, loading, error, create, update, remove, refetch } = usePhaseInstances({
    reactor: reactorFilter || undefined,
    phaseClass: classFilter || undefined,
  });
  const [classes, setClasses] = useState<ClassMeta[]>([]);
  const [reactors, setReactors] = useState<ReactorMeta[]>([]);
  const [editing, setEditing] = useState<PhaseInstance | null>(null);
  const [creating, setCreating] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [cls, rxs] = await Promise.all([
          jget<ClassMeta[]>('/api/v1/phase-templates'),
          jget<ReactorMeta[]>('/api/v1/reactor-configs'),
        ]);
        setClasses(Array.isArray(cls) ? cls : []);
        setReactors(Array.isArray(rxs) ? rxs : []);
      } catch (e) {
        setOpError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function handleDelete(id: string): Promise<void> {
    if (!confirm(`删除 phase instance "${id}"?`)) return;
    try { await remove(id); setOpError(null); }
    catch (e) { setOpError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Phase Instances <span className="text-sm text-zinc-400 font-normal">— phase class 绑定到反应器的中间层</span></h1>

      <div className="flex gap-2 items-end mb-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">按反应器筛选</label>
          <select value={reactorFilter} onChange={(e) => setReactorFilter(e.target.value)} className="border border-zinc-300 rounded px-2 py-1 text-sm">
            <option value="">全部</option>
            {reactors.map(r => <option key={r.reactor_id} value={r.reactor_id}>{r.reactor_id} — {r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">按 Phase Class 筛选</label>
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="border border-zinc-300 rounded px-2 py-1 text-sm">
            <option value="">全部</option>
            {classes.map(c => <option key={c.type} value={c.type}>{c.label} ({c.type})</option>)}
          </select>
        </div>
        <button onClick={() => setCreating(true)} className="ml-auto px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
          + 新建 Instance
        </button>
        <button onClick={() => refetch()} className="px-3 py-1.5 border border-zinc-300 rounded text-sm hover:bg-zinc-50">
          刷新
        </button>
      </div>

      {opError && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded flex items-center justify-between">
          <span>{opError}</span>
          <button onClick={() => setOpError(null)} className="ml-2 text-red-600 hover:text-red-800">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500">加载中...</div>
      ) : error ? (
        <div className="text-red-600">错误: {error.message}</div>
      ) : instances.length === 0 ? (
        <div className="text-zinc-500 p-8 text-center border border-dashed border-zinc-300 rounded">
          暂无 phase instance — 点击"新建 Instance" 创建第一个绑定
        </div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-100 text-left">
              <th className="px-3 py-2 border-b">Instance ID</th>
              <th className="px-3 py-2 border-b">Phase Class</th>
              <th className="px-3 py-2 border-b">Reactor</th>
              <th className="px-3 py-2 border-b">标签</th>
              <th className="px-3 py-2 border-b">params 覆盖</th>
              <th className="px-3 py-2 border-b">创建</th>
              <th className="px-3 py-2 border-b w-32 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {instances.map(inst => (
              <tr key={inst.instance_id} className="hover:bg-zinc-50 border-b">
                <td className="px-3 py-2 font-mono text-xs">{inst.instance_id}</td>
                <td className="px-3 py-2">{inst.phase_class}</td>
                <td className="px-3 py-2 font-mono text-xs">{inst.reactor_id}</td>
                <td className="px-3 py-2">{inst.label || <span className="text-zinc-400">—</span>}</td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-600 max-w-[300px] truncate" title={JSON.stringify(inst.params_override)}>
                  {Object.keys(inst.params_override).length === 0
                    ? <span className="text-zinc-400">{`{}`}</span>
                    : JSON.stringify(inst.params_override)}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-500">{inst.created_at}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setEditing(inst)} className="text-blue-600 hover:underline mr-3">编辑</button>
                  <button onClick={() => handleDelete(inst.instance_id)} className="text-red-600 hover:underline">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <PhaseInstanceDialog
          classes={classes}
          reactors={reactors}
          onSave={async (form) => {
            try { await create(form); setCreating(false); setOpError(null); }
            catch (e) { setOpError(e instanceof Error ? e.message : String(e)); }
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {editing && (
        <PhaseInstanceDialog
          initial={editing}
          classes={classes}
          reactors={reactors}
          isEdit
          onSave={async (form) => {
            try {
              await update(editing.instance_id, {
                phase_class: form.phase_class,
                reactor_id: form.reactor_id,
                label: form.label,
                params_override: form.params_override,
                notes: form.notes,
              });
              setEditing(null);
              setOpError(null);
            } catch (e) { setOpError(e instanceof Error ? e.message : String(e)); }
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

interface FormState {
  instance_id: string;
  phase_class: string;
  reactor_id: string;
  label: string;
  params_override: Record<string, unknown>;
  notes: string;
}

function PhaseInstanceDialog({
  initial, classes, reactors, isEdit, onSave, onCancel,
}: {
  initial?: PhaseInstance;
  classes: ClassMeta[];
  reactors: ReactorMeta[];
  isEdit?: boolean;
  onSave: (form: FormState) => void | Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [form, setForm] = useState<FormState>(() => ({
    instance_id: initial?.instance_id ?? '',
    phase_class: initial?.phase_class ?? classes[0]?.type ?? '',
    reactor_id: initial?.reactor_id ?? reactors[0]?.reactor_id ?? '',
    label: initial?.label ?? '',
    params_override: initial?.params_override ?? {},
    notes: initial?.notes ?? '',
  }));
  const [paramsText, setParamsText] = useState<string>(JSON.stringify(form.params_override, null, 2));
  const [paramsError, setParamsError] = useState<string | null>(null);

  function updateParams(text: string): void {
    setParamsText(text);
    try {
      const parsed = text.trim() ? JSON.parse(text) : {};
      setForm(f => ({ ...f, params_override: parsed }));
      setParamsError(null);
    } catch {
      setParamsError('JSON 格式错误');
    }
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (paramsError) return;
    void onSave(form);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5"
      >
        <h2 className="text-lg font-semibold mb-4">{isEdit ? '编辑' : '新建'} Phase Instance</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Instance ID *</label>
            <input
              value={form.instance_id}
              onChange={(e) => setForm(f => ({ ...f, instance_id: e.target.value }))}
              required disabled={isEdit}
              placeholder="e.g. F01_HEATING_01"
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm font-mono disabled:bg-zinc-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Phase Class *</label>
              <select
                value={form.phase_class}
                onChange={(e) => setForm(f => ({ ...f, phase_class: e.target.value }))}
                required
                className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
              >
                {classes.map(c => <option key={c.type} value={c.type}>{c.label} ({c.type})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Reactor *</label>
              <select
                value={form.reactor_id}
                onChange={(e) => setForm(f => ({ ...f, reactor_id: e.target.value }))}
                required
                className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
              >
                {reactors.map(r => <option key={r.reactor_id} value={r.reactor_id}>{r.reactor_id} — {r.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">显示标签</label>
            <input
              value={form.label}
              onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="留空则用 phase class 默认"
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">params 覆盖 (JSON)</label>
            <textarea
              value={paramsText}
              onChange={(e) => updateParams(e.target.value)}
              rows={5}
              spellCheck={false}
              className={`w-full border rounded px-2 py-1.5 text-xs font-mono ${paramsError ? 'border-red-400' : 'border-zinc-300'}`}
            />
            {paramsError && <div className="text-xs text-red-600 mt-1">{paramsError}</div>}
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">备注</label>
            <input
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-zinc-300 rounded text-sm hover:bg-zinc-50">取消</button>
          <button type="submit" disabled={!!paramsError} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {isEdit ? '保存' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
