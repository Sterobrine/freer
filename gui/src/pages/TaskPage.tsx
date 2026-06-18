import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Square } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useActiveProjectId } from '../hooks/useActiveProject';
import { useLogWebSocket } from '../hooks/useLogWebSocket';
import { queryKeys } from '../lib/queryKeys';

export function TaskPage() {
  const projectId = useActiveProjectId();
  const [rootEvent, setRootEvent] = useState('');
  const [repeat, setRepeat] = useState(1);
  const [taskError, setTaskError] = useState('');

  const { data: events = [] } = useQuery({ queryKey: queryKeys.events(projectId), queryFn: api.listEvents });
  const macroRoots = useMemo(
    () => events.filter((e) => e.event_type === 0 && !e.is_exception),
    [events],
  );

  const statusQ = useQuery({
    queryKey: queryKeys.taskStatus(projectId),
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
    if (!macroRoots.some((e) => e.name === rootEvent)) {
      setRootEvent(macroRoots[0]?.name ?? '');
    }
  }, [macroRoots, rootEvent, projectId]);

  const start = useMutation({
    mutationFn: async () => {
      setTaskError('');
      const root = events.find((e) => e.name === rootEvent);
      if (!root) throw new Error('根宏事件不存在');
      const validation = await api.validateEvents([root]);
      const item = validation.events.find((v) => v.name === rootEvent);
      if (item && !item.valid) {
        throw new Error(item.issues.map((i) => i.message).join('；'));
      }
      return api.startTask(rootEvent, repeat);
    },
    onSuccess: () => statusQ.refetch(),
    onError: (e: Error) => setTaskError(e.message),
  });
  const stop = useMutation({
    mutationFn: api.stopTask,
    onSuccess: () => statusQ.refetch(),
    onError: (e: Error) => setTaskError(e.message),
  });
  const pause = useMutation({
    mutationFn: api.pauseTask,
    onSuccess: () => statusQ.refetch(),
    onError: (e: Error) => setTaskError(e.message),
  });
  const resume = useMutation({
    mutationFn: api.resumeTask,
    onSuccess: () => statusQ.refetch(),
    onError: (e: Error) => setTaskError(e.message),
  });

  const st = status?.status ?? 'idle';

  return (
    <div className="grid h-full grid-cols-2 gap-0">
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
          {taskError && <p className="text-red-300">{taskError}</p>}
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
