import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  GripVertical,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import type { ChildEntry, FreerEvent, OpenEventContext, TreeNode } from '../../api/types';
import { buildEventTreeClient } from '../../lib/eventTree';
import {
  cycleNodeSet,
  detectCycle,
  mergeEventIndex,
  readDraggedEventName,
} from '../../lib/eventComposition';
import {
  CHILD_COMPOSE_FIELDS,
  formatChildComposeSummary,
  formatTreeNodeComposeMeta,
} from '../../lib/fieldLabels';
import { CycleWarningBanner } from './CycleWarningBanner';

type TreeSelection =
  | { kind: 'child'; index: number }
  | { kind: 'exception'; index: number }
  | null;

type Props = {
  macro: FreerEvent;
  allEvents: FreerEvent[];
  onChange: (macro: FreerEvent) => void;
  selectedChildIndex: number | null;
  onSelectChild: (index: number | null) => void;
  selectedExceptionIndex: number | null;
  onSelectException: (index: number | null) => void;
  onOpenEvent: (name: string, context?: OpenEventContext) => void;
};

function nodePath(...parts: (string | number)[]): string {
  return parts.join(':');
}

/** 仅宏事件且确有子树时可展开；微事件为叶子节点 */
function isExpandableTreeNode(node: TreeNode | undefined): boolean {
  if (!node || node.event_type !== 0 || node.truncated) return false;
  return Boolean(node.children?.length || node.exceptions?.length);
}

function SortableRootChild({
  entry,
  index,
  selected,
  onOpen,
  onSelectParams,
  onRemove,
  expanded,
  onToggleExpand,
  hasNested,
  hint,
  children,
  inCycle,
}: {
  entry: ChildEntry;
  index: number;
  selected: boolean;
  onOpen: () => void;
  onSelectParams: () => void;
  onRemove: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  hasNested: boolean;
  hint?: string;
  children: ReactNode;
  inCycle?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: `root-child-${index}`,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border ${
        inCycle
          ? 'border-red-700/70 bg-red-950/30'
          : selected
            ? 'border-accent bg-accent/5'
            : 'border-surface-border bg-surface-raised/30'
      }`}
    >
      <div className="flex items-center gap-1 px-1 py-1">
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center text-[#6b7280]"
          onClick={onToggleExpand}
          disabled={!hasNested}
          aria-label={expanded ? '折叠' : '展开'}
        >
          {hasNested ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="inline-block h-1 w-1 rounded-full bg-[#4b5563]" />
          )}
        </button>
        <button
          type="button"
          className="cursor-grab text-[#6b7280]"
          {...attributes}
          {...listeners}
          aria-label="拖拽排序"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div
          className="min-w-0 flex-1 px-1 py-0.5"
          role="button"
          tabIndex={0}
          onClick={onSelectParams}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectParams();
            }
          }}
          title="编辑子事件编排参数（最少/最多执行次数、优先级）"
        >
          <button
            type="button"
            className="truncate text-left text-sm font-medium hover:text-accent"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            title="编辑此事件"
          >
            {entry.event}
          </button>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {formatChildComposeSummary(entry)}
            {hint ? ` · ${hint}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="text-[#9aa3b2] hover:text-red-300"
          onClick={onRemove}
          aria-label="移除引用"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {hasNested && expanded && (
        <div className="border-t border-surface-border/60 pl-3">{children}</div>
      )}
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  onToggle,
  selection,
  onOpenEvent,
  openContext,
  isRootChild,
  childIndex,
  exceptionIndex,
  inCycle,
}: {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  onToggle: () => void;
  selection: TreeSelection;
  onOpenEvent: (name: string, context?: OpenEventContext) => void;
  openContext?: OpenEventContext;
  isRootChild?: boolean;
  childIndex?: number;
  exceptionIndex?: number;
  inCycle?: boolean;
}) {
  const hasKids = isExpandableTreeNode(node);

  const selected =
    (isRootChild &&
      childIndex !== undefined &&
      selection?.kind === 'child' &&
      selection.index === childIndex) ||
    (exceptionIndex !== undefined &&
      selection?.kind === 'exception' &&
      selection.index === exceptionIndex);

  const handleOpen = () => onOpenEvent(node.name, openContext);

  const meta = formatTreeNodeComposeMeta(node);

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div
        className={`group flex items-center gap-1 rounded-md px-1 py-0.5 text-sm ${
          inCycle
            ? 'bg-red-950/50 text-red-200'
            : selected
              ? 'bg-accent/15 text-accent'
              : 'hover:bg-surface-raised/60'
        }`}
      >
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center text-[#6b7280]"
          onClick={onToggle}
          disabled={!hasKids}
          aria-label={expanded ? '折叠' : '展开'}
        >
          {hasKids ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className="inline-block h-1 w-1 rounded-full bg-[#4b5563]" />
          )}
        </button>
        <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={handleOpen}>
          <span className={node.role === 'exception' || node.is_exception ? 'text-amber-200/90' : ''}>
            {node.name}
          </span>
          <span className="ml-1.5 text-xs text-[#6b7280]">
            {node.event_type === 0 ? '宏' : '微'}
            {node.action ? ` · ${node.action}` : ''}
            {node.truncated ? ' · …' : ''}
          </span>
          {meta && <span className="ml-1 text-xs text-[#6b7280]">({meta})</span>}
        </button>
      </div>
    </div>
  );
}

function SubtreeNodes({
  nodes,
  parentPath,
  depth,
  expandedPaths,
  togglePath,
  selection,
  onOpenEvent,
  openContext,
  cycleNodes,
}: {
  nodes: TreeNode[];
  parentPath: string;
  depth: number;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  selection: TreeSelection;
  onOpenEvent: (name: string, context?: OpenEventContext) => void;
  openContext?: OpenEventContext;
  cycleNodes: Set<string>;
}) {
  return (
    <>
      {nodes.map((node, i) => {
        const path = nodePath(parentPath, 'c', i);
        const expanded = expandedPaths.has(path);
        const hasKids = isExpandableTreeNode(node);

        return (
          <div key={path}>
            <TreeNodeRow
              node={node}
              depth={depth}
              expanded={expanded}
              onToggle={() => togglePath(path)}
              selection={selection}
              onOpenEvent={onOpenEvent}
              openContext={openContext}
              inCycle={cycleNodes.has(node.name)}
            />
            {expanded && hasKids && !node.truncated && (
              <div>
                {node.children && node.children.length > 0 && (
                  <SubtreeNodes
                    nodes={node.children}
                    parentPath={path}
                    depth={depth + 1}
                    expandedPaths={expandedPaths}
                    togglePath={togglePath}
                    selection={selection}
                    onOpenEvent={onOpenEvent}
                    openContext={openContext}
                    cycleNodes={cycleNodes}
                  />
                )}
                {node.exceptions && node.exceptions.length > 0 && (
                  <div style={{ marginLeft: (depth + 1) * 12 }} className="my-1">
                    <div className="text-xs font-medium text-amber-200/70">异常分支</div>
                    <SubtreeNodes
                      nodes={node.exceptions}
                      parentPath={nodePath(path, 'exc')}
                      depth={depth + 1}
                      expandedPaths={expandedPaths}
                      togglePath={togglePath}
                      selection={selection}
                      onOpenEvent={onOpenEvent}
                      openContext={openContext}
                      cycleNodes={cycleNodes}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function NestedTree({
  node,
  pathPrefix,
  expandedPaths,
  togglePath,
  selection,
  onOpenEvent,
  openContext,
  cycleNodes,
}: {
  node: TreeNode;
  pathPrefix: string;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  selection: TreeSelection;
  onOpenEvent: (name: string, context?: OpenEventContext) => void;
  openContext?: OpenEventContext;
  cycleNodes: Set<string>;
}) {
  return (
    <>
      {node.children && node.children.length > 0 && (
        <SubtreeNodes
          nodes={node.children}
          parentPath={pathPrefix}
          depth={1}
          expandedPaths={expandedPaths}
          togglePath={togglePath}
          selection={selection}
          onOpenEvent={onOpenEvent}
          openContext={openContext}
          cycleNodes={cycleNodes}
        />
      )}
      {node.exceptions && node.exceptions.length > 0 && (
        <div className="my-1 pl-3">
          <div className="text-xs font-medium text-amber-200/70">异常分支</div>
          <SubtreeNodes
            nodes={node.exceptions}
            parentPath={nodePath(pathPrefix, 'exc')}
            depth={1}
            expandedPaths={expandedPaths}
            togglePath={togglePath}
            selection={selection}
            onOpenEvent={onOpenEvent}
            openContext={openContext}
            cycleNodes={cycleNodes}
          />
        </div>
      )}
    </>
  );
}

export function CompositionTreeView({
  macro,
  allEvents,
  onChange,
  selectedChildIndex,
  onSelectChild,
  selectedExceptionIndex,
  onSelectException,
  onOpenEvent,
}: Props) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const [dropTarget, setDropTarget] = useState<'child' | 'exception' | null>(null);

  const children = macro.event_list ?? [];
  const exceptions = macro.exception_list ?? [];

  const eventIndex = useMemo(
    () => mergeEventIndex(allEvents, macro),
    [allEvents, macro],
  );

  const cycle = useMemo(() => detectCycle(macro.name, eventIndex), [macro.name, eventIndex]);
  const cycleNodes = useMemo(() => cycleNodeSet(cycle), [cycle]);

  useEffect(() => {
    const paths = new Set<string>();
    children.forEach((_, i) => paths.add(nodePath('root', 'c', i)));
    exceptions.forEach((_, i) => paths.add(nodePath('root', 'e', i)));
    setExpandedPaths(paths);
  }, [macro.name]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const eventsByName = useMemo(() => new Map(allEvents.map((e) => [e.name, e])), [allEvents]);

  const tree = useMemo(
    () => buildEventTreeClient(macro.name, eventsByName, { rootDraft: macro }),
    [macro, eventsByName],
  );

  const selection: TreeSelection =
    selectedChildIndex !== null
      ? { kind: 'child', index: selectedChildIndex }
      : selectedExceptionIndex !== null
        ? { kind: 'exception', index: selectedExceptionIndex }
        : null;

  const togglePath = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const updateChildren = (list: ChildEntry[]) => onChange({ ...macro, event_list: list });
  const updateExceptions = (list: string[]) => onChange({ ...macro, exception_list: list });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = children.findIndex((_, i) => `root-child-${i}` === active.id);
    const newIndex = children.findIndex((_, i) => `root-child-${i}` === over.id);
    if (oldIndex >= 0 && newIndex >= 0) {
      updateChildren(arrayMove(children, oldIndex, newIndex));
      onSelectChild(newIndex);
    }
  };

  const addChild = (name: string) => {
    if (!name) return;
    const nextIndex = children.length;
    updateChildren([
      ...children,
      { event: name, should_run_time: 0, max_run_time: 1, priority: 0 },
    ]);
    setExpandedPaths((prev) => new Set(prev).add(nodePath('root', 'c', nextIndex)));
  };

  const addException = (name: string) => {
    if (!name || exceptions.includes(name)) return;
    const nextIndex = exceptions.length;
    updateExceptions([...exceptions, name]);
    setExpandedPaths((prev) => new Set(prev).add(nodePath('root', 'e', nextIndex)));
  };

  const handleDrop = (kind: 'child' | 'exception', e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const name = readDraggedEventName(e.dataTransfer);
    if (!name) return;
    const dragged = eventIndex.get(name);
    if (!dragged) return;
    if (kind === 'exception') {
      if (!dragged.is_exception) return;
      addException(name);
    } else {
      if (dragged.is_exception) return;
      addChild(name);
    }
  };

  const allowDrop = (kind: 'child' | 'exception', e: DragEvent) => {
    const name = readDraggedEventName(e.dataTransfer);
    if (!name) return;
    const dragged = eventIndex.get(name);
    if (!dragged) return;
    if (kind === 'exception' && !dragged.is_exception) return;
    if (kind === 'child' && dragged.is_exception) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTarget(kind);
  };

  const macroNames = allEvents.filter((e) => e.event_type === 0 && !e.is_exception).map((e) => e.name);
  const microNames = allEvents.filter((e) => e.event_type === 1 && !e.is_exception).map((e) => e.name);
  const excNames = allEvents.filter((e) => e.is_exception).map((e) => e.name);

  const handleSelectChild = (index: number) => {
    onSelectChild(index);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {cycle && <CycleWarningBanner cycle={cycle} />}

      <div className="flex shrink-0 items-center gap-2 text-xs text-[#6b7280]">
        <FolderTree className="h-3.5 w-3.5" />
        <span>点击事件名编辑；可从左侧目录拖入子事件/异常</span>
      </div>

      <div className="flex shrink-0 gap-2">
        <select
          className="input flex-1 text-xs"
          defaultValue=""
          onChange={(e) => {
            addChild(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="">+ 子事件</option>
          <optgroup label="宏事件">
            {macroNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </optgroup>
          <optgroup label="微事件">
            {microNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </optgroup>
        </select>
        <select
          className="input flex-1 text-xs"
          defaultValue=""
          onChange={(e) => {
            addException(e.target.value);
            e.target.value = '';
          }}
        >
          <option value="">+ 异常</option>
          {excNames.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto pr-1"
        onDragLeave={() => setDropTarget(null)}
      >
        <div
          className={`mb-2 rounded-lg border border-dashed px-2 py-2 transition ${
            dropTarget === 'child'
              ? 'border-accent bg-accent/10'
              : 'border-transparent hover:border-surface-border/60'
          }`}
          onDragOver={(e) => allowDrop('child', e)}
          onDragLeave={() => setDropTarget((t) => (t === 'child' ? null : t))}
          onDrop={(e) => handleDrop('child', e)}
        >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={children.map((_, i) => `root-child-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {children.length === 0 && exceptions.length === 0 && (
                <p className="text-xs text-[#6b7280]">暂无子事件，从上方下拉或左侧目录拖入</p>
              )}
              {children.map((entry, i) => {
                const childTree = tree.children?.[i];
                const childPath = nodePath('root', 'c', i);
                const hasNested = isExpandableTreeNode(childTree);
                const hint =
                  childTree?.event_type === 1 && childTree.action
                    ? `动作：${childTree.action}`
                    : undefined;

                return (
                  <SortableRootChild
                    key={`${entry.event}-${i}`}
                    entry={entry}
                    index={i}
                    selected={selectedChildIndex === i}
                    onOpen={() => onOpenEvent(entry.event, { childIndex: i, exceptionIndex: null })}
                    onSelectParams={() => handleSelectChild(i)}
                    onRemove={() => {
                      updateChildren(children.filter((_, j) => j !== i));
                      onSelectChild(null);
                    }}
                    hasNested={hasNested}
                    hint={hint}
                    expanded={expandedPaths.has(childPath)}
                    onToggleExpand={() => togglePath(childPath)}
                    inCycle={cycleNodes.has(entry.event)}
                  >
                    {hasNested && childTree ? (
                      <div className="py-1 pr-1">
                        <NestedTree
                          node={childTree}
                          pathPrefix={childPath}
                          expandedPaths={expandedPaths}
                          togglePath={togglePath}
                          selection={selection}
                          onOpenEvent={onOpenEvent}
                          openContext={{ childIndex: i, exceptionIndex: null }}
                          cycleNodes={cycleNodes}
                        />
                      </div>
                    ) : null}
                  </SortableRootChild>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        </div>

        {exceptions.length > 0 && (
          <div
            className={`mt-3 space-y-1 rounded-lg border border-dashed px-1 py-1 transition ${
              dropTarget === 'exception'
                ? 'border-amber-600/70 bg-amber-950/30'
                : 'border-transparent'
            }`}
            onDragOver={(e) => allowDrop('exception', e)}
            onDragLeave={() => setDropTarget((t) => (t === 'exception' ? null : t))}
            onDrop={(e) => handleDrop('exception', e)}
          >
            <div className="text-xs font-medium text-amber-200/80">异常分支</div>
            {exceptions.map((name, i) => {
              const excTree = tree.exceptions?.[i];
              const excPath = nodePath('root', 'e', i);
              const hasNested = isExpandableTreeNode(excTree);
              const expanded = expandedPaths.has(excPath);
              const inCycle = cycleNodes.has(name);

              return (
                <div
                  key={`${name}-${i}`}
                  className={`rounded-lg border px-2 py-1 ${
                    inCycle
                      ? 'border-red-700/70 bg-red-950/30'
                      : selectedExceptionIndex === i
                        ? 'border-amber-600/60 bg-amber-950/40'
                        : 'border-amber-900/30 bg-amber-950/20'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex h-5 w-5 shrink-0 items-center justify-center text-amber-200/70"
                      onClick={() => togglePath(excPath)}
                      disabled={!hasNested}
                      aria-label={expanded ? '折叠' : '展开'}
                    >
                      {hasNested ? (
                        expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                      ) : (
                        <span className="inline-block h-1 w-1 rounded-full bg-amber-700" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="flex-1 text-left text-sm text-amber-100/90 hover:text-amber-50"
                      onClick={() => {
                        onSelectException(i);
                        onOpenEvent(name, { childIndex: null, exceptionIndex: i });
                      }}
                    >
                      {name}
                      {excTree?.event_type === 1 && excTree.action && (
                        <span className="ml-1.5 text-xs text-amber-200/50">· 动作 {excTree.action}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="text-[#9aa3b2] hover:text-red-300"
                      onClick={() => {
                        updateExceptions(exceptions.filter((_, j) => j !== i));
                        onSelectException(null);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {excTree && hasNested && expanded && (
                    <div className="mt-1 border-t border-amber-900/20 pt-1">
                      <NestedTree
                        node={excTree}
                        pathPrefix={excPath}
                        expandedPaths={expandedPaths}
                        togglePath={togglePath}
                        selection={selection}
                        onOpenEvent={onOpenEvent}
                        openContext={{ childIndex: null, exceptionIndex: i }}
                        cycleNodes={cycleNodes}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {exceptions.length === 0 && (
          <div
            className={`mt-2 rounded-lg border border-dashed px-2 py-3 text-center text-xs text-[#6b7280] transition ${
              dropTarget === 'exception'
                ? 'border-amber-600/70 bg-amber-950/30 text-amber-100/80'
                : 'border-surface-border/40'
            }`}
            onDragOver={(e) => allowDrop('exception', e)}
            onDragLeave={() => setDropTarget((t) => (t === 'exception' ? null : t))}
            onDrop={(e) => handleDrop('exception', e)}
          >
            拖入异常事件到此
          </div>
        )}
      </div>

      {selectedChildIndex !== null && children[selectedChildIndex] && (
        <div className="card shrink-0 space-y-2">
          <h4 className="text-xs font-medium text-[#9aa3b2]">子事件编排参数</h4>
          {CHILD_COMPOSE_FIELDS.map(({ key, label, hint: fieldHint }) => (
            <div key={key}>
              <label className="label" title={fieldHint}>
                {label}
              </label>
              <input
                className="input"
                type="number"
                value={children[selectedChildIndex][key] ?? 0}
                onChange={(e) => {
                  const next = [...children];
                  next[selectedChildIndex] = {
                    ...next[selectedChildIndex],
                    [key]: Number(e.target.value),
                  };
                  updateChildren(next);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
