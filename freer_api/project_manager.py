"""Workspace / Project management.

Workspace = a directory with workspace.yaml, containing one or more projects.
Each project has its own event.json, action.json, img/, and optional project.yaml.
"""

import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

import paths
import Tools
from freer_log import get_logger

logger = get_logger('freer.project')


@dataclass
class ProjectMeta:
    id: str
    name: str = ''
    description: str = ''
    default_root_event: str = ''
    tags: List[str] = field(default_factory=list)


@dataclass
class Workspace:
    active_project: str = 'default'
    projects: Dict[str, ProjectMeta] = field(default_factory=dict)


_WORKSPACE: Optional[Workspace] = None


# ── paths helpers ────────────────────────────────────────────────────────

def _workspace_path() -> Path:
    return paths.PROJECT_ROOT / 'workspace.yaml'


def _projects_dir() -> Path:
    return paths.PROJECT_ROOT / 'projects'


def project_dir(project_id: str) -> Path:
    return _projects_dir() / project_id


def project_event_json(project_id: str) -> Path:
    return project_dir(project_id) / 'event.json'


def project_action_json(project_id: str) -> Path:
    return project_dir(project_id) / 'action.json'


def project_img_dir(project_id: str) -> Path:
    d = project_dir(project_id) / 'img'
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── workspace YAML ───────────────────────────────────────────────────────

def _try_load_yaml(path: Path) -> Optional[Dict[str, Any]]:
    try:
        import yaml
    except ImportError:
        return None
    if not path.exists():
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    except Exception as exc:
        logger.warning('无法加载 YAML %s: %s', path, exc)
        return None


def _save_yaml(path: Path, data: Dict[str, Any]) -> None:
    import yaml
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        yaml.safe_dump(data, f, allow_unicode=True, sort_keys=False)


def _dict_to_workspace(data: Dict[str, Any]) -> Workspace:
    ws = Workspace(active_project=str(data.get('active_project', 'default')))
    for pid, meta in data.get('projects', {}).items():
        ws.projects[pid] = ProjectMeta(
            id=pid,
            name=str(meta.get('name', pid)),
            description=str(meta.get('description', '')),
            default_root_event=str(meta.get('default_root_event', '')),
            tags=list(meta.get('tags', [])),
        )
    return ws


def _workspace_to_dict(ws: Workspace) -> Dict[str, Any]:
    projects = {}
    for pid, meta in ws.projects.items():
        projects[pid] = {
            'name': meta.name,
            'description': meta.description,
            'default_root_event': meta.default_root_event,
            'tags': meta.tags,
        }
    return {
        'active_project': ws.active_project,
        'projects': projects,
    }


# ── public API ───────────────────────────────────────────────────────────

def load_workspace() -> Workspace:
    global _WORKSPACE
    if _WORKSPACE is not None:
        return _WORKSPACE
    data = _try_load_yaml(_workspace_path())
    if data is None:
        _WORKSPACE = Workspace()
        return _WORKSPACE
    _WORKSPACE = _dict_to_workspace(data)
    return _WORKSPACE


def save_workspace(ws: Optional[Workspace] = None) -> None:
    global _WORKSPACE
    ws = ws or _WORKSPACE
    if ws is None:
        ws = Workspace()
    _save_yaml(_workspace_path(), _workspace_to_dict(ws))
    _WORKSPACE = ws


def list_projects() -> List[ProjectMeta]:
    ws = load_workspace()
    return list(ws.projects.values())


def get_project(project_id: str) -> Optional[ProjectMeta]:
    ws = load_workspace()
    return ws.projects.get(project_id)


def create_project(
    project_id: str,
    name: str = '',
    description: str = '',
    default_root_event: str = '',
    tags: Optional[List[str]] = None,
) -> ProjectMeta:
    ws = load_workspace()
    if project_id in ws.projects:
        raise ValueError(f'项目已存在: {project_id}')
    meta = ProjectMeta(
        id=project_id,
        name=name or project_id,
        description=description,
        default_root_event=default_root_event,
        tags=tags or [],
    )
    # 创建项目目录和初始文件
    pdir = project_dir(project_id)
    pdir.mkdir(parents=True, exist_ok=True)

    # project.yaml
    _save_yaml(pdir / 'project.yaml', {
        'id': project_id,
        'name': meta.name,
        'description': meta.description,
        'default_root_event': meta.default_root_event,
        'tags': meta.tags,
    })

    # 空 event.json
    if not (pdir / 'event.json').exists():
        Tools.FileTool.WriteJSON(str(pdir / 'event.json'), [], indent=2)
    # 空 action.json
    if not (pdir / 'action.json').exists():
        Tools.FileTool.WriteJSON(str(pdir / 'action.json'), [], indent=2)
    # img/
    (pdir / 'img').mkdir(exist_ok=True)

    ws.projects[project_id] = meta
    save_workspace(ws)
    logger.info('项目创建成功: %s (%s)', meta.name, project_id)
    return meta


def delete_project(project_id: str) -> None:
    ws = load_workspace()
    if project_id not in ws.projects:
        raise KeyError(f'项目不存在: {project_id}')
    if ws.active_project == project_id:
        raise ValueError(f'不能删除当前激活的项目: {project_id}，请先切换到其他项目')
    # 删除物理目录
    pdir = project_dir(project_id)
    if pdir.exists():
        shutil.rmtree(str(pdir))
    del ws.projects[project_id]
    save_workspace(ws)
    logger.info('项目已删除: %s', project_id)


def activate_project(project_id: str) -> ProjectMeta:
    ws = load_workspace()
    meta = ws.projects.get(project_id)
    if meta is None:
        raise KeyError(f'项目不存在: {project_id}')
    ws.active_project = project_id
    save_workspace(ws)
    # 将 paths 全局变量指向项目目录（refresh_paths 只读 config.yaml，不知道项目切换）
    pdir = project_dir(project_id)
    paths.DATA_DIR = pdir
    paths.IMG_DIR = project_img_dir(project_id)
    paths.EVENT_JSON = pdir / 'event.json'
    paths.ACTION_JSON = pdir / 'action.json'
    paths.COUNT_JSON = pdir / 'count.json'
    logger.info('已切换到项目: %s -> DATA_DIR=%s', project_id, pdir)
    return meta


def get_active_project() -> str:
    ws = load_workspace()
    return ws.active_project


def project_stats(project_id: str) -> Dict[str, Any]:
    """返回项目统计：宏/微/异常事件数量"""
    from freer_api.store import EventStore
    old_active = get_active_project()
    try:
        _temporary_activate(project_id)
        events = EventStore.list_events()
        macros = sum(1 for e in events if e.get('event_type') == 0 and not e.get('is_exception'))
        micros = sum(1 for e in events if e.get('event_type') == 1 and not e.get('is_exception'))
        exceptions = sum(1 for e in events if e.get('is_exception'))
        return {'event_count': len(events), 'macros': macros, 'micros': micros, 'exceptions': exceptions}
    finally:
        _temporary_activate(old_active)


def _temporary_activate(project_id: str) -> None:
    """临时切换 paths 指向指定项目（不修改 workspace）。

    ⚠️ 调用方必须在 try/finally 中恢复原路径，否则 paths 全局状态会持续指向错误位置。
    """
    pdir = project_dir(project_id)
    paths.DATA_DIR = pdir
    paths.IMG_DIR = project_img_dir(project_id)
    paths.EVENT_JSON = pdir / 'event.json'
    paths.ACTION_JSON = pdir / 'action.json'


def migrate_legacy_data() -> bool:
    """将 data/event.json 和 data/action.json 迁移到 projects/default/。返回是否执行了迁移。"""
    ws = load_workspace()
    if 'default' in ws.projects:
        return False  # 已迁移
    src_event = paths.PROJECT_ROOT / 'data' / 'event.json'
    src_action = paths.PROJECT_ROOT / 'data' / 'action.json'
    if not src_event.exists() and not src_action.exists():
        # 没有旧数据，直接创建 default 项目
        create_project('default', name='主项目')
        return True
    create_project('default', name='主项目')
    # 复制数据
    import shutil
    dst_event = project_event_json('default')
    dst_action = project_action_json('default')
    if src_event.exists():
        shutil.copy2(str(src_event), str(dst_event))
    if src_action.exists():
        shutil.copy2(str(src_action), str(dst_action))
    # 迁移 img/（如果有）
    src_img = paths.PROJECT_ROOT / 'img'
    dst_img = project_img_dir('default')
    if src_img.exists():
        for f in src_img.iterdir():
            if f.is_file():
                shutil.copy2(str(f), str(dst_img / f.name))
    logger.info('旧数据已迁移到 projects/default/')
    return True
