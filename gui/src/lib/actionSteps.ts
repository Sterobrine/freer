export type ActionPlatform = 'windows' | 'mac' | 'adb';

export type WindowsStepOp =
  | 'click'
  | 'pointer_down'
  | 'pointer_up'
  | 'pointer_move'
  | 'drag'
  | 'wait'
  | 'key'
  | 'text';

export type AdbStepOp = 'tap' | 'swipe' | 'wait' | 'key' | 'text';

export type MacStepOp = WindowsStepOp;

export type ActionStepOp = WindowsStepOp | AdbStepOp;

export type ActionStep = {
  op: ActionStepOp;
  pos?: number;
  button?: 'left' | 'right' | 'middle';
  from_pos?: number;
  to_pos?: number;
  offset?: [number, number];
  duration?: number;
  seconds?: number;
  value?: string;
  gap?: [number, number];
};

export const PLATFORM_LABELS: Record<ActionPlatform, string> = {
  windows: 'Windows',
  mac: 'macOS',
  adb: 'ADB',
};

export const PLATFORM_OPS: Record<ActionPlatform, ActionStepOp[]> = {
  windows: ['click', 'pointer_down', 'pointer_up', 'pointer_move', 'drag', 'wait', 'key', 'text'],
  mac: ['click', 'pointer_down', 'pointer_up', 'pointer_move', 'drag', 'wait', 'key', 'text'],
  adb: ['tap', 'swipe', 'wait', 'key', 'text'],
};

export const STEP_LABELS: Record<ActionStepOp, string> = {
  click: '点击',
  pointer_down: '按下',
  pointer_up: '抬起',
  pointer_move: '移动',
  drag: '拖拽',
  tap: '点击',
  swipe: '滑动',
  wait: '等待',
  key: '按键',
  text: '输入文字',
};

export const CLICK_BUTTON_LABELS: Record<'left' | 'right' | 'middle', string> = {
  left: '左键',
  right: '右键',
  middle: '中键',
};

export const PLATFORM_PRESETS: Record<ActionPlatform, { label: string; steps: ActionStep[] }[]> = {
  windows: [
    { label: '单击', steps: [{ op: 'click', pos: 0, button: 'left' }] },
    {
      label: '双击',
      steps: [
        { op: 'click', pos: 0 },
        { op: 'wait', seconds: 0.05 },
        { op: 'click', pos: 0 },
      ],
    },
    { label: '长按 1 秒', steps: [{ op: 'drag', from_pos: 0, to_pos: 0, duration: 1 }] },
    { label: '拖拽', steps: [{ op: 'drag', from_pos: 0, to_pos: 1, duration: 1 }] },
  ],
  mac: [
    { label: '单击', steps: [{ op: 'click', pos: 0, button: 'left' }] },
    { label: '拖拽', steps: [{ op: 'drag', from_pos: 0, to_pos: 1, duration: 1 }] },
  ],
  adb: [
    { label: '单击', steps: [{ op: 'tap', pos: 0 }] },
    { label: '长按 1 秒', steps: [{ op: 'swipe', from_pos: 0, to_pos: 0, duration: 1 }] },
    { label: '向上滑动', steps: [{ op: 'swipe', from_pos: 0, offset: [0, -300], duration: 0.3 }] },
    { label: '返回键', steps: [{ op: 'key', value: 'KEYCODE_BACK' }] },
  ],
};

export function emptyStep(platform: ActionPlatform, op?: ActionStepOp): ActionStep {
  const defaultOp = op ?? PLATFORM_OPS[platform][0];
  switch (defaultOp) {
    case 'click':
    case 'tap':
      return { op: defaultOp, pos: 0, button: 'left' };
    case 'pointer_down':
    case 'pointer_up':
      return { op: defaultOp, pos: 0, button: 'left' };
    case 'pointer_move':
      return { op: defaultOp, pos: 0 };
    case 'drag':
    case 'swipe':
      return { op: defaultOp, from_pos: 0, to_pos: 1, duration: 1 };
    case 'wait':
      return { op: 'wait', seconds: 1 };
    case 'key':
      return { op: 'key', value: '' };
    case 'text':
      return { op: 'text', value: '' };
    default:
      return { op: PLATFORM_OPS[platform][0] };
  }
}

export function summarizeSteps(
  steps: ActionStep[] | undefined | null,
  platform: ActionPlatform = 'windows',
): string {
  const list = steps ?? [];
  if (list.length === 0) return `（空）`;
  const parts = list.map((s) => STEP_LABELS[s.op] ?? s.op);
  const body = parts.length <= 3
    ? parts.join(' → ')
    : `${parts[0]} → … → ${parts[parts.length - 1]} (${parts.length} 步)`;
  const label = PLATFORM_LABELS[platform] ?? platform;
  return `[${label}] ${body}`;
}

/** Migrate legacy action_type payloads to platform + steps for UI/runtime. */
export function legacyActionToSteps(action: {
  action_type?: number;
  wait_time?: number | null;
  duration?: number | null;
  text?: string;
}): ActionStep[] {
  switch (action.action_type) {
    case 1:
      return [{ op: 'click', pos: 0 }];
    case 2:
      return [{ op: 'click', pos: 0, button: 'right' }];
    case 3:
      return [{ op: 'drag', from_pos: 0, to_pos: 1, duration: action.duration ?? 1 }];
    case 4:
      return [{ op: 'wait', seconds: action.wait_time ?? 1 }];
    case 5:
      return [{ op: 'text', value: action.text ?? '' }];
    case 6:
      return [
        { op: 'click', pos: 0 },
        { op: 'wait', seconds: 0.05 },
        { op: 'click', pos: 0 },
      ];
    case 7:
      return [{ op: 'click', pos: 0, button: 'middle' }];
    case 8: {
      const notches = action.duration ?? 1;
      return [{ op: 'drag', from_pos: 0, offset: [0, -40 * notches], duration: 0.3 }];
    }
    case 9:
      return [{ op: 'key', value: action.text ?? '' }];
    case 10:
      return [{ op: 'drag', from_pos: 0, to_pos: 0, duration: action.duration ?? 1 }];
    default:
      return [{ op: 'click', pos: 0 }];
  }
}

export type FreerActionLike = {
  name: string;
  id?: number;
  platform?: ActionPlatform;
  run_time?: number;
  gap?: [number, number];
  steps?: ActionStep[];
  action_type?: number;
  wait_time?: number | null;
  duration?: number | null;
  text?: string;
};

export function normalizeFreerAction(action: FreerActionLike): FreerActionLike & {
  platform: ActionPlatform;
  run_time: number;
  steps: ActionStep[];
} {
  const platform = action.platform ?? 'windows';
  const steps = action.steps?.length
    ? action.steps
    : action.action_type != null
      ? legacyActionToSteps(action)
      : [{ op: 'click' as const, pos: 0 }];
  return {
    ...action,
    platform,
    run_time: action.run_time ?? 1,
    steps,
  };
}

export function stepUsesOffset(step: ActionStep): boolean {
  return (step.op === 'drag' || step.op === 'swipe') && step.offset != null;
}

export function isGestureOp(op: ActionStepOp): boolean {
  return op === 'drag' || op === 'swipe';
}

export function isPointerOp(op: ActionStepOp): boolean {
  return op === 'click' || op === 'tap' || op === 'pointer_down' || op === 'pointer_up' || op === 'pointer_move';
}
