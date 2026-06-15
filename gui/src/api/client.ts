import type {
  ApiResult,
  ConfigPayload,
  FreerAction,
  FreerEvent,
  PreviewResult,
  TaskStatus,
  TreeNode,
  ValidationResult,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (resp.headers.get('content-type')?.includes('application/json')) {
    return (await resp.json()) as ApiResult<T>;
  }
  const text = await resp.text();
  return { ok: false, error: { code: 'parse_error', message: text || resp.statusText } };
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const resp = await fetch(`${API_BASE}${path}`, init);
  if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
  return resp.blob();
}

function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.data as T;
}

export const api = {
  health: () => request<{ status: string; api_version: string; data_dir: string }>('/health'),

  getConfig: () => request<ConfigPayload>('/config').then(unwrap),
  putConfig: (body: Partial<ConfigPayload> & Record<string, unknown>) =>
    request<ConfigPayload>('/config', { method: 'PUT', body: JSON.stringify(body) }).then(unwrap),

  listEvents: () => request<FreerEvent[]>('/events').then(unwrap),
  getEvent: (name: string) => request<FreerEvent>(`/events/${encodeURIComponent(name)}`).then(unwrap),
  createEvent: (event: FreerEvent) =>
    request<FreerEvent>('/events', { method: 'POST', body: JSON.stringify(event) }).then(unwrap),
  updateEvent: (name: string, event: FreerEvent) =>
    request<FreerEvent>(`/events/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(event),
    }).then(unwrap),
  deleteEvent: (name: string) =>
    request<{ deleted: string }>(`/events/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(unwrap),
  getEventTree: (name: string) =>
    request<TreeNode>(`/events/${encodeURIComponent(name)}/tree`).then(unwrap),
  validateEvents: (events?: FreerEvent[], checkAssets = true) =>
    request<{ valid: boolean; events: Array<{ name: string } & ValidationResult> }>('/events/validate', {
      method: 'POST',
      body: JSON.stringify({ events, check_assets: checkAssets }),
    }).then(unwrap),
  validateEvent: (name: string) =>
    request<ValidationResult>(`/events/${encodeURIComponent(name)}/validate`, { method: 'POST' }).then(unwrap),

  listActions: () => request<FreerAction[]>('/actions').then(unwrap),
  createAction: (action: FreerAction) =>
    request<FreerAction>('/actions', { method: 'POST', body: JSON.stringify(action) }).then(unwrap),
  updateAction: (name: string, action: FreerAction) =>
    request<FreerAction>(`/actions/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(action),
    }).then(unwrap),
  deleteAction: (name: string) =>
    request<{ deleted: string }>(`/actions/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(unwrap),

  listTemplates: () => request<string[]>('/templates').then(unwrap),
  capture: () => request<{ frame_id: number; url: string }>('/capture', { method: 'POST' }).then(unwrap),
  screenshotUrl: () => `${API_BASE}/screenshot?t=${Date.now()}`,
  assetUrl: (filename: string) => `${API_BASE}/assets/img/${encodeURIComponent(filename)}`,

  preview: (body: Record<string, unknown>) =>
    request<PreviewResult>('/recognize/preview', { method: 'POST', body: JSON.stringify(body) }).then(unwrap),

  taskStatus: () => request<TaskStatus>('/task/status').then(unwrap),
  startTask: (event_name: string, repeat_time = 1) =>
    request<TaskStatus>('/task/start', {
      method: 'POST',
      body: JSON.stringify({ event_name, repeat_time }),
    }).then(unwrap),
  stopTask: () => request<TaskStatus>('/task/stop', { method: 'POST' }).then(unwrap),
  pauseTask: () => request<TaskStatus>('/task/pause', { method: 'POST' }).then(unwrap),
  resumeTask: () => request<TaskStatus>('/task/resume', { method: 'POST' }).then(unwrap),

  exportPackage: (event_names?: string[]) =>
    requestBlob('/export', {
      method: 'POST',
      body: JSON.stringify({ event_names, include_actions: true }),
    }),

  importPackage: async (file: File, mode: 'merge' | 'replace' = 'merge') => {
    const form = new FormData();
    form.append('file', file);
    const resp = await fetch(`${API_BASE}/import?mode=${mode}`, { method: 'POST', body: form });
    const body = (await resp.json()) as ApiResult<{ imported_events: number; imported_actions: number }>;
    return unwrap(body);
  },
};

export function wsLogsUrl(): string {
  const base = import.meta.env.VITE_WS_BASE ?? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
  return `${base}/logs`;
}
