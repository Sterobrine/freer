import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ApiResult, HealthPayload, ProjectSummary } from '../api/types';
import { queryKeys } from '../lib/queryKeys';

export function useHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: api.health,
    staleTime: 10_000,
  });
}

export function parseHealth(result: ApiResult<HealthPayload> | undefined): HealthPayload | null {
  if (!result?.ok) return null;
  return result.data;
}

export function useActiveProjectId(): string {
  const health = useHealthQuery();
  const payload = parseHealth(health.data);
  return payload?.active_project ?? 'default';
}

export function useActiveProject(projects: ProjectSummary[] = []) {
  const health = useHealthQuery();
  const payload = parseHealth(health.data);
  const activeId = payload?.active_project ?? projects[0]?.id ?? 'default';
  const active = projects.find((p) => p.id === activeId);

  return {
    health,
    payload,
    activeId,
    active,
    isReady: Boolean(payload),
  };
}
