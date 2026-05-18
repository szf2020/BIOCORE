import React, { useState, useEffect, useId } from 'react';

export interface RangeNumberDialogProps {
  isOpen: boolean;
  initialValue?: { min: number; max: number };
  title?: string;
  onClose: () => void;
  onConfirm: (value: { min: number; max: number }) => void;
}

export function RangeNumberDialog({
  isOpen,
  initialValue = { min: 0, max: 100 },
  title = '范围',
  onClose,
  onConfirm,
}: RangeNumberDialogProps): JSX.Element | null {
  const [min, setMin] = useState<number>(initialValue.min);
  const [max, setMax] = useState<number>(initialValue.max);
  const minId = useId();
  const maxId = useId();

  useEffect(() => {
    if (isOpen) {
      setMin(initialValue.min);
      setMax(initialValue.max);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;
  const invalid = min > max;

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="range-number"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-72"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <label htmlFor={minId} className="block text-sm mb-1">最小值</label>
        <input
          id={minId}
          type="number"
          value={min}
          onChange={(e) => setMin(Number(e.target.value))}
          className={`w-full px-2 py-1 mb-2 bg-zinc-800 rounded ${invalid ? 'border border-red-500' : ''}`}
        />
        <label htmlFor={maxId} className="block text-sm mb-1">最大值</label>
        <input
          id={maxId}
          type="number"
          value={max}
          onChange={(e) => setMax(Number(e.target.value))}
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
            onClick={() => onConfirm({ min, max })}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
