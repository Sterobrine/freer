import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  GitBranch,
  LayoutList,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import type { FreerEvent, OpenEventContext } from '../api/types';
import { useActiveProjectId } from '../hooks/useActiveProject';
import { CompositionTreeView } from '../components/events/CompositionTreeView';
import { EventGraphEditor, EventGraphSingleNode } from '../components/events/EventGraphEditor';
import { EventPropertyForm } from '../components/events/EventPropertyForm';
import { ColumnResizeHandle, useResizableWidth } from '../components/ColumnResizeHandle';
import { detectCycle, EVENT_DRAG_MIME, mergeEventIndex } from '../lib/eventComposition';
import {
  confirmDiscardDraft,
  findEventReferrers,
  formatValidationWarnings,
  isEventDraftDirty,
} from '../lib/eventDraft';
import { queryKeys } from '../lib/queryKeys';

type ViewMode = 'classic' | 'graph';

type NavFrame = {
  name: string;
  childIndex: number | null;
  exceptionIndex: number | null;
  draft: FreerEvent;
};

type SavePayload = FreerEvent | { event: FreerEvent; originalName: string };

function resolveSavePayload(payload: SavePayload): { event: FreerEvent; originalName: string | null } {
  if (typeof payload === 'object' && payload !== null && 'originalName' in payload) {
    return { event: payload.event, originalName: payload.originalName };
  }
  return { event: payload, originalName: null };
}

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

type CatalogTab = 'all' | 'macro' | 'micro' | 'exception';

export function EventsPage() {
  const qc = useQueryClient();
  const projectId = useActiveProjectId();
  const { data: events = [] } = useQuery({ queryKey: queryKeys.events(projectId), queryFn: api.listEvents });
  const { data: actions = [] } = useQuery({ queryKey: queryKeys.actions(projectId), queryFn: api.listActions });
  const [filter, setFilter] = useState('');
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('all');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [draft, setDraft] = useState<FreerEvent | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [childIndex, setChildIndex] = useState<number | null>(null);
  const [exceptionIndex, setExceptionIndex] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [navStack, setNavStack] = useState<NavFrame[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('classic');
  const restoreRef = useRef<NavFrame | null>(null);
  const [sidebarWidth, resizeSidebar] = useResizableWidth('freer.events.sidebarWidth', 224, 160, 420);
  const [composeWidth, resizeCompose] = useResizableWidth('freer.events.composeWidth', 352, 220, 640);

  const resetNavigation = () => setNavStack([]);

  const actionNames = useMemo(() => actions.map((a) => a.name), [actions]);

  const draftDirty = useMemo(
    () => isEventDraftDirty(draft, selectedName, isNew, events),
    [draft, selectedName, isNew, events],
  );

  const draftHasCycle = useMemo(() => {
    if (!draft?.name || draft.event_type !== 0) return null;
    const index = mergeEventIndex(events, draft);
    return detectCycle(draft.name, index);
  }, [draft, events]);

  const guardDirtyNavigation = (next: () => void) => {
    if (draftDirty && !confirmDiscardDraft()) return;
    next();
  };

  const navigateToEvent = (name: string, context?: OpenEventContext) => {
    const go = () => {
      if (isNew || !selectedName || selectedName === name) {
        setSelectedName(name);
        setIsNew(false);
        setChildIndex(null);
        setExceptionIndex(null);
        setStatus('');
        return;
      }
      if (draft) {
        setNavStack((stack) => [
          ...stack,
          {
            name: selectedName,
            childIndex: context?.childIndex !== undefined ? context.childIndex : childIndex,
            exceptionIndex:
              context?.exceptionIndex !== undefined ? context.exceptionIndex : exceptionIndex,
            draft: { ...draft },
          },
        ]);
      }
      setSelectedName(name);
      setIsNew(false);
      setChildIndex(null);
      setExceptionIndex(null);
      setStatus('');
    };
    if (draftDirty && selectedName !== name) {
      guardDirtyNavigation(go);
      return;
    }
    go();
  };

  const goBack = () => {
    if (navStack.length === 0) return;
    const frame = navStack[navStack.length - 1];
    restoreRef.current = frame;
    setNavStack(navStack.slice(0, -1));
    setSelectedName(frame.name);
    setIsNew(false);
    setChildIndex(frame.childIndex);
    setExceptionIndex(frame.exceptionIndex);
    setStatus('');
  };

  const goToBreadcrumb = (index: number) => {
    if (index < 0 || index >= navStack.length) return;
    const frame = navStack[index];
    restoreRef.current = frame;
    setNavStack(navStack.slice(0, index));
    setSelectedName(frame.name);
    setIsNew(false);
    setChildIndex(frame.childIndex);
    setExceptionIndex(frame.exceptionIndex);
    setStatus('');
  };

  const selectFromSidebar = (name: string) => {
    guardDirtyNavigation(() => {
      resetNavigation();
      setSelectedName(name);
      setIsNew(false);
      setChildIndex(null);
      setExceptionIndex(null);
      setStatus('');
    });
  };

  const filtered = useMemo(() => {
    let list = events;
    if (catalogTab === 'macro') list = list.filter((e) => e.event_type === 0 && !e.is_exception);
    else if (catalogTab === 'micro') list = list.filter((e) => e.event_type === 1 && !e.is_exception);
    else if (catalogTab === 'exception') list = list.filter((e) => e.is_exception);
    return list.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()));
  }, [events, filter, catalogTab]);

  useEffect(() => {
    if (!selectedName) {
      setDraft(null);
      return;
    }
    const pending = restoreRef.current;
    if (pending?.name === selectedName) {
      restoreRef.current = null;
      setDraft({ ...pending.draft });
      setChildIndex(pending.childIndex);
      setExceptionIndex(pending.exceptionIndex);
      return;
    }
    const found = events.find((e) => e.name === selectedName);
    if (found && !isNew) setDraft({ ...found });
  }, [selectedName, events, isNew]);
  const save = useMutation({
    mutationFn: async (payload: SavePayload) => {
      const { event, originalName } = resolveSavePayload(payload);
      if (event.event_type === 0 && event.name) {
        const index = mergeEventIndex(events, event);
        const cycle = detectCycle(event.name, index);
        if (cycle) {
          throw new Error(`存在循环引用，无法保存：${cycle.join(' → ')}`);
        }
      }
      const validation = await api.validateEvents([event]);
      const item = validation.events.find((v) => v.name === event.name);
      if (item && !item.valid) {
        throw new Error(item.issues.map((i) => i.message).join('；'));
      }
      const warnings = item?.warnings ?? [];
      const saved = isNew && !selectedName
        ? await api.createEvent(event)
        : await api.updateEvent(originalName ?? selectedName!, event);
      return { saved, warnings };
    },
    onSuccess: ({ saved, warnings }, payload) => {
      qc.invalidateQueries({ queryKey: queryKeys.events(projectId) });
      const { originalName } = resolveSavePayload(payload);
      const savedRoot = originalName === null || originalName === selectedName;

      if (savedRoot) {
        const prevName = selectedName;
        setSelectedName(saved.name);
        setDraft(saved);
        setIsNew(false);
        if (prevName && prevName !== saved.name) {
          setNavStack((stack) =>
            stack.map((frame) =>
              frame.name === prevName ? { ...frame, name: saved.name, draft: saved } : frame,
            ),
          );
        }
      }
      const warnText = formatValidationWarnings(warnings);
      setStatus(warnText ? `已保存（警告：${warnText}）` : '已保存');
    },
    onError: (e: Error) => setStatus(e.message),
  });

  const requestDelete = (name: string) => {
    const referrers = findEventReferrers(events, name);
    if (referrers.length > 0) {
      const ok = window.confirm(
        `事件「${name}」被以下事件引用：${referrers.join('、')}。仍要删除吗？`,
      );
      if (!ok) return;
    } else if (!window.confirm(`确定删除事件「${name}」？`)) {
      return;
    }
    remove.mutate(name);
  };

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteEvent(name),
    onSuccess: (_data, name) => {
      qc.invalidateQueries({ queryKey: queryKeys.events(projectId) });
      if (name === selectedName) {
        resetNavigation();
        setSelectedName(null);
        setDraft(null);
      }
      setStatus('已删除');
    },
    onError: (e: Error) => setStatus(e.message),
  });

  return (
    <div className="flex h-full">
      {/* 事件目录 */}
      <aside
        className="flex shrink-0 flex-col overflow-hidden"
        style={{ width: sidebarWidth }}
      >
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
          <div className="mt-2 flex gap-0.5 rounded-lg bg-surface-raised/50 p-0.5 text-xs">
            {(
              [
                ['all', '全部'],
                ['macro', '宏'],
                ['micro', '微'],
                ['exception', '异常'],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                className={`flex-1 rounded-md px-1 py-1 ${
                  catalogTab === tab ? 'bg-surface-raised text-[#e8eaed]' : 'text-[#6b7280]'
                }`}
                onClick={() => setCatalogTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              className="btn flex-1 text-xs"
              onClick={() => {
                guardDirtyNavigation(() => {
                  resetNavigation();
                  setDraft(emptyMacro());
                  setIsNew(true);
                  setSelectedName(null);
                  setChildIndex(null);
                  setExceptionIndex(null);
                });
              }}
            >
              <Plus className="h-3 w-3" />宏
            </button>
            <button
              type="button"
              className="btn flex-1 text-xs"
              onClick={() => {
                guardDirtyNavigation(() => {
                  resetNavigation();
                  setDraft(emptyMicro());
                  setIsNew(true);
                  setSelectedName(null);
                  setChildIndex(null);
                  setExceptionIndex(null);
                });
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
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(EVENT_DRAG_MIME, e.name);
                  ev.dataTransfer.effectAllowed = 'copy';
                }}
                className={`w-full rounded-lg px-2 py-1.5 text-left ${
                  selectedName === e.name && !isNew ? 'bg-surface-raised' : 'hover:bg-surface-raised/50'
                }`}
                onClick={() => selectFromSidebar(e.name)}
                title="拖到编排区可添加为子事件/异常"
              >
                <span className={e.is_exception ? 'text-amber-300' : ''}>{e.name}</span>
                <span className="ml-1 text-xs text-[#6b7280]">{e.event_type === 0 ? '宏' : '微'}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-surface-border p-2">
          <div className="flex gap-1 rounded-lg bg-surface-raised/50 p-0.5">
            <button
              type="button"
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
                viewMode === 'classic' ? 'bg-surface-raised text-[#e8eaed]' : 'text-[#6b7280] hover:text-[#e8eaed]'
              }`}
              onClick={() => setViewMode('classic')}
              title="经典三栏"
            >
              <LayoutList className="h-3.5 w-3.5" />
              列表
            </button>
            <button
              type="button"
              className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
                viewMode === 'graph' ? 'bg-surface-raised text-[#e8eaed]' : 'text-[#6b7280] hover:text-[#e8eaed]'
              }`}
              onClick={() => {
                resetNavigation();
                setViewMode('graph');
              }}
              title="树形画布"
            >
              <GitBranch className="h-3.5 w-3.5" />
              画布
            </button>
          </div>
        </div>
      </aside>

      <ColumnResizeHandle onDelta={resizeSidebar} />

      {viewMode === 'graph' ? (
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!draft ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#6b7280]">
              从左侧选择宏事件以打开树形画布
            </div>
          ) : draft.event_type === 0 ? (
            <EventGraphEditor
              macro={draft}
              allEvents={events}
              actions={actionNames}
              onMacroChange={setDraft}
              onSave={async (event, originalName) => {
                await save.mutateAsync({ event, originalName });
              }}
              onDelete={requestDelete}
              savePending={save.isPending}
              isNew={isNew}
              status={status}
            />
          ) : (
            <EventGraphSingleNode
              event={draft}
              actions={actionNames}
              onChange={setDraft}
              onSave={async () => {
                if (draft) await save.mutateAsync(draft);
              }}
              onDelete={() => draft && requestDelete(draft.name)}
              savePending={save.isPending}
              isNew={isNew}
              status={status}
            />
          )}
        </section>
      ) : (
        <>
      {/* 编排树 */}
      <section
        className="flex shrink-0 flex-col overflow-hidden p-4"
        style={{ width: composeWidth }}
      >
        <h2 className="mb-3 text-sm font-semibold">编排</h2>
        {!draft ? (
          <p className="text-xs text-[#6b7280]">选择宏事件以编辑子事件与异常分支</p>
        ) : draft.event_type === 0 ? (
          <CompositionTreeView
            macro={draft}
            allEvents={events}
            onChange={setDraft}
            selectedChildIndex={childIndex}
            onSelectChild={(index) => {
              setChildIndex(index);
              if (index !== null) setExceptionIndex(null);
            }}
            selectedExceptionIndex={exceptionIndex}
            onSelectException={(index) => {
              setExceptionIndex(index);
              if (index !== null) setChildIndex(null);
            }}
            onOpenEvent={navigateToEvent}
          />
        ) : (
          <p className="text-xs text-[#6b7280]">微事件无子编排，请在右侧编辑属性</p>
        )}
      </section>

      <ColumnResizeHandle onDelta={resizeCompose} />

      {/* 属性面板 */}
      <section className="flex min-w-[280px] flex-1 flex-col overflow-hidden">
        {navStack.length > 0 && (
          <div className="flex items-center gap-2 border-b border-surface-border px-4 py-2">
            <button type="button" className="btn shrink-0 text-xs" onClick={goBack}>
              <ArrowLeft className="h-3.5 w-3.5" />
              返回
            </button>
            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-xs text-[#6b7280]">
              {navStack.map((frame, i) => (
                <span key={`${frame.name}-${i}`} className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    className="max-w-[8rem] truncate rounded px-1 hover:bg-surface-raised hover:text-[#e8eaed]"
                    onClick={() => goToBreadcrumb(i)}
                    title={frame.name}
                  >
                    {frame.name}
                  </button>
                  <ChevronRight className="h-3 w-3 shrink-0" />
                </span>
              ))}
              {draft && (
                <span className="truncate font-medium text-[#e8eaed]" title={draft.name}>
                  {draft.name}
                </span>
              )}
            </nav>
          </div>
        )}
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
          <span className="text-sm font-medium">{draft?.name ?? '未选择'}</span>
          <div className="flex gap-2">
            {draft && !isNew && (
              <button type="button" className="btn btn-danger text-xs" onClick={() => requestDelete(draft.name)}>
                <Trash2 className="h-3.5 w-3.5" />删除
              </button>
            )}
            {draft && (
              <button
                type="button"
                className="btn btn-primary text-xs"
                onClick={() => save.mutate(draft)}
                disabled={save.isPending || Boolean(draftHasCycle)}
                title={draftHasCycle ? `存在环：${draftHasCycle.join(' → ')}` : undefined}
              >
                <Save className="h-3.5 w-3.5" />保存
              </button>
            )}
          </div>
        </div>
        {status && (
          <p
            className={`border-b border-surface-border px-4 py-2 text-xs ${
              status.startsWith('已保存（警告') ? 'text-amber-300' : 'text-[#9aa3b2]'
            }`}
          >
            {status}
          </p>
        )}
        {draftHasCycle && (
          <p className="border-b border-surface-border px-4 py-2 text-xs text-red-300">
            编排存在环，无法保存：{draftHasCycle.join(' → ')}
          </p>
        )}
        <div className="flex-1 overflow-y-auto p-4">
          {draft ? (
            <EventPropertyForm event={draft} actions={actionNames} onChange={setDraft} />
          ) : (
            <p className="text-sm text-[#6b7280]">从左侧选择事件或新建</p>
          )}
        </div>
      </section>
        </>
      )}
    </div>
  );
}
