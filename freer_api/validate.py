from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from freer_api.store import ActionStore, EventStore
from recognition.types import MATCH_TYPES

import paths


def _event_index() -> Dict[str, Dict[str, Any]]:
    return {item['name']: item for item in EventStore.list_events()}


def _action_names() -> Set[str]:
    return {item['name'] for item in ActionStore.list_actions()}


def _child_ref(entry: Any) -> Optional[str]:
    if isinstance(entry, dict):
        return entry.get('event')
    if isinstance(entry, str):
        return entry
    return None


def _collect_refs(event: Dict[str, Any]) -> List[Tuple[str, str]]:
    refs: List[Tuple[str, str]] = []
    for entry in event.get('event_list', []):
        name = _child_ref(entry)
        if name:
            refs.append(('child', name))
    for name in event.get('exception_list', []):
        if name:
            refs.append(('exception', str(name)))
    return refs


def _validate_roi(roi: Any, field: str) -> List[Dict[str, str]]:
    issues: List[Dict[str, str]] = []
    if roi is None:
        return issues
    if not isinstance(roi, list) or len(roi) != 4:
        issues.append({'code': 'invalid_roi', 'message': f'{field} 须为 [x1,y1,x2,y2]'})
        return issues
    try:
        x1, y1, x2, y2 = (int(v) for v in roi)
    except (TypeError, ValueError):
        issues.append({'code': 'invalid_roi', 'message': f'{field} 坐标须为整数'})
        return issues
    if x1 >= x2 or y1 >= y2:
        issues.append({'code': 'invalid_roi', 'message': f'{field} 须满足 x1<x2 且 y1<y2'})
    return issues


def _validate_symbol(value: Any, field: str, event: Dict[str, Any], kind: str) -> List[Dict[str, str]]:
    issues: List[Dict[str, str]] = []
    match_type = event.get(f'match_type_{kind}')
    if isinstance(value, dict):
        match_type = value.get('type', match_type or 'template')
        roi = value.get('roi')
        issues.extend(_validate_roi(roi, f'{field}.roi'))
    else:
        roi = event.get(f'roi_{kind}')
        issues.extend(_validate_roi(roi, f'roi_{kind}'))
    if match_type and match_type not in MATCH_TYPES:
        issues.append({
            'code': 'invalid_match_type',
            'message': f'{field} match_type 无效: {match_type}',
        })
    return issues


def _detect_cycle(root: str, index: Dict[str, Dict[str, Any]]) -> Optional[List[str]]:
    path: List[str] = []
    visiting: Set[str] = set()
    visited: Set[str] = set()

    def dfs(name: str) -> Optional[List[str]]:
        if name in visiting:
            start = path.index(name)
            return path[start:] + [name]
        if name in visited:
            return None
        event = index.get(name)
        if event is None or event.get('event_type') != 0:
            visited.add(name)
            return None
        visiting.add(name)
        path.append(name)
        for role, ref in _collect_refs(event):
            cycle = dfs(ref)
            if cycle:
                return cycle
        path.pop()
        visiting.remove(name)
        visited.add(name)
        return None

    return dfs(root)


def validate_event(
    event: Dict[str, Any],
    *,
    check_assets: bool = True,
    index: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    issues: List[Dict[str, str]] = []
    warnings: List[Dict[str, str]] = []
    if index is None:
        index = _event_index()
    actions = _action_names()
    name = event.get('name', '')

    if not name:
        issues.append({'code': 'missing_name', 'message': '事件名不能为空'})

    event_type = event.get('event_type', 1)
    if event_type == 1:
        action = event.get('action')
        if not action:
            issues.append({'code': 'missing_action', 'message': f'微事件 "{name}" 未绑定动作'})
        elif action not in actions:
            issues.append({'code': 'missing_action_ref', 'message': f'动作不存在: {action}'})
        issues.extend(_validate_symbol(event.get('symbol_start'), 'symbol_start', event, 'start'))
        issues.extend(_validate_symbol(event.get('symbol_finish'), 'symbol_finish', event, 'finish'))
    else:
        for role, ref in _collect_refs(event):
            if ref not in index:
                issues.append({
                    'code': 'missing_event_ref',
                    'message': f'{role} 引用不存在: {ref}',
                })

    if name:
        cycle = _detect_cycle(name, index)
        if cycle:
            issues.append({
                'code': 'cycle_detected',
                'message': '检测到环: ' + ' → '.join(cycle),
            })

    if check_assets and event_type == 1:
        for sym_field in ('symbol_start', 'symbol_finish'):
            sym = event.get(sym_field)
            if isinstance(sym, str) and sym and '|' not in sym and not sym.startswith('#'):
                for part in sym.split('|'):
                    p = Path(part) if Path(part).is_absolute() else paths.PROJECT_ROOT / part
                    if not p.exists():
                        warnings.append({
                            'code': 'missing_template',
                            'message': f'{sym_field} 模板不存在: {part}',
                        })

    return {
        'valid': len(issues) == 0,
        'issues': issues,
        'warnings': warnings,
    }


def validate_events(
    events: Optional[List[Dict[str, Any]]] = None,
    *,
    check_assets: bool = True,
) -> Dict[str, Any]:
    items = events if events is not None else EventStore.list_events()
    index = _event_index()
    for event in items:
        if event.get('name'):
            index[event['name']] = event
    results = []
    all_valid = True
    for event in items:
        result = validate_event(event, check_assets=check_assets, index=index)
        results.append({'name': event.get('name'), **result})
        if not result['valid']:
            all_valid = False
    return {'valid': all_valid, 'events': results}
