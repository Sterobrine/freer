import { useMutation, useQuery } from '@tanstack/react-query';
import { Pause, Play, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useLogWebSocket } from '../hooks/useLogWebSocket';

export function TaskPage() {
  const [rootEvent, setRootEvent] = useState('');
  const [repeat, setRepeat] = useState(1);

  const { data: events = [] } = useQuery({ queryKey: ['events'], queryFn: api.listEvents });
  const macroRoots = useMemo(
    () => events.filter((e) => e.event_type === 0 && !e.is_exception),
    [events],
  );

  const statusQ = useQuery({
    queryKey: ['taskStatus'],
    queryFn: api.taskStatus,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'running' || s === 'paused' || s === 'stopping' ? 1000 : false;
    },
  });

  const status = statusQ.data;
  const isActive = status?.status === 'running' || status?.status === 'paused' || status?.status === 'stopping';
  const { logs, connected, clear } = useLogWebSocket(isActive || true);

  useEffect(() => {
    if (!rootEvent && macroRoots[0]) setRootEvent(macroRoots[0].name);
  }, [macroRoots, rootEvent]);

  const start = useMutation({
    mutationFn: () => api.startTask(rootEvent, repeat),
    onSuccess: () => statusQ.refetch(),
  });
  const stop = useMutation({ mutationFn: api.stopTask, onSuccess: () => statusQ.refetch() });
  const pause = useMutation({ mutationFn: api.pauseTask, onSuccess: () => statusQ.refetch() });
  const resume = useMutation({ mutationFn: api.resumeTask, onSuccess: () => statusQ.refetch() });

  const st = status?.status ?? 'idle';

  return (
    <div className="grid h-[calc(100vh-57px)] grid-cols-2 gap-0">
      <div className="space-y-4 border-r border-surface-border p-6">
        <h2 className="text-lg font-semibold">任务控制台</h2>

        <div className="card space-y-3">
          <div>
            <label className="label">根宏事件</label>
            <select className="input" value={rootEvent} onChange={(e) => setRootEvent(e.target.value)} disabled={isActive}>
              {macroRoots.map((e) => (
                <option key={e.name} value={e.name}>{e.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">循环次数</label>
            <input
              className="input"
              type="number"
              min={1}
              value={repeat}
              disabled={isActive}
              onChange={(e) => setRepeat(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {st === 'idle' || st === 'completed' || st === 'stopped' || st === 'error' ? (
              <button type="button" className="btn btn-primary" onClick={() => start.mutate()} disabled={!rootEvent || start.isPending}>
                <Play className="h-4 w-4" />启动
              </button>
            ) : null}
            {st === 'running' && (
              <button type="button" className="btn" onClick={() => pause.mutate()}>
                <Pause className="h-4 w-4" />暂停
              </button>
            )}
            {st === 'paused' && (
              <button type="button" className="btn btn-primary" onClick={() => resume.mutate()}>
                <Play className="h-4 w-4" />恢复
              </button>
            )}
            {isActive && (
              <button type="button" className="btn btn-danger" onClick={() => stop.mutate()}>
                <Square className="h-4 w-4" />停止
              </button>
            )}
          </div>
        </div>

        <div className="card space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#9aa3b2]">状态</span>
            <span className="font-medium">
              {st}
              {status?.pause_pending ? ' (暂停等待中)' : ''}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9aa3b2]">当前事件</span>
            <span>{status?.current_event ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#9aa3b2]">路径</span>
            <span className="truncate pl-4 text-right text-xs">{status?.route ?? '—'}</span>
          </div>
          {status?.error && <p className="text-red-300">{status.error}</p>}
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
          <span className="text-sm font-medium">
            日志 {connected ? <span className="text-emerald-400">●</span> : <span className="text-[#6b7280]">○</span>}
          </span>
          <button type="button" className="btn text-xs" onClick={clear}>清空</button>
        </div>
        <pre className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-[#c5cad3]">
          {logs.map((l, i) => (
            <div key={i} className="border-b border-surface-border/40 py-0.5">
              {typeof l.message === 'string' ? l.message : JSON.stringify(l)}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
