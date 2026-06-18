"""Workspace / multi-project management (Phase 5F)."""

from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import paths

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

WORKSPACE_PATH = paths.PROJECT_ROOT / 'workspace.yaml'
PROJECTS_ROOT = paths.PROJECT_ROOT / 'projects'


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def _read_workspace() -> Dict[str, Any]:
    if yaml is None or not WORKSPACE_PATH.exists():
        return {'active_project': 'default', 'projects': []}
    with open(WORKSPACE_PATH, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f) or {}
    if 'projects' not in data:
        data['projects'] = []
    if 'active_project' not in data:
        data['active_project'] = 'default'
    return data


def _write_workspace(data: Dict[str, Any]) -> None:
    if yaml is None:
        raise RuntimeError('PyYAML is required for workspace management')
    WORKSPACE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(WORKSPACE_PATH, 'w', encoding='utf-8') as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)


def _project_dir(project_id: str) -> Path:
    return PROJECTS_ROOT / project_id


def _project_meta_path(project_id: str) -> Path:
    return _project_dir(project_id) / 'project.yaml'


def _read_project_meta(project_id: str) -> Dict[str, Any]:
    path = _project_meta_path(project_id)
    if yaml is None or not path.exists():
        return {'id': project_id, 'name': project_id}
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f) or {'id': project_id, 'name': project_id}


def _write_project_meta(project_id: str, meta: Dict[str, Any]) -> None:
    if yaml is None:
        raise RuntimeError('PyYAML is required for workspace management')
    dest = _project_dir(project_id)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'img').mkdir(exist_ok=True)
    meta = dict(meta)
    meta['id'] = project_id
    with open(_project_meta_path(project_id), 'w', encoding='utf-8') as f:
        yaml.safe_dump(meta, f, allow_unicode=True, sort_keys=False)


def _empty_project_files(project_id: str) -> None:
    dest = _project_dir(project_id)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'img').mkdir(exist_ok=True)
    for name, default in (
        ('event.json', '[]'),
        ('action.json', '[]'),
        ('count.json', '{}'),
    ):
        path = dest / name
        if not path.exists():
            path.write_text(default, encoding='utf-8')


def migrate_legacy_data_if_needed() -> None:
    """One-time migration: data/ → projects/default/."""
    legacy_event = paths.PROJECT_ROOT / 'data' / 'event.json'
    default_dir = _project_dir('default')
    if default_dir.exists() and (default_dir / 'event.json').exists():
        return
    if not legacy_event.exists():
        _empty_project_files('default')
        _write_project_meta('default', {
            'id': 'default',
            'name': '主项目',
            'created_at': _now_iso(),
        })
        ws = _read_workspace()
        if not any(p.get('id') == 'default' for p in ws.get('projects', [])):
            ws['projects'].append({'id': 'default', 'name': '主项目'})
        ws['active_project'] = ws.get('active_project') or 'default'
        _write_workspace(ws)
        return

    default_dir.mkdir(parents=True, exist_ok=True)
    legacy_data = paths.PROJECT_ROOT / 'data'
    for name in ('event.json', 'action.json', 'count.json'):
        src = legacy_data / name
        if src.exists():
            shutil.copy2(src, default_dir / name)
    legacy_img = paths.PROJECT_ROOT / 'img'
    dest_img = default_dir / 'img'
    dest_img.mkdir(exist_ok=True)
    if legacy_img.exists():
        for item in legacy_img.iterdir():
            target = dest_img / item.name
            if item.is_file() and not target.exists():
                shutil.copy2(item, target)

    _write_project_meta('default', {
        'id': 'default',
        'name': '主项目',
        'created_at': _now_iso(),
    })
    ws = {'active_project': 'default', 'projects': [{'id': 'default', 'name': '主项目'}]}
    _write_workspace(ws)

    from config import get_config, save_config

    cfg = get_config()
    cfg.active_project = 'default'
    save_config(cfg)
    paths.refresh_paths()


def list_projects() -> List[Dict[str, Any]]:
    migrate_legacy_data_if_needed()
    ws = _read_workspace()
    known = {p.get('id'): p for p in ws.get('projects', []) if p.get('id')}
    if PROJECTS_ROOT.exists():
        for child in PROJECTS_ROOT.iterdir():
            if child.is_dir():
                pid = child.name
                meta = _read_project_meta(pid)
                known[pid] = {
                    'id': pid,
                    'name': meta.get('name', pid),
                    'description': meta.get('description', ''),
                    'default_root_event': meta.get('default_root_event'),
                    'created_at': meta.get('created_at'),
                }
    projects = list(known.values())
    for project in projects:
        pid = project.get('id')
        if pid:
            project['stats'] = project_stats(pid)
    projects.sort(key=lambda p: p.get('id', ''))
    return projects


def project_stats(project_id: str) -> Dict[str, int]:
    event_path = _project_dir(project_id) / 'event.json'
    if not event_path.exists():
        return {'macros': 0, 'micros': 0, 'exceptions': 0, 'total': 0}
    import json

    events = json.loads(event_path.read_text(encoding='utf-8'))
    macros = sum(1 for e in events if e.get('event_type') == 0 and not e.get('is_exception'))
    micros = sum(1 for e in events if e.get('event_type') == 1 and not e.get('is_exception'))
    exceptions = sum(1 for e in events if e.get('is_exception'))
    return {
        'macros': macros,
        'micros': micros,
        'exceptions': exceptions,
        'total': len(events),
    }


def get_project(project_id: str) -> Dict[str, Any]:
    migrate_legacy_data_if_needed()
    meta = _read_project_meta(project_id)
    if not _project_dir(project_id).exists():
        raise KeyError(f'项目不存在: {project_id}')
    return {**meta, 'stats': project_stats(project_id)}


def create_project(project_id: str, name: str, description: str = '') -> Dict[str, Any]:
    migrate_legacy_data_if_needed()
    if _project_dir(project_id).exists():
        raise ValueError(f'项目已存在: {project_id}')
    _empty_project_files(project_id)
    meta = {
        'id': project_id,
        'name': name,
        'description': description,
        'created_at': _now_iso(),
    }
    _write_project_meta(project_id, meta)
    ws = _read_workspace()
    ws.setdefault('projects', []).append({'id': project_id, 'name': name})
    _write_workspace(ws)
    return get_project(project_id)


def update_project(project_id: str, *, name: Optional[str] = None, description: Optional[str] = None,
                   default_root_event: Optional[str] = None) -> Dict[str, Any]:
    meta = _read_project_meta(project_id)
    if name is not None:
        meta['name'] = name
    if description is not None:
        meta['description'] = description
    if default_root_event is not None:
        meta['default_root_event'] = default_root_event
    _write_project_meta(project_id, meta)
    ws = _read_workspace()
    for entry in ws.get('projects', []):
        if entry.get('id') == project_id and name is not None:
            entry['name'] = name
    _write_workspace(ws)
    return get_project(project_id)


def delete_project(project_id: str) -> None:
    if project_id == 'default':
        raise ValueError('不能删除默认项目')
    ws = _read_workspace()
    if ws.get('active_project') == project_id:
        raise ValueError('不能删除当前激活的项目')
    dest = _project_dir(project_id)
    if dest.exists():
        shutil.rmtree(dest)
    ws['projects'] = [p for p in ws.get('projects', []) if p.get('id') != project_id]
    _write_workspace(ws)


def activate_project(project_id: str) -> Dict[str, Any]:
    migrate_legacy_data_if_needed()
    if not _project_dir(project_id).exists():
        raise KeyError(f'项目不存在: {project_id}')
    from config import get_config, save_config

    cfg = get_config()
    cfg.active_project = project_id
    save_config(cfg)
    ws = _read_workspace()
    ws['active_project'] = project_id
    _write_workspace(ws)
    paths.refresh_paths()
    return {
        'active_project': project_id,
        'data_dir': str(paths.DATA_DIR),
        'img_dir': str(paths.IMG_DIR),
    }


def active_project_id() -> str:
    migrate_legacy_data_if_needed()
    try:
        from config import get_config
        return get_config().active_project or 'default'
    except Exception:
        return _read_workspace().get('active_project', 'default')
