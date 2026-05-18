import React, { useState, useEffect, useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

export interface EditNameDialogProps {
  isOpen: boolean;
  initialValue?: string;
  title?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

export function EditNameDialog({
  isOpen,
  initialValue = '',
  title = '编辑名称',
  onClose,
  onConfirm,
}: EditNameDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  if (!isOpen) return null;
  const invalid = value.trim().length === 0;

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        data-dialog="edit-name"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-72"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="w-full px-2 py-1 mb-3 bg-zinc-800 rounded"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 text-sm bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            取消
          </button>
          <button
            type="button"
            disabled={invalid}
            onClick={() => onConfirm(value)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
