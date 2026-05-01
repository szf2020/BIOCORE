'use client';

import dynamic from 'next/dynamic';
import type { EChartsWrapperProps } from './EChartsWrapper';

// 动态导入 ECharts: 将 ~800KB 的 echarts 库从页面初始 chunk 分离出来
// 页面切换时先渲染页面骨架, ECharts 异步加载后再渲染图表
const EChartsWrapperDynamic = dynamic<EChartsWrapperProps>(
  () => import('./EChartsWrapper').then(m => ({ default: m.EChartsWrapper })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
        图表加载中...
      </div>
    ),
  },
);

export { EChartsWrapperDynamic as EChartsWrapper };
