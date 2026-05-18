import React, { useState, useEffect } from 'react';

export interface SelOptionsDialogProps {
  isOpen: boolean;
  options: { value: string; label: string }[];
  multi?: boolean;
  initialValue?: string | string[];
  title?: string;
  onClose: () => void;
  onConfirm: (value: string | string[]) => void;
}

export function SelOptionsDialog({
  isOpen,
  options,
  multi = false,
  initialValue,
  title = '选择',
  onClose,
  onConfirm,
}: SelOptionsDialogProps): JSX.Element | null {
  const [selected, setSelected] = useState<string[]>(() => {
    if (Array.isArray(initialValue)) return initialValue;
    if (typeof initialValue === 'string') return [initialValue];
    return [];
  });

  useEffect(() => {
    if (isOpen) {
      if (Array.isArray(initialValue)) setSelected(initialValue);
      else if (typeof initialValue === 'string') setSelected([initialValue]);
      else setSelected([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const toggle = (v: string) => {
    if (multi) {
      setSelected((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
    } else {
      setSelected([v]);
    }
  };

  const invalid = selected.length === 0;

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="sel-options"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-80 max-h-[80vh] flex flex-col"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        {options.length === 0 ? (
          <p className="text-sm text-zinc-500">无可选项</p>
        ) : (
          <ul className="overflow-y-auto mb-3 space-y-1">
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={`w-full text-left px-2 py-1 text-sm rounded ${selected.includes(o.value) ? 'bg-blue-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
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
            disabled={!multi && invalid}
            onClick={() => onConfirm(multi ? selected : selected[0]!)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
