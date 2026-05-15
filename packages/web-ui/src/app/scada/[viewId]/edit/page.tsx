'use client';
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchView, type ScadaView } from '@/api/scada';
import { EditorShell } from '@/components/scada/editor/EditorShell';

export default function ScadaEditPage() {
  const params = useParams() as { viewId: string };
  const viewId = params.viewId;
  const router = useRouter();
  const [view, setView] = useState<ScadaView | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('biocore_user');
      if (userStr) {
        try {
          const u = JSON.parse(userStr);
          if (u?.role && !['admin', 'engineer'].includes(u.role)) {
            router.replace(`/scada/${viewId}`);
            return;
          }
        } catch {
          /* malformed JSON — fall through to fetch (server gates via 401) */
        }
      }
    }
    fetchView(viewId).then(setView).catch((e) => setErr(String(e)));
  }, [viewId, router]);

  if (err) return <div className="p-6 text-red-700">{err}</div>;
  if (!view) return <div className="p-6 text-gray-500">加载中…</div>;
  return <EditorShell view={view} />;
}
