import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { FreerAction } from '../api/types';

const ACTION_TYPES: Record<number, string> = {
  1: '左键单击',
  3: '拖拽',
  4: '等待',
  5: '输入文字',
};

const emptyAction = (): FreerAction => ({
  name: '',
  action_type: 1,
  run_time: 1,
  gap: [0.02, 0.03],
});

export function ActionsPage() {
  const qc = useQueryClient();
  const { data: actions = [], isLoading } = useQuery({ queryKey: ['actions'], queryFn: api.listActions });
  const [editing, setEditing] = useState<FreerAction | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: async (action: FreerAction) => {
      if (isNew) return api.createAction(action);
      return api.updateAction(action.name, action);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actions'] });
      setEditing(null);
      setIsNew(false);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteAction(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['actions'] }),
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) return <div className="p-6 text-sm text-[#9aa3b2]">加载动作…</div>;

  return (
    <div className="flex h-[calc(100vh-57px)]">
      <div className="w-80 shrink-0 overflow-y-auto border-r border-surface-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">动作</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(emptyAction());
              setIsNew(true);
            }}
          >
            <Plus className="h-4 w-4" />
            新建
          </button>
        </div>
        <ul className="space-y-1">
          {actions.map((a) => (
            <li
              key={a.name}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
                editing?.name === a.name ? 'bg-surface-raised' : 'hover:bg-surface-raised/60'
              }`}
            >
              <button type="button" className="flex-1 text-left" onClick={() => { setEditing({ ...a }); setIsNew(false); }}>
                {a.name}
              </button>
              <span className="mr-2 text-xs text-[#6b7280]">{ACTION_TYPES[a.action_type] ?? a.action_type}</span>
              <button type="button" className="text-[#9aa3b2] hover:text-red-300" onClick={() => remove.mutate(a.name)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!editing ? (
          <p className="text-sm text-[#9aa3b2]">选择或新建动作进行编辑</p>
        ) : (
          <div className="mx-auto max-w-lg space-y-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <Pencil className="h-4 w-4" />
              {isNew ? '新建动作' : editing.name}
            </h3>
            {error && <p className="text-sm text-red-300">{error}</p>}
            <div>
              <label className="label">名称</label>
              <input
                className="input"
                disabled={!isNew}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">类型</label>
              <select
                className="input"
                value={editing.action_type}
                onChange={(e) => setEditing({ ...editing, action_type: Number(e.target.value) })}
              >
                {Object.entries(ACTION_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">执行次数</label>
                <input
                  className="input"
                  type="number"
                  value={editing.run_time}
                  onChange={(e) => setEditing({ ...editing, run_time: Number(e.target.value) })}
                />
              </div>
              {editing.action_type === 4 && (
                <div>
                  <label className="label">等待秒数</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={editing.wait_time ?? 1}
                    onChange={(e) => setEditing({ ...editing, wait_time: Number(e.target.value) })}
                  />
                </div>
              )}
              {editing.action_type === 3 && (
                <div>
                  <label className="label">拖拽时长 (s)</label>
                  <input
                    className="input"
                    type="number"
                    step="0.1"
                    value={editing.duration ?? 1}
                    onChange={(e) => setEditing({ ...editing, duration: Number(e.target.value) })}
                  />
                </div>
              )}
            </div>
            {editing.action_type === 5 && (
              <div>
                <label className="label">输入文本</label>
                <input
                  className="input"
                  value={editing.text ?? ''}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">间隔下限</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={editing.gap?.[0] ?? 0}
                  onChange={(e) =>
                    setEditing({ ...editing, gap: [Number(e.target.value), editing.gap?.[1] ?? 0] })
                  }
                />
              </div>
              <div>
                <label className="label">间隔上限</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={editing.gap?.[1] ?? 0}
                  onChange={(e) =>
                    setEditing({ ...editing, gap: [editing.gap?.[0] ?? 0, Number(e.target.value)] })
                  }
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" onClick={() => save.mutate(editing)} disabled={save.isPending}>
                保存
              </button>
              <button type="button" className="btn" onClick={() => { setEditing(null); setIsNew(false); }}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
