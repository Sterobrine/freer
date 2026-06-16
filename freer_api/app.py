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
    save_config(cfg)
    return cfg


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_config(reload=True)
    paths.refresh_paths()
    setup_logging()
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
        return ok({
            'frame_id': frame.frame_id,
            'screenshot': str(paths.SCREENSHOT_PATH),
            'url': '/screenshot',
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
