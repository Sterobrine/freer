from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional, Set

MICRO_EVENT_FIELDS: Set[str] = {
    'name', 'window_name', 'symbol_start', 'symbol_finish', 'accuracy',
    'max_suc_run_time', 'event_type', 'is_exception', 'default_position',
    'action', 'gap', 'id',
    'match_type_start', 'match_type_finish', 'roi_start', 'roi_finish',
    'match_fallback_start', 'match_fallback_finish', 'last_resort_start',
    'last_resort_finish', 'index_start', 'index_finish',
}

GRAND_EVENT_FIELDS: Set[str] = MICRO_EVENT_FIELDS | {
    'event_list', 'exception_list', 'max_rotate_time',
}

ACTION_FIELDS: Set[str] = {
    'name', 'id', 'action_type', 'run_time', 'wait_time', 'duration', 'gap', 'text',
}

CHILD_ENTRY_FIELDS: Set[str] = {
    'event', 'should_run_time', 'max_run_time', 'priority',
}

RUNTIME_STRIP: Set[str] = {
    'hwnd', 'has_run_time', 'has_rotate_time', 'run_time', 'inactive_list',
    'pre_cursor', 'tmp_position', 'stack', 'cursor',
}


def _pick_fields(data: Dict[str, Any], allowed: Set[str]) -> Dict[str, Any]:
    return {key: data[key] for key in data if key in allowed}


def sanitize_child_entry(entry: Any) -> Any:
    if isinstance(entry, dict):
        cleaned = _pick_fields(entry, CHILD_ENTRY_FIELDS)
        cleaned['has_run_time'] = 0
        return cleaned
    return entry


def sanitize_event_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    event_type = data.get('event_type', 1)
    allowed = GRAND_EVENT_FIELDS if event_type == 0 else MICRO_EVENT_FIELDS
    cleaned = _pick_fields(data, allowed)
    for key in RUNTIME_STRIP:
        cleaned.pop(key, None)
    if event_type == 0:
        cleaned['event_list'] = [
            sanitize_child_entry(item) for item in data.get('event_list', [])
        ]
        cleaned['exception_list'] = list(data.get('exception_list', []))
        if cleaned.get('symbol_start') and '|' in str(cleaned['symbol_start']):
            cleaned['symbol_start'] = None
    return cleaned


def sanitize_action_dict(data: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = _pick_fields(data, ACTION_FIELDS)
    for key in RUNTIME_STRIP:
        cleaned.pop(key, None)
    return cleaned


def serialize_object(obj: Any, allowed_fields: Set[str]) -> Dict[str, Any]:
    if hasattr(obj, '__dict__'):
        return sanitize_event_dict(_pick_fields(obj.__dict__, allowed_fields | set(obj.__dict__.keys())))
    if isinstance(obj, dict):
        return sanitize_event_dict(obj) if 'event_type' in obj else sanitize_action_dict(obj)
    raise TypeError(f'Unsupported object type: {type(obj)}')
