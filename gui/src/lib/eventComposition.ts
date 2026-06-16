import type { ChildEntry, FreerEvent } from '../api/types';

export const EVENT_DRAG_MIME = 'application/x-freer-event';

export function readDraggedEventName(dataTransfer: DataTransfer): string | null {
  const name = dataTransfer.getData(EVENT_DRAG_MIME);
  return name.trim() || null;
}

export function defaultChildEntry(name: string): ChildEntry {
  return { event: name, should_run_time: 0, max_run_time: 1, priority: 0 };
}

export function mergeEventIndex(
  allEvents: FreerEvent[],
  rootDraft?: FreerEvent,
  patches?: Map<string, FreerEvent>,
): Map<string, FreerEvent> {
  const index = new Map(allEvents.map((e) => [e.name, e]));
  if (rootDraft?.name) index.set(rootDraft.name, rootDraft);
  patches?.forEach((event, name) => index.set(name, event));
  return index;
}

function childRefName(entry: ChildEntry | string): string | null {
  if (typeof entry === 'string') return entry;
  return entry.event || null;
}

function collectRefs(event: FreerEvent): { role: 'child' | 'exception'; name: string }[] {
  const refs: { role: 'child' | 'exception'; name: string }[] = [];
  for (const entry of event.event_list ?? []) {
    const name = childRefName(entry);
    if (name) refs.push({ role: 'child', name });
  }
  for (const name of event.exception_list ?? []) {
    if (name) refs.push({ role: 'exception', name });
  }
  return refs;
}

/** 与 freer_api/validate.py _detect_cycle 一致，返回环路径（含重复闭合节点） */
export function detectCycle(root: string, index: Map<string, FreerEvent>): string[] | null {
  const path: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (name: string): string[] | null => {
    if (visiting.has(name)) {
      const start = path.indexOf(name);
      return [...path.slice(start), name];
    }
    if (visited.has(name)) return null;

    const event = index.get(name);
    if (!event || event.event_type !== 0) {
      visited.add(name);
      return null;
    }

    visiting.add(name);
    path.push(name);

    for (const { name: ref } of collectRefs(event)) {
      const cycle = dfs(ref);
      if (cycle) return cycle;
    }

    path.pop();
    visiting.delete(name);
    visited.add(name);
    return null;
  };

  return dfs(root);
}

export function cycleNodeSet(cycle: string[] | null): Set<string> {
  if (!cycle) return new Set();
  return new Set(cycle.slice(0, -1));
}

export function isCycleEdge(
  fromName: string,
  toName: string,
  cycle: string[] | null,
): boolean {
  if (!cycle || cycle.length < 2) return false;
  for (let i = 0; i < cycle.length - 1; i += 1) {
    if (cycle[i] === fromName && cycle[i + 1] === toName) return true;
  }
  return false;
}

export type NodeRef = {
  parentPath: string;
  kind: 'child' | 'exception';
  index: number;
};

export function parseNodeRef(nodeId: string): NodeRef | null {
  if (nodeId === 'root') return null;
  const match = nodeId.match(/^(.*):([ce]):(\d+)$/);
  if (!match) return null;
  return {
    parentPath: match[1] || 'root',
    kind: match[2] === 'e' ? 'exception' : 'child',
    index: Number(match[3]),
  };
}

export function getEventAtPath(
  rootMacro: FreerEvent,
  index: Map<string, FreerEvent>,
  path: string,
): FreerEvent | null {
  if (path === 'root') return rootMacro;
  const ref = parseNodeRef(path);
  if (!ref) return null;

  const parent = getEventAtPath(rootMacro, index, ref.parentPath);
  if (!parent || parent.event_type !== 0) return null;

  let name: string | null | undefined;
  if (ref.kind === 'child') {
    const entry = parent.event_list?.[ref.index];
    name = entry != null ? childRefName(entry) : null;
  } else {
    name = parent.exception_list?.[ref.index];
  }
  return name ? index.get(name) ?? null : null;
}

export function getEventNameAtPath(
  rootMacro: FreerEvent,
  index: Map<string, FreerEvent>,
  path: string,
): string | null {
  return getEventAtPath(rootMacro, index, path)?.name ?? null;
}

function applyMacroUpdate(
  rootMacro: FreerEvent,
  index: Map<string, FreerEvent>,
  parentPath: string,
  updated: FreerEvent,
): { rootMacro: FreerEvent; patches: Map<string, FreerEvent> } {
  if (parentPath === 'root') {
    return { rootMacro: updated, patches: new Map() };
  }
  const parentName = getEventNameAtPath(rootMacro, index, parentPath);
  if (!parentName) return { rootMacro, patches: new Map() };
  return { rootMacro, patches: new Map([[parentName, updated]]) };
}

export function addCompositionRef(
  rootMacro: FreerEvent,
  index: Map<string, FreerEvent>,
  targetPath: string,
  eventName: string,
  kind: 'child' | 'exception',
): { rootMacro: FreerEvent; patches: Map<string, FreerEvent> } {
  const target =
    targetPath === 'root' ? rootMacro : getEventAtPath(rootMacro, index, targetPath);
  if (!target || target.event_type !== 0) {
    return { rootMacro, patches: new Map() };
  }

  const dragged = index.get(eventName);
  if (!dragged) return { rootMacro, patches: new Map() };

  if (kind === 'exception') {
    if (!dragged.is_exception) return { rootMacro, patches: new Map() };
    const list = [...(target.exception_list ?? [])];
    if (list.includes(eventName)) return { rootMacro, patches: new Map() };
    list.push(eventName);
    const updated = { ...target, exception_list: list };
    return applyMacroUpdate(rootMacro, index, targetPath, updated);
  }

  if (dragged.is_exception) return { rootMacro, patches: new Map() };
  const list = [...(target.event_list ?? [])];
  if (list.some((e) => childRefName(e) === eventName)) {
    return { rootMacro, patches: new Map() };
  }
  list.push(defaultChildEntry(eventName));
  const updated = { ...target, event_list: list };
  return applyMacroUpdate(rootMacro, index, targetPath, updated);
}

export function removeCompositionRef(
  rootMacro: FreerEvent,
  index: Map<string, FreerEvent>,
  nodeId: string,
): { rootMacro: FreerEvent; patches: Map<string, FreerEvent> } | null {
  const ref = parseNodeRef(nodeId);
  if (!ref) return null;

  const parent = getEventAtPath(rootMacro, index, ref.parentPath);
  if (!parent || parent.event_type !== 0) return null;

  const updated = { ...parent };
  if (ref.kind === 'child') {
    const list = [...(parent.event_list ?? [])];
    list.splice(ref.index, 1);
    updated.event_list = list;
  } else {
    const list = [...(parent.exception_list ?? [])];
    list.splice(ref.index, 1);
    updated.exception_list = list;
  }

  return applyMacroUpdate(rootMacro, index, ref.parentPath, updated);
}
