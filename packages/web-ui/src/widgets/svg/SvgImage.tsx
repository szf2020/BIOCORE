import React from 'react';
import type { SvgWidgetComponent } from './types';

export const SvgImage: SvgWidgetComponent = ({ width, height, tagValue, tagStale, config }) => {
  const srcOverride = typeof tagValue === 'string' && tagValue.length > 0 ? tagValue : undefined;
  const srcDefault = typeof config?.src === 'string' ? config.src : undefined;
  const src = srcOverride ?? srcDefault;
  const preserve = typeof config?.preserveAspectRatio === 'string' ? config.preserveAspectRatio : 'xMidYMid meet';

  if (!src) {
    return (
      <g className={tagStale ? 'opacity-50' : undefined}>
        <rect width={width} height={height} fill="#eee" stroke="#aaa" />
        <text x={4} y={14} fontSize={10} fill="#666">?image</text>
      </g>
    );
  }
  return <image href={src} width={width} height={height} preserveAspectRatio={preserve} className={tagStale ? 'opacity-50' : undefined} />;
};
