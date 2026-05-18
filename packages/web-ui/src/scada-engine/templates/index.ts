// packages/web-ui/src/scada-engine/templates/index.ts
// SP-FX-41: 内置视图模板库 — 打包内静态数据，无需 server endpoint
import type { FuxaView } from '../models/hmi';

import cstrJson from './cstr.json';
import pfrJson from './pfr.json';
import fedbatchJson from './fedbatch.json';
import bioreactorJson from './bioreactor.json';
import simpleDashboardJson from './simple-dashboard.json';

export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  widgetCount: number;
  view: FuxaView;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-cstr',
    name: 'CSTR 连续搅拌反应器',
    description: '典型连续搅拌罐式反应器：主罐、进料泵、进出料阀、温度/pH 显示、搅拌指示灯',
    widgetCount: 8,
    view: cstrJson as FuxaView,
  },
  {
    id: 'builtin-pfr',
    name: 'PFR 活塞流反应器',
    description: '管式活塞流反应器：进料泵、背压阀、入口/出口温度、流量显示',
    widgetCount: 7,
    view: pfrJson as FuxaView,
  },
  {
    id: 'builtin-fedbatch',
    name: 'Fed-batch 流加批式',
    description: '流加批式反应器：主罐+补料槽双罐、补液/收获泵、补料/出料阀、温度/溶氧、过程趋势',
    widgetCount: 11,
    view: fedbatchJson as FuxaView,
  },
  {
    id: 'builtin-bioreactor',
    name: 'Bioreactor 生物反应器',
    description: '完整生物反应器监控：主发酵罐、空气/补液泵、三阀、温度/pH/DO/转速、报警灯、过程曲线',
    widgetCount: 14,
    view: bioreactorJson as FuxaView,
  },
  {
    id: 'builtin-simple-dashboard',
    name: '简单仪表盘',
    description: '基础过程参数监控：温度 + 流量 + pH 三个数值表 + 实时趋势图',
    widgetCount: 5,
    view: simpleDashboardJson as FuxaView,
  },
];
