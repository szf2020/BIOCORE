// SP-FX-6: Schema types for schema-driven PropertyPanel. Pure type definitions.

export type PropertySchemaEntry =
  | TextEntry | NumberEntry | ColorEntry | RangeEntry
  | TagRefEntry | SelectEntry | BooleanEntry | TextareaEntry;

interface BaseEntry {
  key: string;
  label: string;
  /** If true, written to widget top-level (x/y/w/h/rotate); else to widget.property */
  geometric?: boolean;
}

interface TextEntry extends BaseEntry { type: 'text'; placeholder?: string; maxLength?: number; }
interface NumberEntry extends BaseEntry { type: 'number'; min?: number; max?: number; step?: number; decimals?: number; }
interface ColorEntry extends BaseEntry { type: 'color'; allowNone?: boolean; }
interface RangeEntry extends BaseEntry { type: 'range'; segments: Array<{ labelKey: string; colorKey: string }>; }
interface TagRefEntry extends BaseEntry { type: 'tag-ref'; filterPrefix?: string; }
interface SelectEntry extends BaseEntry { type: 'select'; options: Array<{ value: string; label: string }>; }
interface BooleanEntry extends BaseEntry { type: 'boolean'; }
interface TextareaEntry extends BaseEntry { type: 'textarea'; rows?: number; placeholder?: string; }

export interface WidgetPropertySchema {
  entries: PropertySchemaEntry[];
  renderCustomSection?: (
    property: Record<string, unknown>,
    onChange: (patch: Partial<Record<string, unknown>>) => void,
  ) => JSX.Element;
}
