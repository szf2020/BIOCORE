const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function authHeaders(): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (typeof window !== 'undefined') {
    const t = localStorage.getItem('biocore_token');
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  return headers;
}

export interface ScadaProject {
  project_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScadaViewSummary {
  view_id: string;
  project_id: string;
  name: string;
  reactor_id: string | null;
  display_order: number;
  updated_at: string;
}

export interface ScadaView {
  view_id: string;
  project_id: string;
  name: string;
  reactor_id: string | null;
  width: number;
  height: number;
  background: string;
  items: Record<string, any>;
  updated_at: string;
}

export async function fetchProjects(): Promise<ScadaProject[]> {
  const r = await fetch(`${API}/api/v1/scada/projects`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`fetchProjects ${r.status}`);
  const body = await r.json();
  return body.items ?? body;
}

export async function fetchProject(projectId: string): Promise<{ project: ScadaProject; views: ScadaViewSummary[] }> {
  const r = await fetch(`${API}/api/v1/scada/projects/${projectId}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`fetchProject ${r.status}`);
  const body = await r.json();
  return { project: body, views: body.views ?? [] };
}

export async function fetchView(viewId: string): Promise<ScadaView> {
  const r = await fetch(`${API}/api/v1/scada/views/${viewId}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`fetchView ${r.status}`);
  return r.json();
}

export interface WriteIntentPayload {
  tag: string;
  value: number | string | boolean | null;
  reason: string;
  view_id: string;
  widget_id: string;
  batch_id?: string | null;
}

export async function submitWriteIntent(p: WriteIntentPayload): Promise<{ success: boolean; suggestion_id: number }> {
  const r = await fetch(`${API}/api/v1/scada/write-intents`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(p),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `submitWriteIntent ${r.status}`);
  }
  return r.json();
}

export async function updateView(
  viewId: string,
  body: {
    items?: Record<string, any>;
    expected_updated_at?: string;
    name?: string;
    reactor_id?: string | null;
    width?: number;
    height?: number;
    background?: string;
  },
): Promise<{ success: boolean; updated_at: string }> {
  const r = await fetch(`${API}/api/v1/scada/views/${viewId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `updateView ${r.status}`);
  }
  return r.json();
}

export async function createView(
  projectId: string,
  body: {
    view_id: string;
    name: string;
    reactor_id?: string | null;
    width?: number;
    height?: number;
    background?: string;
    items?: Record<string, any>;
  },
): Promise<{ success: boolean; view_id: string }> {
  const r = await fetch(`${API}/api/v1/scada/projects/${projectId}/views`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `createView ${r.status}`);
  }
  return r.json();
}

export interface ScadaSuggestion {
  id: number;
  batch_id: string;
  suggestion_type: string;
  source_module: string;
  target_param: string;
  current_value: number | null;
  suggested_value: number | null;
  confidence: number | null;
  reasoning: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

export async function fetchScadaSuggestions(): Promise<ScadaSuggestion[]> {
  const r = await fetch(`${API}/api/v1/ai/suggestions?status=pending&source_module=scada`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`fetchScadaSuggestions ${r.status}`);
  return r.json();
}

export async function acceptSuggestion(id: number): Promise<{ success: boolean }> {
  const r = await fetch(`${API}/api/v1/ai/suggestions/${id}/accept`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `acceptSuggestion ${r.status}`);
  }
  return r.json();
}

export async function rejectSuggestion(id: number): Promise<{ success: boolean }> {
  const r = await fetch(`${API}/api/v1/ai/suggestions/${id}/reject`, {
    method: 'POST', headers: authHeaders(),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'unknown' }));
    throw new Error(err.error || `rejectSuggestion ${r.status}`);
  }
  return r.json();
}
