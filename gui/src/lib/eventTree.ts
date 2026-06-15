import type { ChildEntry, FreerEvent, TreeNode } from '../api/types';

function childMeta(entry: ChildEntry | string): Omit<ChildEntry, 'event'> & { name: string } {
  if (typeof entry === 'string') {
    return { name: entry, should_run_time: 0, max_run_time: 1, priority: 0 };
  }
  return {
    name: entry.event,
    should_run_time: entry.should_run_time ?? 0,
    max_run_time: entry.max_run_time ?? 1,
    priority: entry.priority ?? 0,
  };
}

export function buildEventTreeClient(
  name: string,
  eventsByName: Map<string, FreerEvent>,
  options?: {
    rootDraft?: FreerEvent;
    depth?: number;
    maxDepth?: number;
    visited?: Set<string>;
  },
): TreeNode {
  const depth = options?.depth ?? 0;
  const maxDepth = options?.maxDepth ?? 20;
  const visited = options?.visited ?? new Set<string>();
  const rootDraft = options?.rootDraft;

  const event =
    rootDraft?.name === name ? rootDraft : eventsByName.get(name);

  if (!event) {
    return {
      name,
      event_type: 1,
      is_exception: false,
      truncated: true,
      role: 'child',
    };
  }

  const node: TreeNode = {
    name,
    event_type: event.event_type,
    is_exception: Boolean(event.is_exception),
  };

  if (event.event_type !== 0) {
    node.action = event.action;
    return node;
  }

  if (depth >= maxDepth || visited.has(name)) {
    node.truncated = true;
    return node;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(name);

  node.children = (event.event_list ?? []).map((entry) => {
    const meta = childMeta(entry);
    const child = buildEventTreeClient(meta.name, eventsByName, {
      depth: depth + 1,
      maxDepth,
      visited: nextVisited,
    });
    return {
      ...child,
      role: 'child' as const,
      should_run_time: meta.should_run_time,
      max_run_time: meta.max_run_time,
      priority: meta.priority,
    };
  });

  node.exceptions = (event.exception_list ?? []).map((excName) => {
    const child = buildEventTreeClient(excName, eventsByName, {
      depth: depth + 1,
      maxDepth,
      visited: nextVisited,
    });
    return { ...child, role: 'exception' as const };
  });

  return node;
}
