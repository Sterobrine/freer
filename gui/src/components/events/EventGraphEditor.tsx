import {
  Maximize2,
  Save,
  Trash2,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { FreerEvent, TreeNode } from '../../api/types';
import { buildEventTreeClient } from '../../lib/eventTree';
import {
  addCompositionRef,
  cycleNodeSet,
  detectCycle,
  isCycleEdge,
  mergeEventIndex,
  parseNodeRef,
  readDraggedEventName,
  removeCompositionRef,
} from '../../lib/eventComposition';
import {
  edgePath,
  layoutEventGraph,
  type GraphNodeLayout,
} from '../../lib/eventGraphLayout';
import { CycleWarningBanner } from './CycleWarningBanner';
import { EventPropertyForm } from './EventPropertyForm';

type Viewport = { x: number; y: number; zoom: number };

type Props = {
  macro: FreerEvent;
  allEvents: FreerEvent[];
  actions: string[];
  onMacroChange: (event: FreerEvent) => void;
  onSave: (event: FreerEvent, originalName: string) => void | Promise<void>;
  onDelete: (name: string) => void;
  savePending: boolean;
  isNew: boolean;
  status: string;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

function GraphNodeCard({
  node,
  selected,
  inCycle,
  dropHighlight,
  onSelect,
  onDropRef,
  onDragEnter,
  onDragLeave,
}: {
  node: GraphNodeLayout;
  selected: boolean;
  inCycle?: boolean;
  dropHighlight?: boolean;
  onSelect: () => void;
  onDropRef?: (e: DragEvent) => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
}) {
  const isMacro = node.eventType === 0;
  const isExc = node.isException || node.role === 'exception';

  return (
    <div
      className={`pointer-events-auto absolute cursor-pointer rounded-xl border-2 shadow-lg transition-shadow ${
        inCycle
          ? 'border-red-500 shadow-red-900/30'
          : dropHighlight
            ? 'border-accent shadow-accent/30 ring-2 ring-accent/40'
            : selected
              ? 'border-accent shadow-accent/20'
              : isExc
                ? 'border-amber-700/60 hover:border-amber-500/80'
                : isMacro
                  ? 'border-[#3d4a63] hover:border-accent/50'
                  : 'border-emerald-800/50 hover:border-emerald-500/60'
      } ${isExc ? 'bg-[#1a1510]' : 'bg-[#1a1f2b]'}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDragOver={
        onDropRef
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
            }
          : undefined
      }
      onDragEnter={
        onDropRef
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragEnter?.();
            }
          : undefined
      }
      onDragLeave={(e) => {
        if (onDropRef) {
          e.stopPropagation();
          onDragLeave?.();
        }
      }}
      onDrop={
        onDropRef
          ? (e) => {
              e.stopPropagation();
              onDropRef(e);
            }
          : undefined
      }
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex h-full flex-col justify-center px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              isExc ? 'bg-amber-400' : isMacro ? 'bg-accent' : 'bg-emerald-400'
            }`}
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-[#6b7280]">
          {isMacro ? '宏事件' : '微事件'}
          {node.action ? ` · ${node.action}` : ''}
          {node.truncated ? ' · …' : ''}
        </p>
        {node.meta && (
          <p className="truncate text-[10px] text-[#4b5563]">{node.meta}</p>
        )}
      </div>
    </div>
  );
}

function eventForNode(
  node: GraphNodeLayout,
  macro: FreerEvent,
  eventsByName: Map<string, FreerEvent>,
): FreerEvent | null {
  if (node.isRoot) return macro;
  return eventsByName.get(node.name) ?? null;
}

export function EventGraphEditor({
  macro,
  allEvents,
  actions,
  onMacroChange,
  onSave,
  onDelete,
  savePending,
  isNew,
  status,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('root');
  const [panelEvent, setPanelEvent] = useState<FreerEvent | null>(null);
  const [panelSourceName, setPanelSourceName] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [patches, setPatches] = useState<Map<string, FreerEvent>>(() => new Map());
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const panRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );

  const eventsByName = useMemo(() => {
    const map = mergeEventIndex(allEvents, macro, patches);
    return map;
  }, [allEvents, macro, patches]);

  const eventIndex = eventsByName;

  const cycle = useMemo(() => detectCycle(macro.name, eventIndex), [macro.name, eventIndex]);
  const cycleNodes = useMemo(() => cycleNodeSet(cycle), [cycle]);

  const tree: TreeNode = useMemo(
    () => buildEventTreeClient(macro.name, eventsByName, { rootDraft: macro }),
    [macro, eventsByName],
  );

  const layout = useMemo(() => layoutEventGraph(tree), [tree]);

  const nodeById = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;

  const loadPanelForNode = useCallback(
    (node: GraphNodeLayout) => {
      const ev = eventForNode(node, macro, eventsByName);
      if (!ev) {
        setPanelEvent(null);
        setPanelSourceName(null);
        return;
      }
      setPanelEvent({ ...ev });
      setPanelSourceName(ev.name);
    },
    [macro, eventsByName],
  );

  const fitToView = useCallback(() => {
    const el = canvasRef.current;
    if (!el || layout.nodes.length === 0) return;

    const rect = el.getBoundingClientRect();
    const pad = 40;
    const scaleX = (rect.width - pad * 2) / layout.width;
    const scaleY = (rect.height - pad * 2) / layout.height;
    const zoom = Math.min(Math.max(Math.min(scaleX, scaleY), MIN_ZOOM), 1);

    setViewport({
      x: (rect.width - layout.width * zoom) / 2,
      y: (rect.height - layout.height * zoom) / 2,
      zoom,
    });
  }, [layout]);

  useEffect(() => {
    fitToView();
  }, [macro.name, fitToView]);

  useEffect(() => {
    setSelectedNodeId('root');
    setPatches(new Map());
  }, [macro.name]);

  useEffect(() => {
    const root = nodeById.get('root');
    if (root) loadPanelForNode(root);
  }, [macro.name, nodeById, loadPanelForNode]);

  useEffect(() => {
    if (selectedNode?.isRoot && panelSourceName === macro.name) {
      setPanelEvent({ ...macro });
    }
  }, [macro, selectedNode?.isRoot, panelSourceName]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      setViewport((prev) => {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * factor));
        const scale = nextZoom / prev.zoom;
        return {
          zoom: nextZoom,
          x: mx - (mx - prev.x) * scale,
          y: my - (my - prev.y) * scale,
        };
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as HTMLElement;
    if (!target.classList.contains('graph-canvas-bg')) return;

    panRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: viewport.x,
      origY: viewport.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!panRef.current?.active) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    setViewport((prev) => ({
      ...prev,
      x: panRef.current!.origX + dx,
      y: panRef.current!.origY + dy,
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (panRef.current?.active) {
      panRef.current.active = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const zoomBy = (factor: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;

    setViewport((prev) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * factor));
      const scale = nextZoom / prev.zoom;
      return {
        zoom: nextZoom,
        x: mx - (mx - prev.x) * scale,
        y: my - (my - prev.y) * scale,
      };
    });
  };

  const handleNodeSelect = (node: GraphNodeLayout) => {
    setSelectedNodeId(node.id);
    setPanelOpen(true);
    loadPanelForNode(node);
  };

  const handlePanelChange = (event: FreerEvent) => {
    setPanelEvent(event);
    if (selectedNode?.isRoot) {
      onMacroChange(event);
    }
  };

  const applyCompositionUpdate = useCallback(
    (result: { rootMacro: FreerEvent; patches: Map<string, FreerEvent> }) => {
      onMacroChange(result.rootMacro);
      if (result.patches.size > 0) {
        setPatches((prev) => {
          const next = new Map(prev);
          result.patches.forEach((event, name) => next.set(name, event));
          return next;
        });
      }
    },
    [onMacroChange],
  );

  const handleAddRef = useCallback(
    (targetPath: string, eventName: string, kind: 'child' | 'exception') => {
      const result = addCompositionRef(macro, eventIndex, targetPath, eventName, kind);
      applyCompositionUpdate(result);
    },
    [macro, eventIndex, applyCompositionUpdate],
  );

  const handleRemoveFromComposition = useCallback(() => {
    if (!selectedNodeId || selectedNodeId === 'root') return;
    const result = removeCompositionRef(macro, eventIndex, selectedNodeId);
    if (!result) return;
    applyCompositionUpdate(result);
    setSelectedNodeId('root');
  }, [selectedNodeId, macro, eventIndex, applyCompositionUpdate]);

  const handleDropOnMacro = useCallback(
    (targetPath: string, e: DragEvent) => {
      setDropTargetId(null);
      const name = readDraggedEventName(e.dataTransfer);
      if (!name) return;
      const dragged = eventIndex.get(name);
      if (!dragged) return;
      const kind = dragged.is_exception ? 'exception' : 'child';
      handleAddRef(targetPath, name, kind);
    },
    [eventIndex, handleAddRef],
  );

  const macroNames = useMemo(
    () => allEvents.filter((e) => e.event_type === 0 && !e.is_exception).map((e) => e.name),
    [allEvents],
  );
  const microNames = useMemo(
    () => allEvents.filter((e) => e.event_type === 1 && !e.is_exception).map((e) => e.name),
    [allEvents],
  );
  const excNames = useMemo(
    () => allEvents.filter((e) => e.is_exception).map((e) => e.name),
    [allEvents],
  );

  const selectedMacroPath =
    selectedNode?.eventType === 0 ? selectedNodeId ?? 'root' : null;

  const canRemoveFromComposition = Boolean(
    selectedNodeId && selectedNodeId !== 'root' && parseNodeRef(selectedNodeId),
  );

  const saveAllPatches = async () => {
    for (const [name, event] of patches) {
      await onSave(event, name);
    }
    setPatches(new Map());
  };

  const canDelete = panelEvent && !(isNew && selectedNode?.isRoot);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0c10]">
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-surface-border bg-surface/90 p-1 backdrop-blur-sm">
        <button type="button" className="btn px-2 py-1 text-xs" onClick={() => zoomBy(1.2)} title="放大">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="btn px-2 py-1 text-xs" onClick={() => zoomBy(1 / 1.2)} title="缩小">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="btn px-2 py-1 text-xs" onClick={fitToView} title="适应视图">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 text-xs text-[#6b7280]">{Math.round(viewport.zoom * 100)}%</span>
      </div>

      <div className="absolute right-3 top-3 z-20 max-w-xs rounded-lg border border-surface-border bg-surface/80 px-3 py-1.5 text-xs text-[#6b7280] backdrop-blur-sm">
        滚轮缩放 · 拖拽平移 · 拖入宏节点添加子事件
      </div>

      {cycle && (
        <div className="absolute left-3 right-3 top-14 z-20 mx-auto max-w-lg">
          <CycleWarningBanner cycle={cycle} />
        </div>
      )}

      {patches.size > 0 && (
        <div className="absolute bottom-4 left-3 z-20 flex items-center gap-2 rounded-lg border border-amber-800/50 bg-amber-950/80 px-3 py-2 text-xs text-amber-100 backdrop-blur-sm">
          <span>{patches.size} 个嵌套宏事件编排未保存</span>
          <button type="button" className="btn btn-primary px-2 py-1 text-xs" onClick={() => void saveAllPatches()}>
            全部保存
          </button>
        </div>
      )}

      <div
        ref={canvasRef}
        className="graph-canvas-bg relative min-h-0 flex-1 cursor-grab active:cursor-grabbing"
        style={{
          backgroundImage: 'radial-gradient(circle, #232936 1px, transparent 1px)',
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={() => setSelectedNodeId(null)}
      >
        <div
          className="pointer-events-none absolute origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            width: layout.width,
            height: layout.height,
          }}
        >
          <svg
            className="absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
          >
            {layout.edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              const cycleEdge = isCycleEdge(from.name, to.name, cycle);
              return (
                <path
                  key={edge.id}
                  d={edgePath(from, to)}
                  fill="none"
                  stroke={cycleEdge ? '#ef4444' : edge.kind === 'exception' ? '#b45309' : '#3d5a8a'}
                  strokeWidth={cycleEdge ? 3 : 2}
                  strokeDasharray={edge.kind === 'exception' ? '6 4' : undefined}
                  opacity={cycleEdge ? 1 : 0.7}
                />
              );
            })}
          </svg>
        </div>

        <div
          className="pointer-events-none absolute origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            width: layout.width,
            height: layout.height,
          }}
        >
          {layout.nodes.map((node) => (
            <GraphNodeCard
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              inCycle={cycleNodes.has(node.name)}
              dropHighlight={dropTargetId === node.id}
              onSelect={() => handleNodeSelect(node)}
              onDropRef={
                node.eventType === 0
                  ? (e) => {
                      setDropTargetId(null);
                      handleDropOnMacro(node.id, e);
                    }
                  : undefined
              }
              onDragEnter={node.eventType === 0 ? () => setDropTargetId(node.id) : undefined}
              onDragLeave={node.eventType === 0 ? () => setDropTargetId(null) : undefined}
            />
          ))}
        </div>
      </div>

      {panelOpen && (
        <div className="absolute bottom-0 right-0 top-0 z-30 flex w-[min(420px,90vw)] flex-col border-l border-surface-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {panelEvent?.name ?? '未选择节点'}
              </p>
              {macro.name !== panelEvent?.name && (
                <p className="truncate text-xs text-[#6b7280]">画布根：{macro.name}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {canDelete && panelSourceName && (
                <button
                  type="button"
                  className="btn btn-danger px-2 py-1 text-xs"
                  onClick={() => onDelete(panelSourceName)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {panelEvent && panelSourceName && (
                <button
                  type="button"
                  className="btn btn-primary px-2 py-1 text-xs"
                  onClick={() => {
                    onSave(panelEvent, panelSourceName);
                    if (panelEvent.name !== panelSourceName) {
                      setPanelSourceName(panelEvent.name);
                    }
                  }}
                  disabled={savePending}
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                className="btn px-2 py-1 text-xs"
                onClick={() => setPanelOpen(false)}
                aria-label="关闭面板"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {status && (
            <p className="border-b border-surface-border px-4 py-2 text-xs text-[#9aa3b2]">{status}</p>
          )}
          {(selectedMacroPath || canRemoveFromComposition) && (
            <div className="space-y-2 border-b border-surface-border px-4 py-3">
              <p className="text-xs font-medium text-[#9aa3b2]">编排操作</p>
              {selectedMacroPath && (
                <div className="flex flex-wrap gap-2">
                  <select
                    className="input flex-1 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddRef(selectedMacroPath, e.target.value, 'child');
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">+ 子事件</option>
                    <optgroup label="宏">
                      {macroNames.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </optgroup>
                    <optgroup label="微">
                      {microNames.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </optgroup>
                  </select>
                  <select
                    className="input flex-1 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddRef(selectedMacroPath, e.target.value, 'exception');
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">+ 异常</option>
                    {excNames.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              )}
              {canRemoveFromComposition && (
                <button
                  type="button"
                  className="btn w-full text-xs"
                  onClick={handleRemoveFromComposition}
                >
                  <Unlink className="h-3.5 w-3.5" />
                  从编排中移除
                </button>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4">
            {panelEvent ? (
              <EventPropertyForm event={panelEvent} actions={actions} onChange={handlePanelChange} />
            ) : (
              <p className="text-sm text-[#6b7280]">点击画布中的节点以编辑属性</p>
            )}
          </div>
        </div>
      )}

      {!panelOpen && (
        <button
          type="button"
          className="absolute bottom-4 right-4 z-20 btn btn-primary text-xs shadow-lg"
          onClick={() => setPanelOpen(true)}
        >
          编辑属性
        </button>
      )}
    </div>
  );
}

export function EventGraphSingleNode({
  event,
  actions,
  onChange,
  onSave,
  onDelete,
  savePending,
  isNew,
  status,
}: {
  event: FreerEvent;
  actions: string[];
  onChange: (event: FreerEvent) => void;
  onSave: () => void;
  onDelete: () => void;
  savePending: boolean;
  isNew: boolean;
  status: string;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a0c10]">
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-xl border-2 border-emerald-800/50 bg-[#1a1f2b] px-8 py-6 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="text-lg font-medium">{event.name}</span>
          </div>
          <p className="mt-1 text-sm text-[#6b7280]">微事件 · {event.action || '未绑定动作'}</p>
        </div>
      </div>
      <div className="flex w-full flex-col border-t border-surface-border bg-surface">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
          <span className="text-sm font-medium">{event.name}</span>
          <div className="flex gap-2">
            {!isNew && (
              <button type="button" className="btn btn-danger text-xs" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />删除
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary text-xs"
              onClick={onSave}
              disabled={savePending}
            >
              <Save className="h-3.5 w-3.5" />保存
            </button>
          </div>
        </div>
        {status && <p className="border-b border-surface-border px-4 py-2 text-xs text-[#9aa3b2]">{status}</p>}
        <div className="max-h-[45vh] overflow-y-auto p-4">
          <EventPropertyForm event={event} actions={actions} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}
