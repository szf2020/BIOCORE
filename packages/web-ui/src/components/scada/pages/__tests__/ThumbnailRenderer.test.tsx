import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThumbnailRenderer } from '../ThumbnailRenderer';

describe('ThumbnailRenderer', () => {
  it('1. 空 svgcontent 时渲染空 SVG（不崩溃）', () => {
    render(<ThumbnailRenderer svgcontent="" viewWidth={800} viewHeight={600} />);
    const svg = screen.getByTestId('thumbnail-svg');
    expect(svg).toBeTruthy();
  });

  it('2. 有 svgcontent 时渲染带 data-testid="thumbnail-svg" 的 SVG', () => {
    render(
      <ThumbnailRenderer svgcontent='<rect x="0" y="0" width="10" height="10"/>' viewWidth={800} viewHeight={600} />
    );
    expect(screen.getByTestId('thumbnail-svg')).toBeTruthy();
  });

  it('3. viewBox 正确拼接 viewWidth/viewHeight', () => {
    render(
      <ThumbnailRenderer svgcontent='<circle cx="5" cy="5" r="5"/>' viewWidth={1024} viewHeight={768} />
    );
    const svg = screen.getByTestId('thumbnail-svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 1024 768');
  });

  it('4. sanitize: strip <script> tags', () => {
    const evil = '<script>alert(1)</script><rect x="0" y="0" width="10" height="10"/>';
    const { container } = render(
      <ThumbnailRenderer svgcontent={evil} viewWidth={800} viewHeight={600} />
    );
    expect(container.innerHTML).not.toContain('<script');
    expect(container.innerHTML).not.toContain('alert(1)');
  });

  it('5. sanitize: strip on* 事件属性', () => {
    const evil = '<rect onclick="evil()" onmouseover="bad()" x="0" y="0" width="10" height="10"/>';
    const { container } = render(
      <ThumbnailRenderer svgcontent={evil} viewWidth={800} viewHeight={600} />
    );
    expect(container.innerHTML).not.toContain('onclick');
    expect(container.innerHTML).not.toContain('onmouseover');
  });

  it('6. 合法元素内容保留注入到 SVG 内部', () => {
    const safe = '<rect x="0" y="0" width="100" height="50" fill="red"/>';
    const { container } = render(
      <ThumbnailRenderer svgcontent={safe} viewWidth={800} viewHeight={600} />
    );
    expect(container.querySelector('rect')).toBeTruthy();
  });

  it('7. 默认 height=80 应用到 SVG 元素', () => {
    render(<ThumbnailRenderer svgcontent="" viewWidth={800} viewHeight={600} />);
    const svg = screen.getByTestId('thumbnail-svg');
    expect(svg.getAttribute('height')).toBe('80');
  });

  it('8. preserveAspectRatio="xMidYMid meet" 属性存在', () => {
    render(<ThumbnailRenderer svgcontent="" viewWidth={800} viewHeight={600} />);
    const svg = screen.getByTestId('thumbnail-svg');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });
});
