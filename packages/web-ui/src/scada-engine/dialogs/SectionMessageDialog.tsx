'use client';
import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export type MessageLevel = 'info' | 'warn' | 'error';

export interface SectionMessageDialogProps {
  open: boolean;
  level: MessageLevel;
  title: string;
  message: string;
  onClose: () => void;
}

const LEVEL_STYLES: Record<MessageLevel, { icon: string; ring: string }> = {
  info:  { icon: 'ℹ', ring: 'border-blue-500/30' },
  warn:  { icon: '⚠', ring: 'border-amber-500/40' },
  error: { icon: '✕', ring: 'border-red-500/50' },
};

export function SectionMessageDialog({ open, level, title, message, onClose }: SectionMessageDialogProps) {
  const style = LEVEL_STYLES[level];
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        data-level={level}
        className={`max-w-md rounded-lg bg-background p-6 shadow-lg border-2 ${style.ring}`}
      >
        <h2 className="text-lg font-semibold mb-2">
          <span className="mr-2">{style.icon}</span>{title}
        </h2>
        <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end">
          <button
            type="button"
            className="px-4 py-2 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
