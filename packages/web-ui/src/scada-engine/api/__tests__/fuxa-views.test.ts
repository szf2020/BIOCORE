import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listFuxaViews, getFuxaView, createFuxaView, updateFuxaView, deleteFuxaView, duplicateFuxaView } from '../fuxa-views';

vi.mock('@/lib/auth', () => ({
  apiFetch: vi.fn(),
}));
import { apiFetch } from '@/lib/auth';

function jsonResponse(body: any, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
    json: async () => body,
  } as any;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const sampleRow = () => ({
  id: 'v1', name: 'V', type: 'svg', payload: JSON.stringify({
    id: 'v1', name: 'V', type: 'svg', svgcontent: '<svg/>',
    width: 100, height: 100, items: {}, schemaVersion: 1,
  }),
  width: 100, height: 100, parent_view_id: null, is_template: 0, version: 1,
  created_at: '2026-05-17 12:00:00', updated_at: '2026-05-17 12:00:00',
  created_by: 'admin', updated_by: null,
});

describe('fuxa-views api client (SP-FX-1)', () => {
  it('listFuxaViews calls GET /api/v1/fuxa-views and returns items array', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ items: [sampleRow()] }));
    const items = await listFuxaViews();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('v1');
    expect((apiFetch as any).mock.calls[0][0]).toMatch(/\/api\/v1\/fuxa-views$/);
  });

  it('listFuxaViews({isTemplate:true}) appends query param', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ items: [] }));
    await listFuxaViews({ isTemplate: true });
    expect((apiFetch as any).mock.calls[0][0]).toMatch(/is_template=true/);
  });

  it('getFuxaView returns the row and parses payload to FuxaView', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(sampleRow()));
    const { row, view } = await getFuxaView('v1');
    expect(row.id).toBe('v1');
    expect(view.id).toBe('v1');
    expect(view.schemaVersion).toBe(1);
  });

  it('getFuxaView throws ApiError on 404', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ error: '视图不存在' }, 404));
    await expect(getFuxaView('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('createFuxaView sends POST + returns the created row', async () => {
    const row = sampleRow();
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(row, 201));
    const v = {
      id: 'v1', name: 'V', type: 'svg' as const,
      payload: JSON.parse(row.payload),
      width: 100, height: 100,
    };
    const created = await createFuxaView(v);
    expect(created.id).toBe('v1');
    expect((apiFetch as any).mock.calls[0][1].method).toBe('POST');
  });

  it('updateFuxaView sends PUT with If-Match header', async () => {
    const row = { ...sampleRow(), version: 2 };
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(row));
    await updateFuxaView('v1', {
      expectedVersion: 1,
      name: 'V', type: 'svg', width: 100, height: 100,
      payload: JSON.parse(sampleRow().payload),
    });
    const init = (apiFetch as any).mock.calls[0][1];
    expect(init.method).toBe('PUT');
    expect(init.headers['If-Match']).toBe('1');
  });

  it('updateFuxaView with force=true appends ?force=true', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(sampleRow()));
    await updateFuxaView('v1', {
      expectedVersion: 1, force: true,
      name: 'V', type: 'svg', width: 100, height: 100,
      payload: JSON.parse(sampleRow().payload),
    });
    expect((apiFetch as any).mock.calls[0][0]).toMatch(/\?force=true/);
  });

  it('updateFuxaView throws ApiError with currentVersion on 409', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ error: 'stale', currentVersion: 5 }, 409));
    await expect(
      updateFuxaView('v1', {
        expectedVersion: 1,
        name: 'V', type: 'svg', width: 100, height: 100,
        payload: JSON.parse(sampleRow().payload),
      }),
    ).rejects.toMatchObject({ status: 409, body: { currentVersion: 5 } });
  });

  it('deleteFuxaView sends DELETE and returns void on 204', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(null, 204));
    await expect(deleteFuxaView('v1')).resolves.toBeUndefined();
    expect((apiFetch as any).mock.calls[0][1].method).toBe('DELETE');
  });

  it('duplicateFuxaView POSTs to /:id/duplicate with newId body, returns new row', async () => {
    const row = { ...sampleRow(), id: 'v1-copy', name: 'V Copy', version: 1 };
    (apiFetch as any).mockResolvedValueOnce(jsonResponse(row, 201));
    const created = await duplicateFuxaView('v1', 'v1-copy');
    expect(created.id).toBe('v1-copy');
    expect((apiFetch as any).mock.calls[0][0]).toMatch(/\/fuxa-views\/v1\/duplicate$/);
    expect(JSON.parse((apiFetch as any).mock.calls[0][1].body)).toEqual({ newId: 'v1-copy' });
  });

  it('all non-2xx responses surface as ApiError with status + body', async () => {
    (apiFetch as any).mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    await expect(listFuxaViews()).rejects.toMatchObject({ status: 500, body: { error: 'boom' } });
  });
});
