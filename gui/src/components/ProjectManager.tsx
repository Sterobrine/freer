import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '../api/client';

type ProjectInfo = {
  id: string;
  name: string;
  description: string;
  default_root_event: string;
  tags: string[];
  stats?: { event_count: number; macros: number; micros: number; exceptions: number };
};

type Props = {
  open: boolean;
  onClose: () => void;
};

function ProjectCard({
  project,
  isActive,
  onActivate,
  onEdit,
  onDelete,
}: {
  project: ProjectInfo;
  isActive: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group relative rounded-xl border p-4 transition-all ${
        isActive
          ? 'border-accent/60 bg-accent/5 shadow-sm shadow-accent/10'
          : 'border-surface-border bg-surface cursor-pointer hover:border-surface-border/80 hover:bg-surface-raised/40'
      }`}
      onClick={() => { if (!isActive) onActivate(); }}
    >
      {/* Active badge */}
      {isActive && (
        <div className="absolute -right-2 -top-2 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
          <Check className="h-3 w-3" />
          当前
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        {/* Icon + info */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isActive ? 'bg-accent/20 text-accent' : 'bg-surface-raised text-[#6b7280]'
            }`}
          >
            <Folder className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-medium text-[#e8eaed]">
                {project.name || project.id}
              </h3>
              {project.tags && project.tags.length > 0 && (
                <div className="flex shrink-0 gap-1">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] text-[#6b7280]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <span className="shrink-0 text-[10px] text-[#4b5563]">{project.id}</span>
            </div>
            {project.description && (
              <p className="mt-0.5 truncate text-xs text-[#6b7280]">{project.description}</p>
            )}
          </div>
        </div>

        {/* Actions — 只有编辑和删除，切换通过点击整卡完成 */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            className="btn rounded-lg px-2 py-1.5 text-xs"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="编辑项目"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!isActive && (
            <button
              type="button"
              className="btn rounded-lg px-2 py-1.5 text-xs text-red-400 hover:text-red-300"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="删除项目"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {project.stats && (
        <div className="mt-3 flex items-center gap-3 text-[10px] text-[#6b7280]">
          <span>共 <strong className="text-[#9aa3b2]">{project.stats.event_count}</strong> 事件</span>
          <span>宏 <strong className="text-accent">{project.stats.macros}</strong></span>
          <span>微 <strong className="text-emerald-400">{project.stats.micros}</strong></span>
          <span>异常 <strong className="text-amber-400">{project.stats.exceptions}</strong></span>
        </div>
      )}
    </div>
  );
}

export function ProjectManager({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const { data: active } = useQuery({ queryKey: ['activeProject'], queryFn: api.getActiveProject });

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTags, setNewTags] = useState('');
  const [editing, setEditing] = useState<ProjectInfo | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');

  // Fetch stats for each project
  const statsQueries = useQuery({
    queryKey: ['projectStats', projects.map((p) => p.id)],
    queryFn: async () => {
      const results: Record<string, ProjectInfo['stats']> = {};
      for (const p of projects) {
        try {
          const detail = await api.getProject(p.id);
          results[p.id] = detail.stats;
        } catch { /* ignore */ }
      }
      return results;
    },
    enabled: projects.length > 0,
  });

  const projectList: ProjectInfo[] = useMemo(() => {
    const stats = statsQueries.data ?? {};
    return projects.map((p) => ({ ...p, stats: stats[p.id] }));
  }, [projects, statsQueries.data]);

  const filtered = useMemo(() => {
    if (!search) return projectList;
    const q = search.toLowerCase();
    return projectList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [projectList, search]);

  const activate = useMutation({
    mutationFn: (id: string) => api.activateProject(id),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ['events'] });
      qc.removeQueries({ queryKey: ['actions'] });
      qc.removeQueries({ queryKey: ['projectStats'] });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['events'], refetchType: 'active' }),
        qc.invalidateQueries({ queryKey: ['actions'], refetchType: 'active' }),
        qc.invalidateQueries({ queryKey: ['activeProject'] }),
        qc.invalidateQueries({ queryKey: ['projectStats'] }),
      ]);
    },
  });

  const createMut = useMutation({
    mutationFn: () => {
      const id = newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'new-project';
      const tags = newTags.trim() ? newTags.split(/[,，]/).map((t) => t.trim()).filter(Boolean) : undefined;
      return api.createProject({ id, name: newName.trim() || id, description: newDesc.trim(), tags });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projectStats'] });
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNewTags('');
    },
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('No project selected');
      const data: Record<string, unknown> = { id: editing.id };
      if (editName.trim()) data.name = editName.trim();
      data.description = editDesc.trim();
      data.tags = editTags.trim() ? editTags.split(/[,，]/).map((t) => t.trim()).filter(Boolean) : [];
      // The backend doesn't have a PUT /projects/{id} endpoint yet,
      // so we use the create flow logic. For now, just close the editor.
      return Promise.resolve(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const proj = projectList.find((p) => p.id === id);
      const count = proj?.stats?.event_count ?? 0;
      if (count > 0) {
        if (!window.confirm(`项目「${proj?.name || id}」包含 ${count} 个事件，删除后数据不可恢复。确定删除？`)) {
          throw new Error('已取消');
        }
      }
      await api.deleteProject(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['activeProject'] });
      qc.invalidateQueries({ queryKey: ['projectStats'] });
    },
    onError: (err: Error) => {
      if (err.message !== '已取消') alert(err.message);
    },
  });

  const openEditor = (p: ProjectInfo) => {
    setEditing(p);
    setEditName(p.name);
    setEditDesc(p.description);
    setEditTags(p.tags.join(', '));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-surface-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <div className="flex items-center gap-3">
            <Folder className="h-5 w-5 text-accent" />
            <h2 className="text-base font-semibold">项目管理</h2>
          </div>
          <button type="button" className="btn rounded-lg px-2 py-1.5 text-xs" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Search + Create ── */}
        <div className="flex items-center gap-2 border-b border-surface-border px-6 py-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]" />
            <input
              className="input w-full rounded-lg py-2 pl-9 text-sm"
              placeholder="搜索项目…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary rounded-lg px-3 py-2 text-xs"
            onClick={() => setShowCreate(!showCreate)}
          >
            <Plus className="h-4 w-4" /> 新建项目
          </button>
        </div>

        {/* ── Create form ── */}
        {showCreate && (
          <div className="border-b border-surface-border px-6 py-4">
            <div className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
              <h4 className="text-sm font-medium text-accent">新建项目</h4>
              <div>
                <label className="label text-xs">名称</label>
                <input
                  className="input w-full rounded-lg py-2 text-sm"
                  placeholder="例如：枫之谷日常"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createMut.mutate(); }}
                  autoFocus
                />
              </div>
              <div>
                <label className="label text-xs">描述（可选）</label>
                <input
                  className="input w-full rounded-lg py-2 text-sm"
                  placeholder="项目说明…"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">标签（可选，逗号分隔）</label>
                <input
                  className="input w-full rounded-lg py-2 text-sm"
                  placeholder="游戏, 日常, 战斗"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn rounded-lg px-3 py-1.5 text-xs" onClick={() => setShowCreate(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary rounded-lg px-3 py-1.5 text-xs"
                  onClick={() => createMut.mutate()}
                  disabled={!newName.trim() || createMut.isPending}
                >
                  {createMut.isPending ? '创建中…' : '创建项目'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit form ── */}
        {editing && (
          <div className="border-b border-surface-border px-6 py-4">
            <div className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
              <h4 className="text-sm font-medium text-accent">编辑项目</h4>
              <div>
                <label className="label text-xs">名称</label>
                <input
                  className="input w-full rounded-lg py-2 text-sm"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">描述</label>
                <input
                  className="input w-full rounded-lg py-2 text-sm"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
              <div>
                <label className="label text-xs">标签（逗号分隔）</label>
                <input
                  className="input w-full rounded-lg py-2 text-sm"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn rounded-lg px-3 py-1.5 text-xs" onClick={() => setEditing(null)}>
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary rounded-lg px-3 py-1.5 text-xs"
                  onClick={() => updateMut.mutate()}
                  disabled={updateMut.isPending}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Project list ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-[#6b7280]">
              <FolderOpen className="mb-2 h-8 w-8" />
              {search ? '没有匹配的项目' : '暂无项目，点击上方按钮创建'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isActive={active?.id === project.id}
                  onActivate={() => activate.mutate(project.id)}
                  onEdit={() => openEditor(project)}
                  onDelete={() => {
                    if (window.confirm(`确定删除项目「${project.name || project.id}」？此操作不可撤销。`)) {
                      deleteMut.mutate(project.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-surface-border px-6 py-3 text-[10px] text-[#4b5563]">
          <span>共 {projectList.length} 个项目</span>
          <span>当前：{active?.name || active?.id || '无'}</span>
        </div>
      </div>
    </div>
  );
}
