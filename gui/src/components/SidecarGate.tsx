import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../api/client';

export function SidecarGate({ children }: { children: ReactNode }) {
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: 2 });

  if (health.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-sm text-[#9aa3b2]">正在连接 Freer 引擎…</p>
      </div>
    );
  }

  if (health.isError || !health.data?.ok) {
    const message = !health.data?.ok
      ? health.data?.error?.message ?? '健康检查失败'
      : '无法连接 sidecar';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <h1 className="text-xl font-semibold">引擎未连接</h1>
        <p className="max-w-md text-sm text-[#9aa3b2]">{message}</p>
        <button type="button" className="btn btn-primary" onClick={() => health.refetch()}>
          <RefreshCw className="h-4 w-4" />
          重试连接
        </button>
        <p className="text-xs text-[#6b7280]">
          开发模式：<code className="rounded bg-surface-raised px-1">python -m freer_api</code>
          {' '}→ <code className="rounded bg-surface-raised px-1">pnpm dev</code>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
