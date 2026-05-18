import React, { useState, useEffect, useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

export interface TreeTableNode {
  id: string;
  label: string;
  children?: TreeTableNode[];
}

export interface TreeTableDialogProps {
  isOpen: boolean;
  tree: TreeTableNode[];
  initialValue?: string[];
  title?: string;
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

interface NodeRowProps {
  node: TreeTableNode;
  depth: number;
  selected: Set<string>;
  toggleSel: (id: string) => void;
}

function NodeRow({ node, depth, selected, toggleSel }: NodeRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasKids = Array.isArray(node.children) && node.children.length > 0;
  return (
    <>
      <li className="flex items-center text-sm" style={{ paddingLeft: depth * 12 }}>
        {hasKids ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-4 mr-1 text-zinc-400"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-4 mr-1" />
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label={node.label}
            checked={selected.has(node.id)}
            onChange={() => toggleSel(node.id)}
          />
          <span>{node.label}</span>
        </label>
      </li>
      {hasKids && expanded
        ? node.children!.map((c) => (
            <NodeRow key={c.id} node={c} depth={depth + 1} selected={selected} toggleSel={toggleSel} />
          ))
        : null}
    </>
  );
}

export function TreeTableDialog({
  isOpen,
  tree,
  initialValue,
  title = '选择节点',
  onClose,
  onConfirm,
}: TreeTableDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialValue ?? []));

  useEffect(() => {
    if (isOpen) setSelected(new Set(initialValue ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSel = (id: string) => {
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        data-dialog="tree-table"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-96 max-h-[80vh] flex flex-col"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        {tree.length === 0 ? (
          <p className="text-sm text-zinc-500">无可选项</p>
        ) : (
          <ul className="overflow-y-auto mb-3 space-y-1">
            {tree.map((n) => (
              <NodeRow key={n.id} node={n} depth={0} selected={selected} toggleSel={toggleSel} />
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
            onClick={() => onConfirm(Array.from(selected))}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
