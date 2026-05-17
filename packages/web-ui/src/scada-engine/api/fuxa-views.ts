// REST client for /api/v1/fuxa-views (SP-FX-1).
// Mirrors the server's CRUD surface defined in packages/server/src/fuxa-views-routes.ts.

import { apiFetch } from '@/lib/auth';
import { FuxaView, FuxaViewSchema, parseFuxaView } from '../models/hmi';

const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/api/v1/fuxa-views';

export interface FuxaViewRow {
  id: string;
  name: string;
  type: string;
  payload: string;
  width: number;
  height: number;
  parent_view_id: string | null;
  is_template: number;
  version: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(`HTTP ${status}: ${JSON.stringify(body)}`);
  }
}

async function unwrap<T>(p: Promise<Response>): Promise<T> {
  const res = await p;
  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch { /* no body */ }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as any;
  return (await res.json()) as T;
}

export async function listFuxaViews(opts: { isTemplate?: boolean } = {}): Promise<FuxaViewRow[]> {
  const qs = opts.isTemplate === true ? '?is_template=true'
    : opts.isTemplate === false ? '?is_template=false'
    : '';
  const data = await unwrap<{ items: FuxaViewRow[] }>(apiFetch(`${BASE}${qs}`));
  return data.items;
}

export async function getFuxaView(id: string): Promise<{ row: FuxaViewRow; view: FuxaView }> {
  const row = await unwrap<FuxaViewRow>(apiFetch(`${BASE}/${encodeURIComponent(id)}`));
  const view = parseFuxaView(row.payload);
  return { row, view };
}

export interface CreateFuxaViewBody {
  id: string;
  name: string;
  type: string;
  payload: FuxaView;
  width: number;
  height: number;
  parent_view_id?: string | null;
  is_template?: number;
}

export async function createFuxaView(body: CreateFuxaViewBody): Promise<FuxaViewRow> {
  FuxaViewSchema.parse(body.payload);
  return unwrap<FuxaViewRow>(
    apiFetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export interface UpdateFuxaViewBody {
  expectedVersion: number;
  force?: boolean;
  name: string;
  type: string;
  payload: FuxaView;
  width: number;
  height: number;
  parent_view_id?: string | null;
  is_template?: number;
}

export async function updateFuxaView(id: string, body: UpdateFuxaViewBody): Promise<FuxaViewRow> {
  FuxaViewSchema.parse(body.payload);
  const qs = body.force ? '?force=true' : '';
  const { expectedVersion, force, ...rest } = body;
  return unwrap<FuxaViewRow>(
    apiFetch(`${BASE}/${encodeURIComponent(id)}${qs}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': String(expectedVersion),
      },
      body: JSON.stringify(rest),
    }),
  );
}

export async function deleteFuxaView(id: string): Promise<void> {
  await unwrap<void>(apiFetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export async function duplicateFuxaView(id: string, newId: string): Promise<FuxaViewRow> {
  return unwrap<FuxaViewRow>(
    apiFetch(`${BASE}/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newId }),
    }),
  );
}
