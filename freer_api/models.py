from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TaskStartRequest(BaseModel):
    event_name: str
    repeat_time: int = Field(default=1, ge=1)


class ConfigUpdateRequest(BaseModel):
    adb_device: Optional[str] = None
    data_dir: Optional[str] = None
    img_dir: Optional[str] = None
    capture_mode: Optional[str] = None
    log_level: Optional[str] = None
    log_dir: Optional[str] = None
    api_host: Optional[str] = None
    api_port: Optional[int] = None
    max_consecutive_miss_frames: Optional[int] = None
    last_known_ttl_frames: Optional[int] = None


class ValidateRequest(BaseModel):
    events: Optional[List[Dict[str, Any]]] = None
    check_assets: bool = True


class PreviewRequest(BaseModel):
    symbol: Any
    accuracy: float = Field(default=0.85, ge=0.0, le=1.0)
    kind: str = Field(default='start')
    match_type_start: Optional[str] = None
    match_type_finish: Optional[str] = None
    roi_start: Optional[List[int]] = None
    roi_finish: Optional[List[int]] = None
    match_fallback_start: Optional[str] = None
    match_fallback_finish: Optional[str] = None
    last_resort_start: Optional[str] = None
    last_resort_finish: Optional[str] = None
    index_start: Optional[int] = None
    index_finish: Optional[int] = None
    use_capture: bool = True


class ExportRequest(BaseModel):
    event_names: Optional[List[str]] = None
    include_actions: bool = True


class ProjectCreateRequest(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str = ''


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    default_root_event: Optional[str] = None


class TemplateCropRequest(BaseModel):
    rect: List[int] = Field(min_length=4, max_length=4)
    name: Optional[str] = None
    image: str = 'capture'


class ImportRequest(BaseModel):
    mode: str = Field(default='merge')
