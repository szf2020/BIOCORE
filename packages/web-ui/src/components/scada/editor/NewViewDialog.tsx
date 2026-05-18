'use client';
import React, { useState } from 'react';
import { useLocale } from '@/i18n/useLocale';
import { useRouter } from 'next/navigation';
import { createView, type ScadaProject } from '@/api/scada';

export interface NewViewDialogProps {
  open: boolean;
  projects: ScadaProject[];
  onClose: () => void;
}

export function NewViewDialog({ open, projects, onClose }: NewViewDialogProps) {
  const { t } = useLocale();
  const router = useRouter();
  const [projectId, setProjectId] = useState(projects[0]?.project_id ?? '');
  const [viewId, setViewId] = useState('');
  const [name, setName] = useState('');
  const [reactorId, setReactorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;
  const canSubmit = !!projectId && !!viewId.trim() && !!name.trim() && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await createView(projectId, {
        view_id: viewId.trim(),
        name: name.trim(),
        reactor_id: reactorId.trim() || null,
        width: 800,
        height: 480,
        items: {},
      });
      router.push(`/scada2/edit/${r.view_id}`);
    } catch (e: any) {
      setErr(e?.message || 'create_failed');
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 420 }}
        className="space-y-3"
      >
        <h2 className="text-lg font-semibold">{t('new-view-dialog.title')}</h2>
        <div>
          <label className="block text-sm">项目</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
            {projects.map((p) => (<option key={p.project_id} value={p.project_id}>{p.name}</option>))}
          </select>
        </div>
        <div>
          <label htmlFor="nv-id" className="block text-sm">{t('new-view-dialog.view-id-label')}</label>
          <input id="nv-id" type="text" value={viewId} onChange={(e) => setViewId(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" />
        </div>
        <div>
          <label htmlFor="nv-name" className="block text-sm">{t('new-view-dialog.name-label')}</label>
          <input id="nv-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label htmlFor="nv-reactor" className="block text-sm">Reactor (optional)</label>
          <input id="nv-reactor" type="text" value={reactorId} onChange={(e) => setReactorId(e.target.value)} placeholder="F01" className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border rounded text-sm" disabled={submitting}>{t('new-view-dialog.cancel')}</button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
            {submitting ? '...' : t('new-view-dialog.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
