// SP-FX-6: schema-driven property panel for selected widget.

import React from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import type { FuxaWidget } from '../../models';
import type { WidgetPropertySchema, PropertySchemaEntry } from './property-schema';

const PROCESS_VALUES_FIELDS = [
  'AI-0', 'AI-1', 'AI-2', 'AI-3', 'AI-4', 'AI-5', 'AI-6',
  'AO-0_cv', 'AO-1_cv', 'AO-2_cv',
  'P01_rate', 'P02_rate', 'P03_rate', 'P04_rate',
  'rpm', 'vfd_current', 'temp_sv', 'temp_mode',
] as const;

export interface PropertyPanelProps {
  widget: FuxaWidget | null;
  schema: WidgetPropertySchema | null;
  onChange: (patch: Partial<FuxaWidget>) => void;
  /** SP-FX-25: mobile bottom-sheet 模式 */
  mobileMode?: boolean;
}

const BASE_CLASS = 'w-[250px] flex-shrink-0 border-l border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100 overflow-y-auto';
const BOTTOM_SHEET_CLASS = 'fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 border-t border-zinc-700 p-3 text-sm text-zinc-100 overflow-y-auto max-h-[60vh]';

/** 内容区复用组件，避免重复 JSX */
function PropertyContent({
  widget, schema, tagOptions, onChange,
}: {
  widget: FuxaWidget;
  schema: WidgetPropertySchema;
  tagOptions: string[];
  onChange: (patch: Partial<FuxaWidget>) => void;
}): JSX.Element {
  const property = (widget.property ?? {}) as Record<string, unknown>;

  function handleChange(entry: PropertySchemaEntry, rawValue: unknown): void {
    if (entry.geometric) {
      const numVal = typeof rawValue === 'string' ? parseFloat(rawValue as string) : rawValue;
      if (typeof numVal === 'number' && !Number.isNaN(numVal)) {
        onChange({ [entry.key]: numVal } as Partial<FuxaWidget>);
      }
    } else {
      onChange({ property: { ...property, [entry.key]: rawValue } } as Partial<FuxaWidget>);
    }
  }

  return (
    <div className="space-y-2">
      {schema.entries.map((entry) => (
        <div key={entry.key} className="flex flex-col gap-0.5">
          <label className="text-xs text-zinc-400">{entry.label}</label>
          <EntryInput entry={entry} widget={widget} property={property} tagOptions={tagOptions} onChange={handleChange} />
        </div>
      ))}
      {schema.renderCustomSection && (
        <>
          <hr className="border-zinc-700 my-2" />
          {schema.renderCustomSection(
            property,
            (patch) => onChange({ property: { ...property, ...patch } } as Partial<FuxaWidget>),
          )}
        </>
      )}
    </div>
  );
}

export function PropertyPanel({ widget, schema, onChange, mobileMode = false }: PropertyPanelProps): JSX.Element {
  const reactorData = useRealtimeStore((s) => s.reactorData);
  const tagOptions = Object.keys(reactorData).flatMap((rid) =>
    PROCESS_VALUES_FIELDS.map((f) => `${rid}.${f}`)
  );

  // SP-FX-25: bottom-sheet mode for mobile
  if (mobileMode) {
    return (
      <div
        data-testid="property-panel-bottom-sheet"
        data-panel="properties"
        className={BOTTOM_SHEET_CLASS}
      >
        {/* drag handle */}
        <div
          data-testid="bottom-sheet-handle"
          className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mb-3 cursor-grab"
        />
        {!widget && <p>未选中</p>}
        {widget && !schema && <p>无属性面板</p>}
        {widget && schema && (
          <PropertyContent widget={widget} schema={schema} tagOptions={tagOptions} onChange={onChange} />
        )}
      </div>
    );
  }

  if (!widget) {
    return <aside data-panel="properties" className={BASE_CLASS}><p>未选中</p></aside>;
  }
  if (!schema) {
    return <aside data-panel="properties" className={BASE_CLASS}><p>无属性面板</p></aside>;
  }

  return (
    <aside data-panel="properties" className={BASE_CLASS}>
      <PropertyContent widget={widget} schema={schema} tagOptions={tagOptions} onChange={onChange} />
    </aside>
  );
}

interface EntryInputProps {
  entry: PropertySchemaEntry;
  widget: FuxaWidget;
  property: Record<string, unknown>;
  tagOptions: string[];
  onChange: (entry: PropertySchemaEntry, value: unknown) => void;
}

function EntryInput({ entry, widget, property, tagOptions, onChange }: EntryInputProps): JSX.Element {
  const currentVal = entry.geometric
    ? (widget as Record<string, unknown>)[entry.key]
    : property[entry.key];

  switch (entry.type) {
    case 'text':
      return (
        <input type="text" data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full"
          placeholder={entry.placeholder} maxLength={entry.maxLength}
          value={typeof currentVal === 'string' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)} />
      );
    case 'number':
      return (
        <input type="number" data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full"
          min={entry.min} max={entry.max} step={entry.step ?? 1}
          value={typeof currentVal === 'number' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)} />
      );
    case 'color':
      return (
        <input type="color" data-key={entry.key}
          className="h-8 w-full cursor-pointer border border-zinc-600 rounded"
          value={typeof currentVal === 'string' && currentVal ? currentVal : '#000000'}
          onChange={(e) => onChange(entry, e.target.value)} />
      );
    case 'boolean':
      return (
        <input type="checkbox" data-key={entry.key} className="accent-blue-500"
          checked={Boolean(currentVal)}
          onChange={(e) => onChange(entry, e.target.checked)} />
      );
    case 'textarea':
      return (
        <textarea data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full resize-none"
          rows={entry.rows ?? 3} placeholder={entry.placeholder}
          value={typeof currentVal === 'string' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)} />
      );
    case 'tag-ref':
      return (
        <select data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full"
          value={typeof currentVal === 'string' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)}>
          <option value="">{tagOptions.length === 0 ? '无可用 Tag' : '-- 请选择 --'}</option>
          {tagOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      );
    case 'select':
      return (
        <select data-key={entry.key}
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full"
          value={typeof currentVal === 'string' ? currentVal : ''}
          onChange={(e) => onChange(entry, e.target.value)}>
          {entry.options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      );
    case 'range':
      return (
        <div data-key={entry.key} className="space-y-1">
          {entry.segments.map((seg, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input type="text" data-key={`${entry.key}-label-${i}`}
                className="bg-zinc-800 border border-zinc-600 rounded px-1 py-0.5 text-xs flex-1"
                placeholder={seg.labelKey}
                value={typeof property[seg.labelKey] === 'string' ? (property[seg.labelKey] as string) : ''}
                onChange={(e) => onChange({ ...entry, key: seg.labelKey, geometric: false }, e.target.value)} />
              <input type="color" data-key={`${entry.key}-color-${i}`}
                className="h-6 w-10 cursor-pointer border border-zinc-600 rounded"
                value={typeof property[seg.colorKey] === 'string' && property[seg.colorKey] ? (property[seg.colorKey] as string) : '#000000'}
                onChange={(e) => onChange({ ...entry, key: seg.colorKey, geometric: false }, e.target.value)} />
            </div>
          ))}
        </div>
      );
    default:
      return <span className="text-zinc-500 text-xs">未知类型</span>;
  }
}
