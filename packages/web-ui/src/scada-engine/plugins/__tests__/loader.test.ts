// SP-FX-45: Plugin loader 测试 (TDD RED-first)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BiocorePlugin } from '../types';

// 构造测试用 plugin
function makePlugin(overrides: Partial<BiocorePlugin> = {}): BiocorePlugin {
  return {
    id: 'com.test.widget',
    name: 'Test Widget',
    version: '1.0.0',
    widgets: [],
    ...overrides,
  };
}

describe('Plugin Loader', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('1. registerPlugin 后 listPlugins 包含该 plugin', async () => {
    const { registerPlugin, listPlugins } = await import('../loader');
    const plugin = makePlugin();
    registerPlugin(plugin);
    const list = listPlugins();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('com.test.widget');
  });

  it('2. unregisterPlugin 后 listPlugins 不再包含该 plugin', async () => {
    const { registerPlugin, unregisterPlugin, listPlugins } = await import('../loader');
    const plugin = makePlugin();
    registerPlugin(plugin);
    unregisterPlugin('com.test.widget');
    expect(listPlugins()).toHaveLength(0);
  });

  it('3. 重复 registerPlugin 同一 id 抛出错误', async () => {
    const { registerPlugin } = await import('../loader');
    const plugin = makePlugin();
    registerPlugin(plugin);
    expect(() => registerPlugin(plugin)).toThrow(/already registered/i);
  });

  it('4. id 含禁止词 plc-driver 时 registerPlugin 抛出安全错误', async () => {
    const { registerPlugin } = await import('../loader');
    const bad = makePlugin({ id: 'com.bad.plc-driver.widget' });
    expect(() => registerPlugin(bad)).toThrow(/forbidden/i);
  });

  it('5. widgetType 含禁止词 writeTag 时 registerPlugin 抛出安全错误', async () => {
    const { registerPlugin } = await import('../loader');
    const bad = makePlugin({
      id: 'com.bad.widget',
      widgets: [{
        widgetType: 'writeTag-custom',
        create: () => ({
          onMount: vi.fn(),
          onUnmount: vi.fn(),
          onProcess: vi.fn(),
          onPropertyChange: vi.fn(),
          onResize: vi.fn(),
        }),
        getSignals: () => [],
      }],
    });
    expect(() => registerPlugin(bad)).toThrow(/forbidden/i);
  });

  it('6. unregisterPlugin 不存在 id 时静默返回（不抛出）', async () => {
    const { unregisterPlugin } = await import('../loader');
    expect(() => unregisterPlugin('non.existent.id')).not.toThrow();
  });

  it('7. plugin 加载时调用 onLoad 回调', async () => {
    const { registerPlugin } = await import('../loader');
    const onLoad = vi.fn();
    const plugin = makePlugin({ onLoad });
    registerPlugin(plugin);
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it('8. unregisterPlugin 时调用 onUnload 回调', async () => {
    const { registerPlugin, unregisterPlugin } = await import('../loader');
    const onUnload = vi.fn();
    const plugin = makePlugin({ onUnload });
    registerPlugin(plugin);
    unregisterPlugin('com.test.widget');
    expect(onUnload).toHaveBeenCalledOnce();
  });
});
