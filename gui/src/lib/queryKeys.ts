import type { QueryClient } from '@tanstack/react-query';

export const queryKeys = {
  health: () => ['health'] as const,
  projects: () => ['projects'] as const,
  events: (projectId: string) => ['events', projectId] as const,
  actions: (projectId: string) => ['actions', projectId] as const,
  templates: (projectId: string) => ['templates', projectId] as const,
  config: (projectId: string) => ['config', projectId] as const,
  taskStatus: (projectId: string) => ['taskStatus', projectId] as const,
};

const PROJECT_DATA_ROOTS = new Set(['events', 'actions', 'templates', 'config', 'taskStatus']);

/** Drop cached project data so the next fetch uses the newly activated project. */
export function clearProjectWorkspaceCache(qc: QueryClient) {
  qc.removeQueries({
    predicate: (q) => typeof q.queryKey[0] === 'string' && PROJECT_DATA_ROOTS.has(q.queryKey[0]),
  });
}
