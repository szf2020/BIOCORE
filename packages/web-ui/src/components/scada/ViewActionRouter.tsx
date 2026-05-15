'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { WriteIntentDialog } from './WriteIntentDialog';

export interface PendingIntent {
  widgetId: string;
  action: string;
  payload?: any;
}

export function ViewActionRouter({
  viewId,
  children,
}: {
  viewId: string;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState<PendingIntent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (!ce.detail || typeof ce.detail.widgetId !== 'string') return;
      setPending({
        widgetId: ce.detail.widgetId,
        action: ce.detail.action,
        payload: ce.detail.payload,
      });
    };
    document.addEventListener('widget-action', handler);
    return () => document.removeEventListener('widget-action', handler);
  }, []);

  const handleClose = useCallback(() => setPending(null), []);

  return (
    <>
      {children}
      <WriteIntentDialog
        open={pending !== null}
        pending={pending}
        viewId={viewId}
        onClose={handleClose}
      />
    </>
  );
}
