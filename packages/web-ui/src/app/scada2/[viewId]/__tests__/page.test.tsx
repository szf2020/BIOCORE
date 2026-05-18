import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ viewId: 'v1' }),
  useSearchParams: () => ({ get: (k: string) => (k === 'reactor' ? 'F01' : null) }),
  useRouter: () => ({ replace: mockReplace }),
}));

// Dynamic import after mocks are set up
const { default: Page } = await import('../page');

describe('/scada2/[viewId] redirect page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 跳转中 immediately', () => {
    const { getByRole } = render(<Page />);
    expect(getByRole('status').textContent).toMatch(/跳转中/);
  });

  it('calls router.replace with view-v2 path + reactor param', async () => {
    render(<Page />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/scada2/view-v2/v1?reactor=F01');
    });
  });
});
