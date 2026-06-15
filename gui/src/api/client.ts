const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export type ApiError = { code: string; message: string };

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const resp = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const body = (await resp.json()) as ApiResult<T>;
  return body;
}

export const api = {
  health: () => request<{ status: string; api_version: string; data_dir: string }>('/health'),
  config: () => request<Record<string, unknown>>('/config'),
  events: () => request<Record<string, unknown>[]>('/events'),
  actions: () => request<Record<string, unknown>[]>('/actions'),
  taskStatus: () => request<Record<string, unknown>>('/task/status'),
};
