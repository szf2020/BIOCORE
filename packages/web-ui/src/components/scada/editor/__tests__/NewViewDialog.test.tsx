import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/api/scada', () => ({
  createView: vi.fn(async () => ({ success: true, view_id: 'new_v' })),
}));
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { NewViewDialog } from '../NewViewDialog';
import * as scada from '@/api/scada';

describe('NewViewDialog', () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(scada.createView).mockClear();
    vi.mocked(scada.createView).mockResolvedValue({ success: true, view_id: 'new_v' });
  });

  it('1. view_id or name empty → submit disabled', () => {
    render(<NewViewDialog open={true} projects={[{ project_id: 'p1', name: 'P1' } as any]} onClose={vi.fn()} />);
    const submit = screen.getByRole('button', { name: /创建/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('2. fill view_id + name → submit calls createView + push /scada/[id]/edit', async () => {
    render(<NewViewDialog open={true} projects={[{ project_id: 'p1', name: 'P1' } as any]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/视图 ID/), { target: { value: 'new_v' } });
    fireEvent.change(screen.getByLabelText(/视图名/), { target: { value: '新视图' } });
    fireEvent.click(screen.getByRole('button', { name: /创建/ }));
    await waitFor(() => expect(scada.createView).toHaveBeenCalledTimes(1));
    expect(scada.createView).toHaveBeenCalledWith('p1', expect.objectContaining({
      view_id: 'new_v', name: '新视图',
    }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/scada2/edit/new_v'));
  });
});
