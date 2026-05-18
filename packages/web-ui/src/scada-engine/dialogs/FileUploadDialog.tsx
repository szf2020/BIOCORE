'use client';
import React, { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useFocusTrap } from './useFocusTrap';

export interface FileUploadDialogProps {
  open: boolean;
  accept?: string;
  multiple?: boolean;
  maxSizeBytes?: number;
  onUpload: (files: File[]) => Promise<void>;
  onCancel: () => void;
}

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

export function FileUploadDialog({
  open, accept, multiple = false,
  maxSizeBytes = DEFAULT_MAX_SIZE, onUpload, onCancel,
}: FileUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, open);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const tooBig = files.find((f) => f.size > maxSizeBytes);
    if (tooBig) {
      setError(`文件过大: ${tooBig.name} (${(tooBig.size / 1024).toFixed(0)} KB > ${(maxSizeBytes / 1024).toFixed(0)} KB)`);
      return;
    }
    setBusy(true);
    try {
      await onUpload(files);
    } catch (err) {
      setError((err as Error).message ?? '上传失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent ref={dialogRef} className="max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">选择文件</h2>
        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="block text-sm"
        />
        {busy && <div className="mt-3 text-sm text-muted-foreground">上传中…</div>}
        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end mt-5">
          <button type="button"
            className="px-4 py-2 rounded border border-border text-sm hover:bg-muted"
            onClick={onCancel} disabled={busy}>取消</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
