import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

export interface DateRangePickerDialogProps {
  isOpen: boolean;
  initialValue?: { from: Date; to: Date };
  title?: string;
  onClose: () => void;
  onConfirm: (value: { from: Date; to: Date }) => void;
}

function toInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromInputValue(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function DateRangePickerDialog({
  isOpen,
  initialValue,
  title = '选择日期范围',
  onClose,
  onConfirm,
}: DateRangePickerDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);
  const init = initialValue ?? { from: new Date(), to: new Date() };
  const [from, setFrom] = useState<Date>(init.from);
  const [to, setTo] = useState<Date>(init.to);

  useEffect(() => {
    if (isOpen) {
      setFrom(init.from);
      setTo(init.to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;
  const invalid = from.getTime() > to.getTime();

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        data-dialog="date-range-picker"
        onKeyDown={handleKey}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-80"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <label className="block text-sm mb-1">起始</label>
        <input
          type="date"
          value={toInputValue(from)}
          onChange={(e) => setFrom(fromInputValue(e.target.value))}
          className={`w-full px-2 py-1 mb-2 bg-zinc-800 rounded ${invalid ? 'border border-red-500' : ''}`}
        />
        <label className="block text-sm mb-1">结束</label>
        <input
          type="date"
          value={toInputValue(to)}
          onChange={(e) => setTo(fromInputValue(e.target.value))}
          className={`w-full px-2 py-1 mb-3 bg-zinc-800 rounded ${invalid ? 'border border-red-500' : ''}`}
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
            onClick={() => onConfirm({ from, to })}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
