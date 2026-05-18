'use client';
import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TemplatePicker } from '@/components/scada/pages/TemplatePicker';
import { useViewMutations } from '@/hooks/useViewMutations';
import { useLocale } from '@/i18n/useLocale';

export default function Page() {
  const { t } = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search?.get('project') ?? 'default';

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { create } = useViewMutations(projectId);

  async function handleCreate() {
    if (!name.trim() || templateId === undefined) return;
    setCreating(true);
    setError(null);
    try {
      const newId = await create(name.trim(), { cloneFrom: templateId ?? undefined });
      router.replace(`/scada2/edit-v2/${newId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 480 }}>
      <h2>新建画面</h2>
      <label style={{ display: 'block', marginBottom: 8 }}>
        名称
        <input
          data-testid="new-view-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%' }}
          autoFocus
        />
      </label>
      {templateId === undefined ? (
        <TemplatePicker
          projectId={projectId}
          onPick={(t) => setTemplateId(t)}
          onCancel={() => router.replace(`/scada2?project=${encodeURIComponent(projectId)}`)}
        />
      ) : (
        <div style={{ marginBottom: 8 }}>
          模板: {templateId === null ? '空白' : templateId}
          <button onClick={() => setTemplateId(undefined)} style={{ marginLeft: 8 }}>更改</button>
        </div>
      )}
      <button onClick={handleCreate} disabled={creating || templateId === undefined || !name.trim()}>
        {creating ? '创建中…' : '创建'}
      </button>
      {error && <div data-testid="new-view-error" style={{ color: '#dc2626', marginTop: 8 }}>错误: {error}</div>}
    </div>
  );
}
