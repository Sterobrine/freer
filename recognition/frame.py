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
        client = adb_client or AdbClient()
        try:
            raw = client.screencap()
        except AdbError as exc:
            raise TaskPausedError(str(exc)) from exc

        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ScreenshotError('无法解码 ADB 截屏数据')
        return cls(image=image, captured_at=time.time(), frame_id=_frame_counter)
