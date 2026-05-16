import type { SvgWidgetComponent } from './types';

export interface SvgWidgetRegistration {
  type: string;
  label: string;
  component: SvgWidgetComponent;
  defaults?: { w: number; h: number };
}

const registry = new Map<string, SvgWidgetRegistration>();

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

// Test-only helper. Not exported from index barrel.
export function _resetSvgRegistryForTests(): void {
  registry.clear();
}
