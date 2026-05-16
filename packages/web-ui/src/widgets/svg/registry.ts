import type { SvgWidgetComponent } from './types';

export interface SvgWidgetRegistration {
  type: string;
  label: string;
  component: SvgWidgetComponent;
  defaults?: { w: number; h: number };
}

const registry = new Map<string, SvgWidgetRegistration>();
let builtinRegistered = false;

export function registerSvg(reg: SvgWidgetRegistration): void {
  if (registry.has(reg.type)) {
    throw new Error(`duplicate widget type: ${reg.type}`);
  }
  registry.set(reg.type, reg);
}

export function getSvgWidget(type: string): SvgWidgetRegistration | undefined {
  return registry.get(type);
}

export function listSvgWidgets(): SvgWidgetRegistration[] {
  return Array.from(registry.values()).sort((a, b) => a.type.localeCompare(b.type));
}

// Test-only helpers. Not exported from index barrel.
export function _resetSvgRegistryForTests(): void {
  registry.clear();
  builtinRegistered = false;
}

export function _isBuiltinRegistered(): boolean {
  return builtinRegistered;
}

export function _setBuiltinRegistered(value: boolean): void {
  builtinRegistered = value;
}
