'use client';
// SP-FX-48: 旧 SvgEditor 退役 — redirect to /scada2/edit-v2/[viewId]
import { useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

export default function Page() {
  const params = useParams<{ viewId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const viewId = params?.viewId ?? '';
  const qs = search?.toString();

  useEffect(() => {
    const target = `/scada2/edit-v2/${encodeURIComponent(viewId)}${qs ? '?' + qs : ''}`;
    router.replace(target);
  }, [viewId, qs, router]);

  return <div style={{ padding: 16, color: '#71717a' }}>跳转到新编辑器…</div>;
}
