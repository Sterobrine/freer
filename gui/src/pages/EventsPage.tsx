import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { FreerEvent } from '../api/types';
import { CompositionEditor } from '../components/events/CompositionEditor';
import { EventPropertyForm } from '../components/events/EventPropertyForm';

function emptyMicro(): FreerEvent {
  return {
    name: '新微事件',
    event_type: 1,
    window_name: '',
    action: '',
    symbol_start: null,
    symbol_finish: null,
    accuracy: 0.85,
    max_suc_run_time: 5,
    is_exception: false,
    gap: [0.4, 0.6],
  };
}

function emptyMacro(): FreerEvent {
  return {
    name: '新宏事件',
    event_type: 0,
    window_name: '',
    is_exception: false,
    event_list: [],
    exception_list: [],
    max_rotate_time: 50,
  };
}

export function EventsPage() {
  const qc = useQueryClient();
  const { data: events = [] } = useQuery({ queryKey: ['events'], queryFn: api.listEvents });
  const { data: actions = [] } = useQuery({ queryKey: ['actions'], queryFn: api.listActions });
  const [filter, setFilter] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<FreerEvent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [childIndex, setChildIndex] = useState<number | null>(null);
  const [status, setStatus] = useState('');

  const actionNames = useMemo(() => actions.map((a) => a.name), [actions]);

  const filtered = useMemo(
    () => events.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase())),
    [events, filter],
  );

  useEffect(() => {
    if (!selectedName) {
      setDraft(null);
      return;
    }
    const found = events.find((e) => e.name === selectedName);
    if (found && !isNew) setDraft({ ...found });
  }, [selectedName, events, isNew]);

  const save = useMutation({
    mutationFn: async (event: FreerEvent) => {
      const validation = await api.validateEvents([event]);
      const item = validation.events.find((v) => v.name === event.name);
      if (item && !item.valid) {
        throw new Error(item.issues.map((i) => i.message).join('；'));
      }
      if (isNew) return api.createEvent(event);
      return api.updateEvent(selectedName!, event);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['events'] });
      setSelectedName(saved.name);
      setDraft(saved);
      setIsNew(false);
      setStatus('已保存');
    },
    onError: (e: Error) => setStatus(e.message),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteEvent(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      setSelectedName(null);
      setDraft(null);
      setStatus('已删除');
    },
    onError: (e: Error) => setStatus(e.message),
  });

  return (
    <div className="flex h-[calc(100vh-57px)]">
      {/* 事件目录 */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-surface-border">
        <div className="border-b border-surface-border p-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-[#6b7280]" />
            <input
              className="input pl-8"
              placeholder="搜索…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              className="btn flex-1 text-xs"
              onClick={() => {
                setDraft(emptyMacro());
                setIsNew(true);
                setSelectedName(null);
                setChildIndex(null);
              }}
            >
              <Plus className="h-3 w-3" />宏
            </button>
            <button
              type="button"
              className="btn flex-1 text-xs"
              onClick={() => {
                setDraft(emptyMicro());
                setIsNew(true);
                setSelectedName(null);
                setChildIndex(null);
              }}
            >
              <Plus className="h-3 w-3" />微
            </button>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 text-sm">
          {filtered.map((e) => (
            <li key={e.name}>
              <button
                type="button"
                className={`w-full rounded-lg px-2 py-1.5 text-left ${
                  selectedName === e.name && !isNew ? 'bg-surface-raised' : 'hover:bg-surface-raised/50'
                }`}
                onClick={() => {
                  setSelectedName(e.name);
                  setIsNew(false);
                  setChildIndex(null);
                  setStatus('');
                }}
              >
                <span className={e.is_exception ? 'text-amber-300' : ''}>{e.name}</span>
                <span className="ml-1 text-xs text-[#6b7280]">{e.event_type === 0 ? '宏' : '微'}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* 编排树 */}
      <section className="flex w-80 shrink-0 flex-col border-r border-surface-border p-4">
        <h2 className="mb-3 text-sm font-semibold">编排</h2>
        {!draft ? (
          <p className="text-xs text-[#6b7280]">选择宏事件以编辑子事件与异常分支</p>
        ) : draft.event_type === 0 ? (
          <CompositionEditor
            macro={draft}
            allEvents={events}
            onChange={setDraft}
            selectedChildIndex={childIndex}
            onSelectChild={setChildIndex}
          />
        ) : (
          <p className="text-xs text-[#6b7280]">微事件无子编排，请在右侧编辑属性</p>
        )}
      </section>

      {/* 属性面板 */}
      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
          <span className="text-sm font-medium">{draft?.name ?? '未选择'}</span>
          <div className="flex gap-2">
            {draft && !isNew && (
              <button type="button" className="btn btn-danger text-xs" onClick={() => remove.mutate(draft.name)}>
                <Trash2 className="h-3.5 w-3.5" />删除
              </button>
            )}
            {draft && (
              <button
                type="button"
                className="btn btn-primary text-xs"
                onClick={() => save.mutate(draft)}
                disabled={save.isPending}
              >
                <Save className="h-3.5 w-3.5" />保存
              </button>
            )}
          </div>
        </div>
        {status && <p className="border-b border-surface-border px-4 py-2 text-xs text-[#9aa3b2]">{status}</p>}
        <div className="flex-1 overflow-y-auto p-4">
          {draft ? (
            <EventPropertyForm event={draft} actions={actionNames} onChange={setDraft} />
          ) : (
            <p className="text-sm text-[#6b7280]">从左侧选择事件或新建</p>
          )}
        </div>
      </section>
    </div>
  );
}
