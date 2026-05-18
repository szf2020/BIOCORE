'use client';
// SP-FX-8 T2: Retired old viewer. Redirects to /scada2/view-v2/[viewId] which uses RuntimeShell + FuxaView.
import React, { useEffect } from 'react';
import type { JSX } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useLocale } from '@/i18n/useLocale';

export default function Page(): JSX.Element {
  const { t } = useLocale();
  const params = useParams<{ viewId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const viewId = params?.viewId ?? '';
  const reactorId = search?.get('reactor') ?? 'F01';

  useEffect(() => {
    router.replace(`/scada2/view-v2/${viewId}?reactor=${reactorId}`);
  }, [viewId, reactorId, router]);

  return (
    <div role="status" className="p-6 text-slate-400">
      跳转中…
    </div>
  );
}
