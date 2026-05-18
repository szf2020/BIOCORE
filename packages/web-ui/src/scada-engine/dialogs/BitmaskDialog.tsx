import React, { useState, useEffect } from 'react';

export interface BitmaskDialogProps {
  isOpen: boolean;
  bits?: number;
  initialValue?: number;
  title?: string;
  onClose: () => void;
  onConfirm: (value: number) => void;
}

export function BitmaskDialog({
  isOpen,
  bits = 8,
  initialValue = 0,
  title = '位掩码',
  onClose,
  onConfirm,
}: BitmaskDialogProps): JSX.Element | null {
  const [value, setValue] = useState<number>(Math.round(initialValue));

  useEffect(() => {
    if (isOpen) setValue(Math.round(initialValue));
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const toggleBit = (i: number) => {
    setValue((v) => v ^ (1 << i));
  };

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="bitmask"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-80"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {Array.from({ length: bits }).map((_, i) => (
            <label key={i} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={(value & (1 << i)) !== 0}
                onChange={() => toggleBit(i)}
              />
              bit{i}
            </label>
          ))}
        </div>
        <div className="text-sm mb-3">值: <span data-bitmask-value>{value}</span></div>
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
            onClick={() => onConfirm(value)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
