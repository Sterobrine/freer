"""Composable action steps with per-platform atomic operations."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

PLATFORMS = frozenset({'windows', 'mac', 'adb'})
DEFAULT_PLATFORM = 'windows'

PLATFORM_OPS: Dict[str, frozenset] = {
  # Win32 窗口消息：可拆分按下/移动/抬起
    'windows': frozenset({
        'click', 'pointer_down', 'pointer_up', 'pointer_move', 'drag',
        'wait', 'key', 'text',
    }),
    'mac': frozenset({
        'click', 'pointer_down', 'pointer_up', 'pointer_move', 'drag',
        'wait', 'key', 'text',
    }),
    # ADB input：只有成品手势 tap / swipe
    'adb': frozenset({'tap', 'swipe', 'wait', 'key', 'text'}),
}

CLICK_BUTTONS = frozenset({'left', 'right', 'middle'})

STEP_LABELS: Dict[str, str] = {
    'click': '点击',
    'pointer_down': '按下',
    'pointer_up': '抬起',
    'pointer_move': '移动',
    'drag': '拖拽',
    'tap': '点击',
    'swipe': '滑动',
    'wait': '等待',
    'key': '按键',
    'text': '输入',
}

PLATFORM_LABELS: Dict[str, str] = {
    'windows': 'Windows',
    'mac': 'macOS',
    'adb': 'ADB',
}

POINTER_OPS = frozenset({
    'click', 'pointer_down', 'pointer_up', 'pointer_move', 'drag', 'tap', 'swipe',
})

WINDOW_PLATFORM_OPS = frozenset({'windows', 'mac'})


def normalize_platform(value: Any) -> str:
    platform = str(value or DEFAULT_PLATFORM).lower()
    if platform not in PLATFORMS:
        raise ValueError(f'未知平台: {value}')
    return platform


def _legacy_to_steps(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    action_type = data.get('action_type')
    if action_type == 1:
        return [{'op': 'click', 'pos': 0}]
    if action_type == 2:
        return [{'op': 'click', 'pos': 0, 'button': 'right'}]
    if action_type == 3:
        return [{
            'op': 'drag',
            'from_pos': 0,
            'to_pos': 1,
            'duration': data.get('duration') if data.get('duration') is not None else 1.0,
        }]
    if action_type == 4:
        wait = data.get('wait_time')
        if wait is None:
            wait = 1.0
        return [{'op': 'wait', 'seconds': wait}]
    if action_type == 5:
        return [{'op': 'text', 'value': data.get('text') or ''}]
    if action_type == 6:
        return [
            {'op': 'click', 'pos': 0},
            {'op': 'wait', 'seconds': 0.05},
            {'op': 'click', 'pos': 0},
        ]
    if action_type == 7:
        return [{'op': 'click', 'pos': 0, 'button': 'middle'}]
    if action_type == 8:
        notches = data.get('duration') if data.get('duration') is not None else 1
        return [{'op': 'drag', 'from_pos': 0, 'offset': [0, int(-40 * notches)], 'duration': 0.3}]
    if action_type == 9:
        return [{'op': 'key', 'value': data.get('text') or ''}]
    if action_type == 10:
        return [{
            'op': 'drag',
            'from_pos': 0,
            'to_pos': 0,
            'duration': data.get('duration') if data.get('duration') is not None else 1.0,
        }]
    return [{'op': 'click', 'pos': 0}]


def _normalize_pointer_step(cleaned: Dict[str, Any], step: Dict[str, Any]) -> None:
    cleaned['pos'] = int(step.get('pos', 0))
    button = step.get('button', 'left')
    if button not in CLICK_BUTTONS:
        raise ValueError(f'无效鼠标按键: {button}')
    if button != 'left':
        cleaned['button'] = button


def _normalize_gesture_step(cleaned: Dict[str, Any], step: Dict[str, Any]) -> None:
    cleaned['from_pos'] = int(step.get('from_pos', 0))
    if 'offset' in step and step['offset'] is not None:
        offset = step['offset']
        if not isinstance(offset, list) or len(offset) != 2:
            raise ValueError('offset 须为 [dx, dy]')
        cleaned['offset'] = [int(offset[0]), int(offset[1])]
    else:
        cleaned['to_pos'] = int(step.get('to_pos', cleaned['from_pos'] + 1))
    duration = step.get('duration')
    cleaned['duration'] = float(duration if duration is not None else 1.0)


def normalize_step(step: Any, platform: str) -> Dict[str, Any]:
    if not isinstance(step, dict):
        raise ValueError('步骤须为对象')
    op = step.get('op')
    allowed = PLATFORM_OPS[platform]
    if op not in allowed:
        raise ValueError(f'平台 {platform} 不支持步骤类型: {op}')
    cleaned: Dict[str, Any] = {'op': op}

    if op in ('click', 'pointer_down', 'pointer_up', 'pointer_move', 'tap'):
        _normalize_pointer_step(cleaned, step)
    elif op in ('drag', 'swipe'):
        _normalize_gesture_step(cleaned, step)
    elif op == 'wait':
        seconds = step.get('seconds', 1.0)
        if isinstance(seconds, list):
            if len(seconds) != 2:
                raise ValueError('wait.seconds 区间须为 [min, max]')
            cleaned['seconds'] = [float(seconds[0]), float(seconds[1])]
        else:
            cleaned['seconds'] = float(seconds)
    elif op in ('key', 'text'):
        cleaned['value'] = str(step.get('value', ''))

    if step.get('gap') is not None:
        gap = step['gap']
        if not isinstance(gap, list) or len(gap) != 2:
            raise ValueError('gap 须为 [min, max]')
        cleaned['gap'] = [float(gap[0]), float(gap[1])]
    return cleaned


def normalize_steps(steps: Any, platform: str) -> List[Dict[str, Any]]:
    if not isinstance(steps, list) or len(steps) == 0:
        raise ValueError('动作至少包含一个步骤')
    return [normalize_step(s, platform) for s in steps]


def get_action_steps(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    platform = normalize_platform(data.get('platform', DEFAULT_PLATFORM))
    raw_steps = data.get('steps')
    if isinstance(raw_steps, list) and len(raw_steps) > 0:
        return normalize_steps(raw_steps, platform)
    if 'action_type' in data:
        return normalize_steps(_legacy_to_steps(data), platform)
    raise ValueError('动作缺少 steps 或 action_type')


def sanitize_action_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    platform = normalize_platform(data.get('platform', DEFAULT_PLATFORM))
    cleaned: Dict[str, Any] = {'platform': platform}
    name = data.get('name')
    if name:
        cleaned['name'] = name
    if data.get('id') is not None:
        cleaned['id'] = data['id']
    cleaned['run_time'] = int(data.get('run_time', 1))
    gap = data.get('gap')
    if gap is not None:
        cleaned['gap'] = [float(gap[0]), float(gap[1])]
    cleaned['steps'] = get_action_steps({**data, 'platform': platform})
    return cleaned


def summarize_steps(steps: List[Dict[str, Any]], platform: str = DEFAULT_PLATFORM) -> str:
    parts = [STEP_LABELS.get(s['op'], s['op']) for s in steps]
    if len(parts) <= 3:
        body = ' → '.join(parts)
    else:
        body = f"{parts[0]} → … → {parts[-1]} ({len(parts)} 步)"
    return f"[{PLATFORM_LABELS.get(platform, platform)}] {body}"


def steps_position_demand(steps: List[Dict[str, Any]]) -> Tuple[bool, int]:
    """Return (needs_position, max_index). max_index is -1 when no pointer step."""
    needs = False
    max_index = -1
    for step in steps:
        op = step.get('op')
        if op in ('click', 'pointer_down', 'pointer_up', 'pointer_move', 'tap'):
            needs = True
            max_index = max(max_index, int(step.get('pos', 0)))
        elif op in ('drag', 'swipe'):
            needs = True
            from_pos = int(step.get('from_pos', 0))
            max_index = max(max_index, from_pos)
            if step.get('offset') is None:
                to_pos = int(step.get('to_pos', from_pos + 1))
                max_index = max(max_index, to_pos)
    return needs, max_index


def _count_default_position_slots(default_position: Any) -> int:
    if not default_position or not isinstance(default_position, list):
        return 0
    count = 0
    i = 0
    while i < len(default_position):
        p1 = default_position[i]
        if i + 1 >= len(default_position):
            break
        p2 = default_position[i + 1]
        if isinstance(p1, (list, tuple)) and isinstance(p2, (list, tuple)):
            count += 1
            i += 2
        elif i + 3 < len(default_position):
            count += 1
            i += 4
        else:
            break
    return count


def event_position_slots(event: Dict[str, Any]) -> Optional[int]:
    """Number of position indices the event can supply; None if not inferable."""
    default_position = event.get('default_position')
    if default_position:
        slots = _count_default_position_slots(default_position)
        return slots if slots > 0 else None

    symbol_start = event.get('symbol_start')
    if symbol_start is None or symbol_start == '':
        return None
    if isinstance(symbol_start, dict):
        return 1
    if isinstance(symbol_start, str):
        stripped = symbol_start.strip()
        if not stripped:
            return None
        parts = [p for p in stripped.split('|') if p.strip()]
        return len(parts) if parts else None
    return None


def steps_need_window(steps: List[Dict[str, Any]]) -> bool:
    return any(step.get('op') in POINTER_OPS for step in steps)
