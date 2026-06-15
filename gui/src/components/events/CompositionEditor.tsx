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
import { GripVertical, Trash2 } from 'lucide-react';
import type { ChildEntry, FreerEvent } from '../../api/types';

type Props = {
  macro: FreerEvent;
  allEvents: FreerEvent[];
  onChange: (macro: FreerEvent) => void;
  selectedChildIndex: number | null;
  onSelectChild: (index: number | null) => void;
};

function SortableChild({
  entry,
  index,
  selected,
  onSelect,
  onRemove,
}: {
  entry: ChildEntry;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `child-${index}` });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
        selected ? 'border-accent bg-accent/10' : 'border-surface-border bg-surface-raised/40'
      }`}
    >
      <button type="button" className="cursor-grab text-[#6b7280]" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </button>
      <button type="button" className="flex-1 text-left" onClick={onSelect}>
        <span className="font-medium">{entry.event}</span>
        <span className="ml-2 text-xs text-[#6b7280]">
          should={entry.should_run_time} max={entry.max_run_time}
          {entry.priority ? ` p=${entry.priority}` : ''}
        </span>
      </button>
      <button type="button" className="text-[#9aa3b2] hover:text-red-300" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function CompositionEditor({
  macro,
  allEvents,
  onChange,
  selectedChildIndex,
  onSelectChild,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const children = macro.event_list ?? [];
  const exceptions = macro.exception_list ?? [];

  const updateChildren = (list: ChildEntry[]) => onChange({ ...macro, event_list: list });
  const updateExceptions = (list: string[]) => onChange({ ...macro, exception_list: list });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = children.findIndex((_, i) => `child-${i}` === active.id);
    const newIndex = children.findIndex((_, i) => `child-${i}` === over.id);
    if (oldIndex >= 0 && newIndex >= 0) {
      updateChildren(arrayMove(children, oldIndex, newIndex));
      onSelectChild(newIndex);
    }
  };

  const addChild = (name: string) => {
    if (!name) return;
    updateChildren([
      ...children,
      { event: name, should_run_time: 0, max_run_time: 1, priority: 0 },
    ]);
  };

  const addException = (name: string) => {
    if (!name || exceptions.includes(name)) return;
    updateExceptions([...exceptions, name]);
  };

  const macroNames = allEvents.filter((e) => e.event_type === 0 && !e.is_exception).map((e) => e.name);
  const microNames = allEvents.filter((e) => e.event_type === 1 && !e.is_exception).map((e) => e.name);
  const excNames = allEvents.filter((e) => e.is_exception).map((e) => e.name);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">子事件</h3>
          <select
            className="input w-auto text-xs"
            defaultValue=""
            onChange={(e) => {
              addChild(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">+ 添加子事件</option>
            <optgroup label="宏事件">
              {macroNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </optgroup>
            <optgroup label="微事件">
              {microNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </optgroup>
          </select>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={children.map((_, i) => `child-${i}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {children.map((entry, i) => (
                <SortableChild
                  key={`${entry.event}-${i}`}
                  entry={entry}
                  index={i}
                  selected={selectedChildIndex === i}
                  onSelect={() => onSelectChild(i)}
                  onRemove={() => {
                    updateChildren(children.filter((_, j) => j !== i));
                    onSelectChild(null);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {children.length === 0 && (
          <p className="text-xs text-[#6b7280]">从下拉菜单拖入或添加子事件引用</p>
        )}
      </div>

      {selectedChildIndex !== null && children[selectedChildIndex] && (
        <div className="card space-y-2">
          <h4 className="text-xs font-medium text-[#9aa3b2]">子事件编排参数</h4>
          {(['should_run_time', 'max_run_time', 'priority'] as const).map((key) => (
            <div key={key}>
              <label className="label">{key}</label>
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

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-amber-200/90">异常分支</h3>
          <select
            className="input w-auto text-xs"
            defaultValue=""
            onChange={(e) => {
              addException(e.target.value);
              e.target.value = '';
            }}
          >
            <option value="">+ 添加异常</option>
            {excNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <ul className="space-y-1">
          {exceptions.map((name, i) => (
            <li
              key={`${name}-${i}`}
              className="flex items-center justify-between rounded-lg border border-amber-900/30 bg-amber-950/20 px-2 py-1.5 text-sm"
            >
              <span>{name}</span>
              <button
                type="button"
                className="text-[#9aa3b2] hover:text-red-300"
                onClick={() => updateExceptions(exceptions.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
