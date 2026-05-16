import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Page from '../page';

const navMock = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => navMock,
  useSearchParams: () => ({ get: (k: string) => (k === 'project' ? 'p1' : null) }),
}));

vi.mock('@/hooks/useViewList', () => ({
  useViewList: () => ({
    views: [{ view_id: 'v1', name: 'Plant', is_template: 0, display_order: 0 }],
    loading: false, error: null, refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: [], loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useViewMutations', () => ({
  useViewMutations: () => ({
    create: vi.fn(), rename: vi.fn(), delete: vi.fn(), reorder: vi.fn(), setTemplate: vi.fn(),
  }),
}));

beforeEach(() => { navMock.push.mockClear(); navMock.replace.mockClear(); });

describe('/scada2 dashboard page', () => {
  it('renders the project view list', () => {
    render(<Page />);
    expect(screen.getByText('Plant')).toBeTruthy();
  });

  it('has a "新建画面" link to /scada2/edit/new?project=p1', () => {
    render(<Page />);
    const link = screen.getByText('新建画面').closest('a') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/scada2/edit/new?project=p1');
  });
});
