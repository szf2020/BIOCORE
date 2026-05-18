// SP-FX-45: ClockWidget sample plugin 测试 (TDD RED-first)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('clockWidgetPlugin structure', () => {
  it('1. plugin 有正确的 id / name / version', async () => {
    vi.resetModules();
    const { clockWidgetPlugin } = await import('../clock-widget-plugin');
    expect(clockWidgetPlugin.id).toBe('com.biocore.sample.clock');
    expect(clockWidgetPlugin.name).toBeTruthy();
    expect(clockWidgetPlugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('2. plugin 包含一个 widgetType 为 sample-clock 的 widget', async () => {
    vi.resetModules();
    const { clockWidgetPlugin } = await import('../clock-widget-plugin');
    expect(clockWidgetPlugin.widgets).toHaveLength(1);
    expect(clockWidgetPlugin.widgets[0].widgetType).toBe('sample-clock');
  });

  it('3. plugin 包含 zh/en 字典', async () => {
    vi.resetModules();
    const { clockWidgetPlugin } = await import('../clock-widget-plugin');
    expect(clockWidgetPlugin.dictionaries?.zh?.['sample.clock']).toBe('时钟');
    expect(clockWidgetPlugin.dictionaries?.en?.['sample.clock']).toBe('Clock');
  });

  it('4. clock plugin 未自动注册（导入文件不触发 registerPlugin）', async () => {
    vi.resetModules();
    const { listPlugins } = await import('../../loader');
    await import('../clock-widget-plugin');
    const plugins = listPlugins();
    expect(plugins.find(p => p.id === 'com.biocore.sample.clock')).toBeUndefined();
  });

  it('5. create() 返回合法 GaugeBase 对象', async () => {
    vi.resetModules();
    const { clockWidgetPlugin } = await import('../clock-widget-plugin');
    const gauge = clockWidgetPlugin.widgets[0].create();
    expect(typeof gauge.onMount).toBe('function');
    expect(typeof gauge.onUnmount).toBe('function');
    expect(typeof gauge.onProcess).toBe('function');
    expect(typeof gauge.onPropertyChange).toBe('function');
    expect(typeof gauge.onResize).toBe('function');
  });
});

describe('ClockGauge behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('6. onMount 启动计时器 + 1 秒 tick 更新文本内容', async () => {
    const { clockWidgetPlugin } = await import('../clock-widget-plugin');
    const gauge = clockWidgetPlugin.widgets[0].create();

    const svgNS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(svgNS, 'g');
    document.body.appendChild(g);

    const ctx = {
      parentGroup: g,
      readValue: vi.fn().mockReturnValue({ value: null, isStale: false }),
      canvasSize: { width: 200, height: 100 },
      mode: 'runtime' as const,
    };
    const widget = {
      id: 'w1', type: 'sample-clock',
      x: 0, y: 0, w: 200, h: 100, rotate: 0,
      property: {},
    } as any;

    gauge.onMount(widget, ctx);
    vi.advanceTimersByTime(1000);

    const textEl = g.querySelector('text');
    expect(textEl).not.toBeNull();
    expect(textEl?.textContent?.length).toBeGreaterThan(0);

    gauge.onUnmount();
    document.body.removeChild(g);
  });
});
