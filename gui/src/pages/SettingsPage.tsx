import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import type { ConfigPayload } from '../api/types';
import { useActiveProjectId } from '../hooks/useActiveProject';
import { queryKeys, clearProjectWorkspaceCache } from '../lib/queryKeys';

export function SettingsPage() {
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  const { data: config, isLoading } = useQuery({
    queryKey: queryKeys.config(projectId),
    queryFn: api.getConfig,
  });
  const [draft, setDraft] = useState<Partial<ConfigPayload> | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [message, setMessage] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const body = draft ?? config!;
      return api.putConfig({
        adb_device: body.adb_device,
        data_dir: body.data_dir,
        img_dir: body.img_dir,
        capture_mode: body.capture_mode,
        log_level: body.log_level,
        log_dir: body.log_dir,
        api_host: body.api?.host,
        api_port: body.api?.port,
        max_consecutive_miss_frames: body.recognition?.max_consecutive_miss_frames,
        last_known_ttl_frames: body.recognition?.last_known_ttl_frames,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.config(projectId) });
      setDraft(null);
      setMessage('配置已保存');
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const exportMut = useMutation({
    mutationFn: () => api.exportPackage(),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'freer-export.zip';
      a.click();
      URL.revokeObjectURL(url);
      setMessage('导出完成');
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const importMut = useMutation({
    mutationFn: (file: File) => api.importPackage(file, importMode),
    onSuccess: (res) => {
      clearProjectWorkspaceCache(qc);
      qc.invalidateQueries({ queryKey: queryKeys.config(projectId) });
      setMessage(`导入完成：${res.imported_events} 事件，${res.imported_actions} 动作`);
    },
    onError: (e: Error) => setMessage(e.message),
  });

  if (isLoading || !config) {
    return <div className="p-6 text-sm text-[#9aa3b2]">加载配置…</div>;
  }

  const c: ConfigPayload = {
    ...config,
    ...draft,
    recognition: {
      max_consecutive_miss_frames: draft?.recognition?.max_consecutive_miss_frames
        ?? config.recognition.max_consecutive_miss_frames,
      last_known_ttl_frames: draft?.recognition?.last_known_ttl_frames
        ?? config.recognition.last_known_ttl_frames,
    },
    api: { ...config.api, ...draft?.api },
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h2 className="text-lg font-semibold">设置</h2>
      {message && <p className="rounded-lg bg-surface-raised px-3 py-2 text-sm">{message}</p>}

      <section className="card space-y-3">
        <h3 className="font-medium">引擎路径</h3>
        {([
          ['adb_device', 'ADB 设备'],
          ['data_dir', '数据目录'],
          ['img_dir', '图片目录'],
          ['log_dir', '日志目录'],
        ] as const).map(([key, label]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input
              className="input"
              value={c[key]}
              onChange={(e) => setDraft({ ...c, [key]: e.target.value })}
            />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">日志级别</label>
            <select
              className="input"
              value={c.log_level}
              onChange={(e) => setDraft({ ...c, log_level: e.target.value })}
            >
              {['DEBUG', 'INFO', 'WARNING', 'ERROR'].map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">截屏模式</label>
            <select
              className="input"
              value={c.capture_mode}
              onChange={(e) => setDraft({ ...c, capture_mode: e.target.value })}
            >
              <option value="adb_pipe">adb_pipe（ADB 截屏，当前唯一可用）</option>
            </select>
            <p className="mt-1 text-xs text-[#6b7280]">
              识别截屏仅走 ADB；Win32 仅负责点击。坐标假设模拟器与 ADB 画面 1:1。
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">连续未命中暂停帧数</label>
            <input
              className="input"
              type="number"
              value={c.recognition.max_consecutive_miss_frames}
              onChange={(e) =>
                setDraft({
                  ...c,
                  recognition: {
                    ...c.recognition,
                    max_consecutive_miss_frames: Number(e.target.value),
                  },
                })
              }
            />
          </div>
          <div>
            <label className="label">上次位置记忆时长（帧）</label>
            <input
              className="input"
              type="number"
              value={c.recognition.last_known_ttl_frames}
              onChange={(e) =>
                setDraft({
                  ...c,
                  recognition: {
                    ...c.recognition,
                    last_known_ttl_frames: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          保存配置
        </button>
      </section>

      <section className="card space-y-3">
        <h3 className="font-medium">导入 / 导出</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
            导出事件包
          </button>
          <select
            className="input w-auto"
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
          >
            <option value="merge">合并导入</option>
            <option value="replace">替换导入</option>
          </select>
          <label className="btn cursor-pointer">
            选择 zip 导入
            <input
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (importMode === 'replace') {
                  const ok = window.confirm('替换导入将覆盖当前全部事件与动作，确定继续？');
                  if (!ok) return;
                }
                importMut.mutate(file);
              }}
            />
          </label>
        </div>
      </section>
      </div>
    </div>
  );
}
