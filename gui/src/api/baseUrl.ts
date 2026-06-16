const DEFAULT_API_HOST = '127.0.0.1';
const DEFAULT_API_PORT = import.meta.env.VITE_API_PORT ?? '17890';

export function apiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return '/api';
  }
  return `http://${DEFAULT_API_HOST}:${DEFAULT_API_PORT}`;
}

export function wsBaseUrl(): string {
  if (import.meta.env.VITE_WS_BASE) {
    return import.meta.env.VITE_WS_BASE.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return `ws://${DEFAULT_API_HOST}:${DEFAULT_API_PORT}/ws`;
}
