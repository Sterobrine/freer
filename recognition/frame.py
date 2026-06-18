from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from recognition.adb_client import AdbClient
from recognition.types import AdbError, Rect, TaskPausedError


class ScreenshotError(Exception):
    """Raised when screenshot bytes cannot be decoded."""


_frame_counter = 0


@dataclass
class FrameContext:
    image: Any
    captured_at: float
    frame_id: int = 0
    match_cache: Dict[str, List[Rect]] = field(default_factory=dict)
    match_elapsed_ms: float = 0.0

    @classmethod
    def capture(cls, adb_client: Optional[AdbClient] = None) -> FrameContext:
        import cv2
        import numpy as np

        global _frame_counter
        _frame_counter += 1

        capture_mode = 'adb_pipe'
        try:
            from config import get_config
            capture_mode = get_config().capture_mode
        except Exception:
            pass
        if capture_mode not in ('adb_pipe', ''):
            from freer_log import get_logger
            get_logger('freer.capture').warning(
                'capture_mode=%s 未实现，回退 adb_pipe（识别截屏仅支持 ADB）',
                capture_mode,
            )

        client = adb_client or AdbClient()
        try:
            raw = client.screencap()
        except AdbError as exc:
            raise TaskPausedError(str(exc)) from exc

        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ScreenshotError('无法解码 ADB 截屏数据')
        return cls(image=image, captured_at=time.time(), frame_id=_frame_counter)
