import { z } from 'zod';

export const MATCH_TYPES = ['template', 'feature', 'ocr', 'ui', 'color'] as const;
export const LAST_RESORTS = ['none', 'default_position', 'last_known', 'expand_roi', 'pause'] as const;

export const childEntrySchema = z.object({
  event: z.string().min(1, '须选择子事件'),
  should_run_time: z.coerce.number().int().min(0),
  max_run_time: z.coerce.number().int().min(1),
  priority: z.coerce.number().int().optional(),
});

export const microEventSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  event_type: z.literal(1),
  window_name: z.string().optional(),
  action: z.string().min(1, '须绑定动作'),
  symbol_start: z.string().nullable().optional(),
  symbol_finish: z.string().nullable().optional(),
  accuracy: z.coerce.number().min(0).max(1).optional(),
  max_suc_run_time: z.coerce.number().int().min(1).optional(),
  is_exception: z.boolean().optional(),
  gap: z.tuple([z.coerce.number(), z.coerce.number()]).optional(),
  match_type_start: z.string().optional(),
  match_type_finish: z.string().optional(),
  roi_start: z.string().optional(),
  roi_finish: z.string().optional(),
  match_fallback_start: z.string().optional(),
  match_fallback_finish: z.string().optional(),
  last_resort_start: z.string().optional(),
  last_resort_finish: z.string().optional(),
});

export const grandEventSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  event_type: z.literal(0),
  window_name: z.string().optional(),
  max_rotate_time: z.coerce.number().int().min(1).optional(),
  is_exception: z.boolean().optional(),
  event_list: z.array(childEntrySchema).optional(),
  exception_list: z.array(z.string()).optional(),
});

export const actionSchema = z.object({
  name: z.string().min(1),
  action_type: z.coerce.number().int(),
  run_time: z.coerce.number().int().min(1),
  wait_time: z.coerce.number().nullable().optional(),
  duration: z.coerce.number().nullable().optional(),
  gap: z.tuple([z.coerce.number(), z.coerce.number()]).optional(),
  text: z.string().optional(),
});

export function parseRoi(text: string): number[] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(/[,\s]+/).map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return undefined;
  return parts;
}

export function formatRoi(roi?: number[]): string {
  return roi?.join(', ') ?? '';
}
