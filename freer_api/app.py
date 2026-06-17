import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

import paths
from config import get_config, load_config, save_config, FreerConfig
from freer_api.models import (
    ConfigUpdateRequest,
    CropRequest,
    ExportRequest,
    ImportRequest,
    PreviewRequest,
    TaskStartRequest,
    ValidateRequest,
)
from freer_api.schemas import fail, ok
from freer_api.store import ActionStore, EventStore
from freer_api.task_runner import TaskRunner
from freer_api.validate import validate_event, validate_events
from freer_api.tree import build_event_tree
from freer_api.export_import import export_package, import_package
from freer_log import get_broadcast_handler, get_logger, setup_logging

logger = get_logger('freer.api')
task_runner = TaskRunner()


def _config_payload() -> Dict[str, Any]:
    cfg = get_config()
    return {
        'adb_device': cfg.adb_device,
        'data_dir': cfg.data_dir,
        'img_dir': cfg.img_dir,
        'capture_mode': cfg.capture_mode,
        'log_level': cfg.log_level,
        'log_dir': cfg.log_dir,
        'default_action_platform': cfg.default_action_platform,
        'api': {'host': cfg.api.host, 'port': cfg.api.port},
        'recognition': {
            'max_consecutive_miss_frames': cfg.recognition.max_consecutive_miss_frames,
            'last_known_ttl_frames': cfg.recognition.last_known_ttl_frames,
        },
    }


def _apply_config_update(body: ConfigUpdateRequest) -> FreerConfig:
    cfg = get_config()
    if body.adb_device is not None:
        cfg.adb_device = body.adb_device
    if body.data_dir is not None:
        cfg.data_dir = body.data_dir
    if body.img_dir is not None:
        cfg.img_dir = body.img_dir
    if body.capture_mode is not None:
        cfg.capture_mode = body.capture_mode
    if body.log_level is not None:
        cfg.log_level = body.log_level
    if body.log_dir is not None:
        cfg.log_dir = body.log_dir
    if body.api_host is not None:
        cfg.api.host = body.api_host
    if body.api_port is not None:
        cfg.api.port = body.api_port
    if body.max_consecutive_miss_frames is not None:
        cfg.recognition.max_consecutive_miss_frames = body.max_consecutive_miss_frames
    if body.last_known_ttl_frames is not None:
        cfg.recognition.last_known_ttl_frames = body.last_known_ttl_frames
    if body.default_action_platform is not None:
        cfg.default_action_platform = body.default_action_platform
    save_config(cfg)
    return cfg


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_config(reload=True)
    paths.refresh_paths()
    setup_logging()
    # Phase 5F: 旧数据迁移到 projects/
    from freer_api.project_manager import migrate_legacy_data
    try:
        if migrate_legacy_data():
            logger.info('旧数据已迁移到 projects/default/')
    except Exception as exc:
        logger.warning('数据迁移失败（首次启动时可忽略）: %s', exc)
    logger.info('freer_api 启动，data_dir=%s', paths.DATA_DIR)
    yield
    task_runner.stop()
    logger.info('freer_api 关闭')


app = FastAPI(title='Freer API', version='1.1.0', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.exception('未处理异常: %s', exc)
    return JSONResponse(
        status_code=500,
        content=fail('internal_error', str(exc), status_code=500),
    )


@app.get('/health')
def health():
    return ok({'status': 'ok', 'api_version': '1.1.0', 'data_dir': str(paths.DATA_DIR)})


@app.get('/config')
def get_config_route():
    return ok(_config_payload())


@app.put('/config')
def put_config_route(body: ConfigUpdateRequest):
    _apply_config_update(body)
    return ok(_config_payload())


@app.get('/events')
def list_events():
    return ok(EventStore.list_events())


@app.post('/events')
def create_event(event: Dict[str, Any]):
    try:
        created = EventStore.create(event)
        logger.info('创建事件: %s', created.get('name'))
        return ok(created)
    except ValueError as exc:
        return JSONResponse(status_code=409, content=fail('conflict', str(exc), 409))


@app.put('/events/{name}')
def update_event(name: str, event: Dict[str, Any]):
    try:
        updated = EventStore.update(name, event)
        logger.info('更新事件: %s', name)
        return ok(updated)
    except KeyError as exc:
        return JSONResponse(status_code=404, content=fail('not_found', str(exc), 404))


@app.delete('/events/{name}')
def delete_event(name: str):
    try:
        EventStore.delete(name)
        logger.info('删除事件: %s', name)
        return ok({'deleted': name})
    except KeyError as exc:
        return JSONResponse(status_code=404, content=fail('not_found', str(exc), 404))


@app.get('/actions')
def list_actions():
    return ok(ActionStore.list_actions())


@app.post('/actions')
def create_action(action: Dict[str, Any]):
    try:
        created = ActionStore.create(action)
        logger.info('创建动作: %s', created.get('name'))
        return ok(created)
    except ValueError as exc:
        return JSONResponse(status_code=409, content=fail('conflict', str(exc), 409))


@app.put('/actions/{name}')
def update_action(name: str, action: Dict[str, Any]):
    try:
        updated = ActionStore.update(name, action)
        logger.info('更新动作: %s', name)
        return ok(updated)
    except KeyError as exc:
        return JSONResponse(status_code=404, content=fail('not_found', str(exc), 404))


@app.delete('/actions/{name}')
def delete_action(name: str):
    try:
        ActionStore.delete(name)
        logger.info('删除动作: %s', name)
        return ok({'deleted': name})
    except KeyError as exc:
        return JSONResponse(status_code=404, content=fail('not_found', str(exc), 404))


@app.get('/templates')
def list_templates():
    img_dir = paths.IMG_DIR
    if not img_dir.exists():
        return ok([])
    files = sorted(str(p.relative_to(paths.PROJECT_ROOT)) for p in img_dir.rglob('*.bmp'))
    return ok(files)


@app.post('/templates/upload')
async def upload_template(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith('.bmp'):
        return JSONResponse(status_code=400, content=fail('invalid_file', '仅支持 .bmp 模板', 400))
    safe = Path(file.filename).name
    if not safe or safe.startswith('.'):
        return JSONResponse(status_code=400, content=fail('invalid_file', '无效文件名', 400))
    paths.refresh_paths()
    img_dir = paths.IMG_DIR
    img_dir.mkdir(parents=True, exist_ok=True)
    target = (img_dir / safe).resolve()
    try:
        target.relative_to(img_dir.resolve())
    except ValueError:
        return JSONResponse(status_code=400, content=fail('invalid_path', '无效路径', 400))
    content = await file.read()
    target.write_bytes(content)
    rel = str(target.relative_to(paths.PROJECT_ROOT)).replace('\\', '/')
    logger.info('上传模板: %s', rel)
    return ok({'path': rel})


@app.post('/capture')
def capture_screen():
    from recognition.adb_client import AdbClient
    from recognition.frame import FrameContext
    try:
        frame = FrameContext.capture(AdbClient())
        h, w = frame.image.shape[:2]
        return ok({
            'frame_id': frame.frame_id,
            'screenshot': str(paths.SCREENSHOT_PATH),
            'url': '/screenshot',
            'width': w,
            'height': h,
        })
    except Exception as exc:
        return JSONResponse(status_code=503, content=fail('capture_failed', str(exc), 503))


@app.get('/screenshot')
def get_screenshot():
    path = paths.SCREENSHOT_PATH
    if not path.is_file():
        return JSONResponse(status_code=404, content=fail('not_found', '尚无截图', 404))
    return FileResponse(path, media_type='image/bmp', filename='screenshot.bmp')


@app.get('/events/{name}')
def get_event(name: str):
    event = EventStore.get_by_name(name)
    if event is None:
        return JSONResponse(status_code=404, content=fail('not_found', f'未找到事件: {name}', 404))
    return ok(event)


@app.post('/task/start')
def start_task(body: TaskStartRequest):
    try:
        if EventStore.get_by_name(body.event_name) is None:
            return JSONResponse(
                status_code=404,
                content=fail('not_found', f'未找到事件: {body.event_name}', 404),
            )
        data = task_runner.start(body.event_name, body.repeat_time)
        return ok(data)
    except RuntimeError as exc:
        return JSONResponse(status_code=409, content=fail('conflict', str(exc), 409))


@app.post('/task/stop')
def stop_task():
    return ok(task_runner.stop())


@app.post('/task/pause')
def pause_task():
    try:
        return ok(task_runner.pause())
    except RuntimeError as exc:
        return JSONResponse(status_code=409, content=fail('conflict', str(exc), 409))


@app.post('/task/resume')
def resume_task():
    try:
        return ok(task_runner.resume())
    except RuntimeError as exc:
        return JSONResponse(status_code=409, content=fail('conflict', str(exc), 409))


@app.get('/task/status')
def task_status():
    return ok(task_runner.snapshot())


@app.get('/events/{name}/tree')
def get_event_tree(name: str):
    try:
        return ok(build_event_tree(name))
    except KeyError as exc:
        return JSONResponse(status_code=404, content=fail('not_found', str(exc), 404))


@app.post('/events/validate')
def validate_events_route(body: ValidateRequest):
    if body.events is not None:
        return ok(validate_events(body.events, check_assets=body.check_assets))
    return ok(validate_events(check_assets=body.check_assets))


@app.post('/events/{name}/validate')
def validate_single_event(name: str):
    event = EventStore.get_by_name(name)
    if event is None:
        return JSONResponse(status_code=404, content=fail('not_found', f'未找到事件: {name}', 404))
    return ok(validate_event(event))


@app.post('/recognize/preview')
def recognize_preview_route(body: PreviewRequest):
    from freer_api.preview import recognize_preview

    event_fields = body.model_dump(exclude={'symbol', 'accuracy', 'kind', 'use_capture'})
    return ok(recognize_preview(
        body.symbol,
        accuracy=body.accuracy,
        kind=body.kind,
        event_fields=event_fields,
        use_capture=body.use_capture,
    ))


@app.get('/assets/img/{asset_path:path}')
def serve_asset(asset_path: str):
    safe = Path(asset_path).name
    if not safe or safe != Path(asset_path.replace('\\', '/')).name:
        return JSONResponse(status_code=400, content=fail('invalid_path', '无效路径', 400))
    target = (paths.IMG_DIR / safe).resolve()
    try:
        target.relative_to(paths.IMG_DIR.resolve())
    except ValueError:
        return JSONResponse(status_code=400, content=fail('invalid_path', '无效路径', 400))
    if not target.is_file():
        return JSONResponse(status_code=404, content=fail('not_found', f'未找到资源: {safe}', 404))
    return FileResponse(target)


@app.post('/export')
def export_route(body: ExportRequest):
    data = export_package(event_names=body.event_names, include_actions=body.include_actions)
    return Response(
        content=data,
        media_type='application/zip',
        headers={'Content-Disposition': 'attachment; filename=freer-export.zip'},
    )


@app.post('/import')
async def import_route(
    file: UploadFile = File(...),
    mode: str = 'merge',
):
    try:
        content = await file.read()
        result = import_package(content, mode=mode)
        return ok(result)
    except ValueError as exc:
        return JSONResponse(status_code=400, content=fail('invalid_package', str(exc), 400))


@app.post('/shutdown')
def shutdown():
    task_runner.stop()
    return ok({'shutting_down': True})


# ── Capture Workbench endpoints (Phase 5G) ─────────────────────────────


@app.post('/templates/crop')
def crop_template_route(body: CropRequest):
    import cv2
    import numpy as np
    from datetime import datetime
    from freer_api.project_manager import get_active_project, project_img_dir

    rect = body.rect
    if len(rect) != 4:
        return JSONResponse(status_code=400, content=fail('invalid_rect', '须为 [x1,y1,x2,y2]'))

    # 获取图像源
    if body.image == 'capture':
        # 从当前截图文件读取
        sc_path = paths.SCREENSHOT_PATH
        if not sc_path.exists():
            return JSONResponse(status_code=400, content=fail('no_screenshot', '尚无截图，请先执行一次 /capture'))
        img = cv2.imread(str(sc_path))
        if img is None:
            return JSONResponse(status_code=400, content=fail('bad_screenshot', '截图文件无法解码'))
    else:
        import base64
        try:
            raw = base64.b64decode(body.image)
            img = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception as exc:
            return JSONResponse(status_code=400, content=fail('decode_error', f'无法解码图片: {exc}'))
        if img is None:
            return JSONResponse(status_code=400, content=fail('decode_error', '无法解码图片'))

    # 裁切
    x1, y1, x2, y2 = rect
    h, w = img.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return JSONResponse(status_code=400, content=fail('empty_rect', '裁切区域为空'))
    cropped = img[y1:y2, x1:x2]

    # 保存到当前项目 img/
    pid = get_active_project()
    img_dir = project_img_dir(pid)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = body.name or f'crop_{ts}'
    if not filename.endswith('.bmp'):
        filename += '.bmp'
    out_path = img_dir / filename
    cv2.imwrite(str(out_path), cropped)

    # 返回相对路径
    from paths import PROJECT_ROOT
    rel_path = str(out_path.relative_to(PROJECT_ROOT)).replace('\\', '/')
    return ok({'path': rel_path, 'filename': filename})


# ── Project endpoints (Phase 5F) ────────────────────────────────────────


@app.get('/projects')
def list_projects_route():
    from freer_api.project_manager import list_projects
    projects = list_projects()
    return ok([
        {
            'id': p.id,
            'name': p.name,
            'description': p.description,
            'default_root_event': p.default_root_event,
            'tags': p.tags,
        }
        for p in projects
    ])


@app.post('/projects')
def create_project_route(body: Dict[str, Any]):
    from freer_api.project_manager import create_project
    try:
        meta = create_project(
            project_id=body['id'],
            name=body.get('name', ''),
            description=body.get('description', ''),
            default_root_event=body.get('default_root_event', ''),
            tags=body.get('tags'),
        )
    except ValueError as exc:
        from freer_api.schemas import fail as _fail
        return _fail('conflict', str(exc))
    return ok({
        'id': meta.id,
        'name': meta.name,
        'description': meta.description,
        'default_root_event': meta.default_root_event,
        'tags': meta.tags,
    })


# 静态路由必须先于参数化路由注册，避免 /projects/active 被 /projects/{project_id} 捕获
@app.get('/projects/active')
def get_active_project_route():
    from freer_api.project_manager import get_active_project, get_project
    pid = get_active_project()
    meta = get_project(pid)
    if meta is None:
        return ok({'id': pid, 'name': pid})
    return ok({
        'id': meta.id,
        'name': meta.name,
        'description': meta.description,
        'default_root_event': meta.default_root_event,
        'tags': meta.tags,
    })


@app.post('/projects/{project_id}/activate')
def activate_project_route(project_id: str):
    from freer_api.project_manager import activate_project
    try:
        meta = activate_project(project_id)
    except KeyError as exc:
        from freer_api.schemas import fail as _fail
        return _fail('not_found', str(exc))
    return ok({
        'id': meta.id,
        'name': meta.name,
        'description': meta.description,
        'default_root_event': meta.default_root_event,
        'tags': meta.tags,
    })


@app.get('/projects/{project_id}')
def get_project_route(project_id: str):
    from freer_api.project_manager import get_project, project_stats
    meta = get_project(project_id)
    if meta is None:
        from freer_api.schemas import fail as _fail
        return _fail('not_found', f'项目不存在: {project_id}')
    stats = project_stats(project_id)
    return ok({
        'id': meta.id,
        'name': meta.name,
        'description': meta.description,
        'default_root_event': meta.default_root_event,
        'tags': meta.tags,
        'stats': stats,
    })


@app.delete('/projects/{project_id}')
def delete_project_route(project_id: str):
    from freer_api.project_manager import delete_project
    try:
        delete_project(project_id)
    except (KeyError, ValueError) as exc:
        from freer_api.schemas import fail as _fail
        status_code = 404 if isinstance(exc, KeyError) else 400
        return _fail('error', str(exc), status_code)
    return ok({'deleted': project_id})


@app.websocket('/logs')
async def websocket_logs(websocket: WebSocket):
    await websocket.accept()
    handler = get_broadcast_handler()
    if handler is None:
        await websocket.close()
        return
    queue: asyncio.Queue = asyncio.Queue()
    handler.subscribers.append(queue)
    try:
        while True:
            item = await queue.get()
            await websocket.send_text(json.dumps(item, ensure_ascii=False))
    except WebSocketDisconnect:
        pass
    finally:
        if queue in handler.subscribers:
            handler.subscribers.remove(queue)


def create_app() -> FastAPI:
    return app
