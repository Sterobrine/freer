from typing import Any, Dict, List, Optional

from freer_api.store import EventStore


def _child_meta(entry: Any) -> Dict[str, Any]:
    if isinstance(entry, dict):
        return {
            'name': entry.get('event'),
            'should_run_time': entry.get('should_run_time', 0),
            'max_run_time': entry.get('max_run_time', 1),
            'priority': entry.get('priority', 0),
        }
    return {'name': str(entry), 'should_run_time': 0, 'max_run_time': 1, 'priority': 0}


def build_event_tree(
    name: str,
    *,
    depth: int = 0,
    max_depth: int = 20,
    _visited: Optional[set] = None,
) -> Dict[str, Any]:
    if _visited is None:
        _visited = set()
    event = EventStore.get_by_name(name)
    if event is None:
        raise KeyError(f'未找到事件: {name}')

    node: Dict[str, Any] = {
        'name': name,
        'event_type': event.get('event_type', 1),
        'is_exception': bool(event.get('is_exception', False)),
        'id': event.get('id'),
    }

    if event.get('event_type', 1) != 0:
        node['action'] = event.get('action')
        return node

    if depth >= max_depth or name in _visited:
        node['truncated'] = True
        return node

    _visited.add(name)
    node['children'] = []
    for entry in event.get('event_list', []):
        meta = _child_meta(entry)
        child_name = meta.pop('name')
        if not child_name:
            continue
        child_node = build_event_tree(
            child_name, depth=depth + 1, max_depth=max_depth, _visited=set(_visited),
        )
        child_node['role'] = 'child'
        child_node.update(meta)
        node['children'].append(child_node)

    node['exceptions'] = []
    for exc_name in event.get('exception_list', []):
        if not exc_name:
            continue
        exc_node = build_event_tree(
            str(exc_name), depth=depth + 1, max_depth=max_depth, _visited=set(_visited),
        )
        exc_node['role'] = 'exception'
        node['exceptions'].append(exc_node)

    return node
