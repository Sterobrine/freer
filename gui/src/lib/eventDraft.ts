import type { FreerEvent } from '../api/types';

export function isEventDraftDirty(
  draft: FreerEvent | null,
  selectedName: string | null,
  isNew: boolean,
  events: FreerEvent[],
): boolean {
  if (!draft) return false;
  if (isNew) return true;
  const server = events.find((e) => e.name === selectedName);
  if (!server) return true;
  return JSON.stringify(draft) !== JSON.stringify(server);
}

export function confirmDiscardDraft(): boolean {
  return window.confirm('当前事件有未保存的修改，确定放弃吗？');
}

export function findEventReferrers(events: FreerEvent[], target: string): string[] {
  const refs = new Set<string>();
  for (const event of events) {
    if (event.event_type !== 0) continue;
    for (const entry of event.event_list ?? []) {
      const name = typeof entry === 'string' ? entry : entry.event;
      if (name === target) refs.add(event.name);
    }
    for (const name of event.exception_list ?? []) {
      if (name === target) refs.add(event.name);
    }
  }
  return [...refs];
}

export function findActionReferrers(events: FreerEvent[], actionName: string): string[] {
  return events
    .filter((e) => e.event_type === 1 && e.action === actionName)
    .map((e) => e.name);
}

export function formatValidationWarnings(
  warnings: Array<{ code: string; message: string }>,
): string {
  if (!warnings.length) return '';
  return warnings.map((w) => w.message).join('；');
}
