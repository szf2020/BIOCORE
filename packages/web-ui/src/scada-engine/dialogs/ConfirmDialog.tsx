'use client';
import React, { useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useFocusTrap } from './useFocusTrap';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, open);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel?.(); }}>
      <DialogContent ref={dialogRef} className="max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded border border-border text-sm hover:bg-muted"
            onClick={() => onCancel?.()}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              danger
                ? 'px-4 py-2 rounded text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90'
            }
            onClick={() => onConfirm()}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
