import type { FreerAction, FreerEvent } from '../api/types';
import type { ActionStep } from './actionSteps';

const POINTER_OPS = new Set([
  'click', 'pointer_down', 'pointer_up', 'pointer_move', 'drag', 'tap', 'swipe',
]);

const WINDOW_PLATFORMS = new Set(['windows', 'mac']);

export type ContractWarning = { code: string; message: string };

function countDefaultPositionSlots(defaultPosition: number[][]): number {
  let count = 0;
  let i = 0;
  while (i < defaultPosition.length) {
    const p1 = defaultPosition[i];
    const p2 = defaultPosition[i + 1];
    if (Array.isArray(p1) && Array.isArray(p2)) {
      count += 1;
      i += 2;
    } else if (i + 3 < defaultPosition.length) {
      count += 1;
      i += 4;
    } else {
      break;
    }
  }
  return count;
}

/** Mirror action_steps.event_position_slots */
export function eventPositionSlots(event: FreerEvent): number | null {
  if (event.default_position?.length) {
    const slots = countDefaultPositionSlots(event.default_position);
    return slots > 0 ? slots : null;
  }
  const symbolStart = event.symbol_start;
  if (symbolStart == null || symbolStart === '') return null;
  if (typeof symbolStart === 'object') return 1;
  const parts = symbolStart.trim().split('|').map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts.length : null;
}

/** Mirror action_steps.steps_position_demand */
export function stepsPositionDemand(steps: ActionStep[] | undefined | null): { needsPosition: boolean; maxIndex: number } {
  let needsPosition = false;
  let maxIndex = -1;
  for (const step of steps ?? []) {
    const op = step.op;
    if (op === 'click' || op === 'pointer_down' || op === 'pointer_up' || op === 'pointer_move' || op === 'tap') {
      needsPosition = true;
      maxIndex = Math.max(maxIndex, step.pos ?? 0);
    } else if (op === 'drag' || op === 'swipe') {
      needsPosition = true;
      const fromPos = step.from_pos ?? 0;
      maxIndex = Math.max(maxIndex, fromPos);
      if (step.offset == null) {
        const toPos = step.to_pos ?? fromPos + 1;
        maxIndex = Math.max(maxIndex, toPos);
      }
    }
  }
  return { needsPosition, maxIndex };
}

export function stepsNeedWindow(steps: ActionStep[] | undefined | null): boolean {
  return (steps ?? []).some((s) => POINTER_OPS.has(s.op));
}

/** Client-side mirror of freer_api.validate._validate_action_event_contract */
export function getActionContractWarnings(event: FreerEvent, action: FreerAction): ContractWarning[] {
  const warnings: ContractWarning[] = [];
  const actionName = action.name;
  const platform = action.platform ?? 'windows';
  const steps = action.steps ?? [];

  const { needsPosition, maxIndex } = stepsPositionDemand(steps);
  const slots = eventPositionSlots(event);

  if (needsPosition) {
    if (slots == null) {
      warnings.push({
        code: 'no_position_source',
        message: `动作「${actionName}」需要坐标，但未配置起始标志或默认坐标`,
      });
    } else if (maxIndex >= slots) {
      warnings.push({
        code: 'insufficient_position_slots',
        message: `动作需要位置索引 0–${maxIndex}，当前事件仅提供 ${slots} 个（0–${slots - 1}）`,
      });
    }
  }

  const windowName = (event.window_name ?? '').trim();
  if (WINDOW_PLATFORMS.has(platform) && stepsNeedWindow(steps) && !windowName) {
    warnings.push({
      code: 'missing_window_for_action',
      message: `${platform} 指针动作需要配置窗口名（Win32 窗口消息）`,
    });
  }
  if (platform === 'adb' && windowName) {
    warnings.push({
      code: 'adb_action_with_window',
      message: 'ADB 动作通常无需窗口名（将忽略窗口句柄）',
    });
  }

  return warnings;
}

export function requiredPositionCount(steps: ActionStep[] | undefined | null): number | null {
  const { needsPosition, maxIndex } = stepsPositionDemand(steps);
  if (!needsPosition) return null;
  return maxIndex + 1;
}
