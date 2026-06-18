import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Plus, Search } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { ApiResult, HealthPayload, ProjectSummary } from '../../api/types';
import { useActiveProject } from '../../hooks/useActiveProject';
import { clearProjectWorkspaceCache, queryKeys } from '../../lib/queryKeys';
import { useClickOutside } from '../../hooks/useClickOutside';
import { CreateProjectModal } from './CreateProjectModal';
import { ProjectAvatar } from './ProjectAvatar';

/** 与 EventsPage 侧栏列表项一致 */
const listItemClass = (active: boolean) =>
  `w-full rounded-lg px-2 py-1.5 text-left text-sm transition ${
    active ? 'bg-surface-raised' : 'hover:bg-surface-raised/50'
  }`;

function ProjectStatsLine({ stats }: { stats: ProjectSummary['stats'] }) {
  if (stats.total === 0) {
    return <span>暂无事件</span>;
  }
  return (
    <span>
      {stats.macros} 宏 · {stats.micros} 微
      {stats.exceptions > 0 ? ` · ${stats.exceptions} 异常` : ''}
    </span>
  );
}

function ProjectRow({
  project,
  active,
  pending,
  onSelect,
}: {
  project: ProjectSummary;
  active: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onSelect}
      className={`flex items-center gap-2 ${listItemClass(active)} ${pending ? 'opacity-50' : ''}`}
    >
      <ProjectAvatar id={project.id} name={project.name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate">{project.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#6b7280]">
          <span className="truncate font-mono">{project.id}</span>
          {project.stats && (
            <>
              <span>·</span>
              <ProjectStatsLine stats={project.stats} />
            </>
          )}
        </div>
      </div>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#6b7280]">
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : active ? (
          <Check className="h-3.5 w-3.5 text-accent" />
        ) : null}
      </span>
    </button>
  );
}

export function ProjectSwitcher() {
  const qc = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [switchError, setSwitchError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: queryKeys.projects(),
    queryFn: api.listProjects,
  });

  const { activeId, active, isReady } = useActiveProject(projects);

  const displayName = useMemo(() => {
    if (isLoading) return '加载中…';
    if (active?.name) return active.name;
    const found = projects.find((p) => p.id === activeId);
    if (found?.name) return found.name;
    if (!isReady) return '连接引擎…';
    return '选择项目';
  }, [isLoading, active, projects, activeId, isReady]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [projects, query]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSwitchError('');
  }, []);

  useClickOutside([rootRef, panelRef], closeMenu, open);

  const activate = useMutation({
    mutationFn: (id: string) => api.activateProject(id),
    onMutate: (id) => {
      setPendingId(id);
      setSwitchError('');
    },
    onSuccess: async (result) => {
      clearProjectWorkspaceCache(qc);
      qc.setQueryData(queryKeys.health(), (old: ApiResult<HealthPayload> | undefined) => {
        if (!old?.ok || !old.data) return old;
        return {
          ok: true,
          data: {
            ...old.data,
            active_project: result.active_project,
            data_dir: result.data_dir,
          },
        };
      });
      await qc.refetchQueries({ queryKey: queryKeys.health() });
      qc.invalidateQueries({ queryKey: queryKeys.projects() });
      closeMenu();
    },
    onError: (e: Error) => setSwitchError(e.message),
    onSettled: () => setPendingId(null),
  });

  const handleSelect = (id: string) => {
    if (id === activeId || activate.isPending) return;
    activate.mutate(id);
  };

  const handleCreated = (projectId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.projects() });
    activate.mutate(projectId);
  };

  return (
    <>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => !v)}
          className={`flex max-w-[11rem] items-center gap-2 rounded-lg border border-surface-border bg-[#0f1115] px-2 py-1 text-left text-sm transition hover:bg-surface-raised/50 ${
            open ? 'bg-surface-raised' : ''
          }`}
        >
          {(active || activeId) && (
            <ProjectAvatar
              id={active?.id ?? activeId}
              name={active?.name ?? displayName}
              size="sm"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {displayName}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[#6b7280] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div
            ref={panelRef}
            role="listbox"
            aria-label="选择项目"
            className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 overflow-hidden rounded-lg border border-surface-border bg-[#0f1115]"
          >
            <div className="border-b border-surface-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#6b7280]" />
                <input
                  className="input py-1.5 pl-8 text-xs"
                  placeholder="搜索项目…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto p-2">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#6b7280]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  加载中…
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-[#6b7280]">
                  {query ? '没有匹配的项目' : '尚无项目'}
                  {!query && (
                    <button
                      type="button"
                      className="btn btn-primary mt-2 w-full text-xs"
                      onClick={() => {
                        closeMenu();
                        setCreateOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新建项目
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((project) => (
                    <li key={project.id}>
                      <ProjectRow
                        project={project}
                        active={project.id === activeId}
                        pending={pendingId === project.id}
                        onSelect={() => handleSelect(project.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {switchError && (
              <p className="border-t border-surface-border px-3 py-2 text-xs text-red-300">
                {switchError}
              </p>
            )}

            <div className="border-t border-surface-border p-2">
              <button
                type="button"
                className="btn w-full justify-start text-xs"
                onClick={() => {
                  closeMenu();
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                新建项目
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateProjectModal
        open={createOpen}
        existingIds={projects.map((p) => p.id)}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
