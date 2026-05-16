import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgRect: SvgWidgetComponent = ({ width, height, config }) => {
  const fill = typeof config?.fill === 'string' ? (config.fill as string) : '#999';
  return <rect width={width} height={height} fill={fill} />;
};
