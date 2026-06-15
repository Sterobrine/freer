import io
import json
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import paths
from freer_api.store import ActionStore, EventStore
from serialization import sanitize_action_dict, sanitize_event_dict


def _collect_template_paths(events: List[Dict[str, Any]]) -> Set[str]:
    templates: Set[str] = set()

    def add_symbol(value: Any) -> None:
        if isinstance(value, str) and value:
            for part in value.split('|'):
                part = part.strip()
                if part and not part.startswith('#') and part.endswith('.bmp'):
                    templates.add(part)

    for event in events:
        add_symbol(event.get('symbol_start'))
        add_symbol(event.get('symbol_finish'))
        if isinstance(event.get('symbol_start'), dict):
            add_symbol(event['symbol_start'].get('target'))
        if isinstance(event.get('symbol_finish'), dict):
            add_symbol(event['symbol_finish'].get('target'))
    return templates


def _resolve_asset_path(rel: str) -> Optional[Path]:
    candidates = [
        paths.PROJECT_ROOT / rel,
        paths.IMG_DIR / Path(rel).name,
        Path(rel),
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def export_package(
    *,
    event_names: Optional[List[str]] = None,
    include_actions: bool = True,
) -> bytes:
    all_events = EventStore.list_events()
    if event_names:
        name_set = set(event_names)
        events = [e for e in all_events if e.get('name') in name_set]
    else:
        events = all_events

    actions = ActionStore.list_actions() if include_actions else []
    templates = _collect_template_paths(events)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            'format': 'freer-export',
            'version': 1,
            'event_count': len(events),
            'action_count': len(actions),
        }
        zf.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr('events.json', json.dumps(events, ensure_ascii=False, indent=2))
        if include_actions:
            zf.writestr('actions.json', json.dumps(actions, ensure_ascii=False, indent=2))

        for rel in sorted(templates):
            asset = _resolve_asset_path(rel)
            if asset is None:
                continue
            arcname = 'img/' + asset.name
            zf.write(asset, arcname)
    return buf.getvalue()


def import_package(
    data: bytes,
    *,
    mode: str = 'merge',
) -> Dict[str, Any]:
    if mode not in ('merge', 'replace'):
        raise ValueError('mode 须为 merge 或 replace')

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        if 'events.json' not in zf.namelist():
            raise ValueError('无效的导出包：缺少 events.json')

        imported_events = json.loads(zf.read('events.json').decode('utf-8'))
        imported_actions: List[Dict[str, Any]] = []
        if 'actions.json' in zf.namelist():
            imported_actions = json.loads(zf.read('actions.json').decode('utf-8'))

        for name in zf.namelist():
            if name.startswith('img/') and not name.endswith('/'):
                dest = paths.IMG_DIR / Path(name).name
                paths.IMG_DIR.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(zf.read(name))

    cleaned_events = [sanitize_event_dict(e) for e in imported_events]
    cleaned_actions = [sanitize_action_dict(a) for a in imported_actions]

    if mode == 'replace':
        EventStore.write_events(cleaned_events)
        if cleaned_actions:
            ActionStore.write_actions(cleaned_actions)
    else:
        existing_events = {e['name']: e for e in EventStore.list_events()}
        for event in cleaned_events:
            existing_events[event['name']] = event
        EventStore.write_events(list(existing_events.values()))

        if cleaned_actions:
            existing_actions = {a['name']: a for a in ActionStore.list_actions()}
            for action in cleaned_actions:
                existing_actions[action['name']] = action
            ActionStore.write_actions(list(existing_actions.values()))

    return {
        'imported_events': len(cleaned_events),
        'imported_actions': len(cleaned_actions),
        'mode': mode,
    }
