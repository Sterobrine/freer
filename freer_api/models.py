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
