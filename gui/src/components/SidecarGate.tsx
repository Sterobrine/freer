import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../api/client';

const MAX_ATTEMPTS = 90;

export function SidecarGate({ children }: { children: ReactNode }) {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    retry: MAX_ATTEMPTS,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
  });

  const waiting = health.isPending || (health.isFetching && !health.data?.ok);
  const failed = health.isError || (!waiting && !health.data?.ok);

  if (waiting && !failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="text-sm text-[#9aa3b2]">正在连接 Freer 引擎…</p>
        <p className="text-xs text-[#6b7280]">首次启动可能需要 1–2 分钟（引擎解压中）</p>
      </div>
    );
  }

  if (failed || !health.data?.ok) {
    const message = health.isError
      ? String(health.error)
      : health.data && !health.data.ok
        ? ('error' in health.data ? health.data.error?.message : undefined) ?? '无法连接引擎，请检查 freer-engine.exe 是否正常启动'
        : '无法连接引擎，请检查 freer-engine.exe 是否正常启动';
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
          请确认同目录存在 <code className="rounded bg-surface-raised px-1">freer-engine.exe</code>
          ，可单独运行它查看报错；日志目录 <code className="rounded bg-surface-raised px-1">logs/</code>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
