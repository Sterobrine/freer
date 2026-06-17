from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from recognition.adb_client import AdbClient
from recognition.types import AdbError, Rect, TaskPausedError


class ScreenshotError(Exception):
    """Raised when screenshot bytes cannot be decoded."""


_frame_counter = 0
_capture_mode_warned = False


@dataclass
class FrameContext:
    image: Any
    captured_at: float
    frame_id: int = 0
    match_cache: Dict[str, List[Rect]] = field(default_factory=dict)
    match_elapsed_ms: float = 0.0

    @classmethod
    def _check_capture_mode(cls) -> None:
        """检查 capture_mode 配置，非 adb_pipe 时仅首次警告。"""
        global _capture_mode_warned
        if _capture_mode_warned:
            return
        try:
            from config import get_config
            capture_mode = get_config().capture_mode
        except Exception:
            capture_mode = 'adb_pipe'
        if capture_mode != 'adb_pipe':
            from freer_log import get_logger
            get_logger('freer.capture').warning(
                '不支持的 capture_mode: %s，回退到 adb_pipe', capture_mode,
            )
        _capture_mode_warned = True

    @classmethod
    def capture(cls, adb_client: Optional[AdbClient] = None) -> FrameContext:
        import cv2
        import numpy as np

        global _frame_counter
        _frame_counter += 1

        cls._check_capture_mode()

        client = adb_client or AdbClient()
        try:
            raw = client.screencap()
        except AdbError as exc:
            raise TaskPausedError(str(exc)) from exc

        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ScreenshotError('无法解码 ADB 截屏数据')
        return cls(image=image, captured_at=time.time(), frame_id=_frame_counter)
