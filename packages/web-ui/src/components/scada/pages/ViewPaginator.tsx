'use client';
import React from 'react';
import { useLocale } from '@/i18n/useLocale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  total: number;
  size: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}

const PAGE_SIZES = [12, 24, 48] as const;
const MAX_VISIBLE = 7;

function buildPageNumbers(current: number, totalPages: number): (number | '...')[] {
  if (totalPages <= MAX_VISIBLE) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const result: (number | '...')[] = [];

  if (current <= 4) {
    for (let i = 1; i <= 5; i++) result.push(i);
    result.push('...');
    result.push(totalPages);
  } else if (current >= totalPages - 3) {
    result.push(1);
    result.push('...');
    for (let i = totalPages - 4; i <= totalPages; i++) result.push(i);
  } else {
    result.push(1);
    result.push('...');
    result.push(current - 1);
    result.push(current);
    result.push(current + 1);
    result.push('...');
    result.push(totalPages);
  }
  return result.slice(0, MAX_VISIBLE);
}

export function ViewPaginator({ page, total, size, onPageChange, onSizeChange }: Props) {
  const { t } = useLocale();
  const totalPages = Math.max(1, Math.ceil(total / size));
  const pageNumbers = buildPageNumbers(page, totalPages);

  return (
    <div data-testid="paginator" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
      <button
        data-testid="prev-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, cursor: page <= 1 ? 'default' : 'pointer', background: 'transparent' }}
      >
        <ChevronLeft size={14} />
      </button>

      {pageNumbers.map((p, idx) =>
        p === '...' ? (
          <span key={`ellipsis-${idx}`} style={{ padding: '0 4px', color: '#9ca3af' }}>…</span>
        ) : (
          <button
            key={p}
            data-testid={`page-btn-${p}`}
            onClick={() => onPageChange(p)}
            style={{
              padding: '4px 10px',
              border: '1px solid #ccc',
              borderRadius: 4,
              background: p === page ? '#3b82f6' : 'transparent',
              color: p === page ? '#fff' : 'inherit',
              cursor: 'pointer',
              fontWeight: p === page ? 600 : 400,
            }}
          >
            {p}
          </button>
        )
      )}

      <button
        data-testid="next-btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        style={{ padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4, cursor: page >= totalPages ? 'default' : 'pointer', background: 'transparent' }}
      >
        <ChevronRight size={14} />
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{t('common.total')} {total}</span>
        <select
          data-testid="page-size-select"
          value={size}
          onChange={(e) => onSizeChange(Number(e.target.value))}
          style={{ padding: '2px 6px', border: '1px solid #ccc', borderRadius: 4 }}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s} / {t('common.page')}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
