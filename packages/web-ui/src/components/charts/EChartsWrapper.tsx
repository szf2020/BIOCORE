// ============================================================
// EChartsWrapper — 通用 ECharts 包装器 (Sprint 2 M2.7)
//
// 'use client' 让整个组件只在浏览器执行, 不需要 dynamic import
// 直接用 echarts/core + 手动注册需要模块, tree-shake 友好
// ============================================================

'use client';

import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart, BoxplotChart, GaugeChart, BarChart, HeatmapChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
  MarkLineComponent,
  ToolboxComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

// 注册需要的 echarts 模块 (tree-shake), 模块层只跑一次
let registered = false;
function ensureRegistered() {
  if (registered) return;
  echarts.use([
    LineChart,
    ScatterChart,
    BoxplotChart,
    GaugeChart,
    BarChart,
    HeatmapChart,
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent,
    TitleComponent,
    MarkLineComponent,
    ToolboxComponent,
    VisualMapComponent,
    CanvasRenderer,
  ]);
  registered = true;
}

export interface EChartsWrapperProps {
  option: EChartsOption | Record<string, any>;
  style?: React.CSSProperties;
  className?: string;
  notMerge?: boolean;
}

/**
 * 通用 ECharts 包装器
 *
 * 用法:
 * ```tsx
 * <EChartsWrapper option={myOption} style={{ height: 400 }} />
 * ```
 */
export function EChartsWrapper({ option, style, className, notMerge = true }: EChartsWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  // 初始化 + 销毁
  useEffect(() => {
    ensureRegistered();
    if (!containerRef.current) return;
    const inst = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
    instanceRef.current = inst;

    // ResizeObserver 处理容器尺寸变化
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      inst.dispose();
      instanceRef.current = null;
    };
  }, []);

  // option 变化时重设
  useEffect(() => {
    if (instanceRef.current && option) {
      instanceRef.current.setOption(option, notMerge);
    }
  }, [option, notMerge]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', ...style }}
      className={className}
    />
  );
}
