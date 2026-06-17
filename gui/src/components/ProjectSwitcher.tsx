import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FolderKanban, Settings2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../api/client';
import { ProjectManager } from './ProjectManager';

/** 切换项目后需要刷新的所有 queryKey 清单 */
const PROJECT_INVALIDATE_KEYS = [
  ['events'],
  ['actions'],
  ['activeProject'],
  ['projects'],
  ['templates'],
  ['projectStats'],
  ['taskStatus'],
  ['config'],
  ['health'],
];

export function ProjectSwitcher() {
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const { data: active } = useQuery({ queryKey: ['activeProject'], queryFn: api.getActiveProject });
  const [open, setOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentName = active?.name || active?.id || '未选择项目';

  const activate = useMutation({
    mutationFn: (id: string) => api.activateProject(id),
    onSuccess: async (data) => {
      qc.setQueryData(['activeProject'], data);
      // 立即清除旧项目数据缓存——不等 refetch，直接清空，避免 UI 仍显示旧项目内容
      qc.removeQueries({ queryKey: ['events'] });
      qc.removeQueries({ queryKey: ['actions'] });
      qc.removeQueries({ queryKey: ['templates'] });
      qc.removeQueries({ queryKey: ['taskStatus'] });
      qc.removeQueries({ queryKey: ['projectStats'] });
      // 触发所有项目相关查询重新获取
      await Promise.all(
        PROJECT_INVALIDATE_KEYS.map((key) =>
          qc.invalidateQueries({ queryKey: key, refetchType: 'active' }),
        ),
      );
    },
  });

  return (
    <>
      <div className="relative">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-raised/50 px-2.5 py-1.5 text-xs text-[#e8eaed] transition hover:border-surface-border/80 hover:bg-surface-raised"
          onClick={() => setOpen(!open)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 200); }}
        >
          <FolderKanban className="h-3.5 w-3.5 text-accent" />
          <span className="max-w-[120px] truncate">{currentName}</span>
          {activate.isPending ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#6b7280] border-t-transparent" />
          ) : (
            <ChevronDown className={`h-3 w-3 text-[#6b7280] transition ${open ? 'rotate-180' : ''}`} />
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-surface-border bg-surface shadow-xl">
            <div className="border-b border-surface-border px-3 py-2 text-[10px] font-medium text-[#6b7280]">
              项目切换
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {projects.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[#6b7280]">暂无项目</div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={activate.isPending}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                      active?.id === p.id
                        ? 'bg-accent/10 text-accent'
                        : 'text-[#9aa3b2] hover:bg-surface-raised/60 hover:text-[#e8eaed]'
                    } ${activate.isPending ? 'opacity-50' : ''}`}
                    onMouseDown={() => {
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                      if (p.id !== active?.id && !activate.isPending) {
                        activate.mutate(p.id);
                      }
                      setOpen(false);
                    }}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        active?.id === p.id ? 'bg-accent' : 'bg-[#4b5563]'
                      }`}
                    />
                    <span className="truncate">{p.name || p.id}</span>
                    {active?.id === p.id && (
                      <span className="ml-auto text-[10px] text-accent">当前</span>
                    )}
                    {activate.isPending && activate.variables === p.id && (
                      <span className="ml-auto text-[10px] text-[#6b7280]">切换中…</span>
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-surface-border p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[#6b7280] transition hover:bg-surface-raised hover:text-[#e8eaed]"
                onMouseDown={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  setOpen(false);
                  setShowManager(true);
                }}
              >
                <Settings2 className="h-3.5 w-3.5" />
                管理项目…
              </button>
            </div>
          </div>
        )}
      </div>

      <ProjectManager open={showManager} onClose={() => setShowManager(false)} />
    </>
  );
}
