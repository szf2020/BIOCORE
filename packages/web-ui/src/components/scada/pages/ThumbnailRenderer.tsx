'use client';
import React from 'react';

interface ThumbnailRendererProps {
  svgcontent: string;
  width?: number;
  height?: number;
  viewWidth: number;
  viewHeight: number;
}

/** 防御性 sanitize：去除 script tags 和 on* 事件属性 */
function sanitizeSvg(raw: string): string {
  // strip <script ...>...</script> (含多行, 大小写不敏感)
  let result = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // strip on* 事件属性，如 onclick="..." onmouseover='...'
  result = result.replace(/\s+on\w+=(["'])[^"']*\1/gi, '');
  return result;
}

export function ThumbnailRenderer({
  svgcontent,
  height = 80,
  viewWidth,
  viewHeight,
}: ThumbnailRendererProps) {
  const safe = sanitizeSvg(svgcontent);

  return (
    <svg
      data-testid="thumbnail-svg"
      width="100%"
      height={height}
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ pointerEvents: 'none', display: 'block' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
