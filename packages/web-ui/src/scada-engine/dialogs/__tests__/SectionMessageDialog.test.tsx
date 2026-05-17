import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SectionMessageDialog } from '../SectionMessageDialog';

describe('SectionMessageDialog (SP-FX-2)', () => {
  it('renders title + message when open', () => {
    render(<SectionMessageDialog open level="info" title="提示" message="保存成功" onClose={() => {}} />);
    expect(screen.getByText('提示')).toBeInTheDocument();
    expect(screen.getByText('保存成功')).toBeInTheDocument();
  });

  it('renders error level data-attribute', () => {
    const { container } = render(
      <SectionMessageDialog open level="error" title="错误" message="网络断开" onClose={() => {}} />,
    );
    expect(container.querySelector('[data-level="error"]')).not.toBeNull();
  });

  it('renders warn level data-attribute', () => {
    const { container } = render(
      <SectionMessageDialog open level="warn" title="警告" message="版本冲突" onClose={() => {}} />,
    );
    expect(container.querySelector('[data-level="warn"]')).not.toBeNull();
  });

  it('clicking close triggers onClose', () => {
    const onClose = vi.fn();
    render(<SectionMessageDialog open level="info" title="t" message="m" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /关闭/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
