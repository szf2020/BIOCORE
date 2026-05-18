'use client';
import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ViewListPanel } from '@/components/scada/pages/ViewListPanel';

function PageInner() {
  const search = useSearchParams();
  const projectId = search?.get('project') ?? 'default';

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>SCADA 画面集 — 项目 {projectId}</h2>
        <a
          href={`/scada2/edit/new?project=${encodeURIComponent(projectId)}`}
          style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', textDecoration: 'none', borderRadius: 4 }}
        >新建画面</a>
      </div>
      <ViewListPanel projectId={projectId} />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>加载中…</div>}>
      <PageInner />
    </Suspense>
  );
}
