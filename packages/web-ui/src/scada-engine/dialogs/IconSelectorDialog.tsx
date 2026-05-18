import React, { useState, useMemo, useEffect } from 'react';
import {
  Home, Settings, User, Lock, Unlock, Bell, Mail, Search,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Plus, Minus, X, Check, Pencil, Trash2,
  Save, FileText, Folder, FolderOpen, Download, Upload,
  Power, Pause, Play, Square as StopSquare, RefreshCw, RotateCcw,
  Activity, AlertTriangle, AlertCircle, Info, CheckCircle, XCircle,
  Eye, EyeOff, Star, Heart, Tag, Filter,
  Calendar, Clock, MapPin, Phone, Camera, Image,
  type LucideIcon,
} from 'lucide-react';

interface IconEntry {
  id: string;
  Icon: LucideIcon;
}

const ENTRIES: IconEntry[] = [
  { id: 'home', Icon: Home }, { id: 'settings', Icon: Settings }, { id: 'user', Icon: User },
  { id: 'lock', Icon: Lock }, { id: 'unlock', Icon: Unlock }, { id: 'bell', Icon: Bell },
  { id: 'mail', Icon: Mail }, { id: 'search', Icon: Search },
  { id: 'chevron-up', Icon: ChevronUp }, { id: 'chevron-down', Icon: ChevronDown },
  { id: 'chevron-left', Icon: ChevronLeft }, { id: 'chevron-right', Icon: ChevronRight },
  { id: 'arrow-up', Icon: ArrowUp }, { id: 'arrow-down', Icon: ArrowDown },
  { id: 'arrow-left', Icon: ArrowLeft }, { id: 'arrow-right', Icon: ArrowRight },
  { id: 'plus', Icon: Plus }, { id: 'minus', Icon: Minus }, { id: 'x', Icon: X },
  { id: 'check', Icon: Check }, { id: 'pencil', Icon: Pencil }, { id: 'trash', Icon: Trash2 },
  { id: 'save', Icon: Save }, { id: 'file-text', Icon: FileText },
  { id: 'folder', Icon: Folder }, { id: 'folder-open', Icon: FolderOpen },
  { id: 'download', Icon: Download }, { id: 'upload', Icon: Upload },
  { id: 'power', Icon: Power }, { id: 'pause', Icon: Pause }, { id: 'play', Icon: Play },
  { id: 'stop', Icon: StopSquare }, { id: 'refresh', Icon: RefreshCw }, { id: 'rotate', Icon: RotateCcw },
  { id: 'activity', Icon: Activity }, { id: 'warning', Icon: AlertTriangle },
  { id: 'alert', Icon: AlertCircle }, { id: 'info', Icon: Info },
  { id: 'success', Icon: CheckCircle }, { id: 'error', Icon: XCircle },
  { id: 'eye', Icon: Eye }, { id: 'eye-off', Icon: EyeOff },
  { id: 'star', Icon: Star }, { id: 'heart', Icon: Heart },
  { id: 'tag', Icon: Tag }, { id: 'filter', Icon: Filter },
  { id: 'calendar', Icon: Calendar }, { id: 'clock', Icon: Clock },
  { id: 'map-pin', Icon: MapPin }, { id: 'phone', Icon: Phone },
  { id: 'camera', Icon: Camera }, { id: 'image', Icon: Image },
];

export const ICON_LIST: ReadonlyArray<string> = ENTRIES.map((e) => e.id);

export interface IconSelectorDialogProps {
  isOpen: boolean;
  initialValue?: string;
  title?: string;
  onClose: () => void;
  onConfirm: (iconId: string) => void;
}

export function IconSelectorDialog({
  isOpen,
  initialValue,
  title = '选择图标',
  onClose,
  onConfirm,
}: IconSelectorDialogProps): JSX.Element | null {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | undefined>(initialValue);

  useEffect(() => {
    if (isOpen) {
      setQ('');
      setSel(initialValue);
    }
  }, [isOpen, initialValue]);

  const filtered = useMemo(() => {
    if (!q.trim()) return ENTRIES;
    const lo = q.toLowerCase();
    return ENTRIES.filter((e) => e.id.toLowerCase().includes(lo));
  }, [q]);

  if (!isOpen) return null;

  return (
    <div
      data-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        role="dialog"
        data-dialog="icon-selector"
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className="bg-zinc-900 text-zinc-100 rounded shadow-lg p-4 w-96 max-h-[80vh] flex flex-col"
      >
        <h2 className="text-lg font-medium mb-3">{title}</h2>
        <input
          type="text"
          placeholder="搜索图标..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="px-2 py-1 mb-2 bg-zinc-800 rounded text-sm"
        />
        <ul className="grid grid-cols-6 gap-2 overflow-y-auto mb-3">
          {filtered.map(({ id, Icon }) => (
            <li
              key={id}
              data-icon={id}
              data-selected={sel === id ? 'true' : 'false'}
              onClick={() => setSel(id)}
              title={id}
              className={`cursor-pointer p-2 rounded flex items-center justify-center ${sel === id ? 'bg-blue-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}
            >
              <Icon size={20} />
            </li>
          ))}
        </ul>
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
            disabled={!sel}
            onClick={() => onConfirm(sel!)}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
