import time
from typing import Dict, List, Optional, Tuple

from recognition.types import LAST_KNOWN_TTL_FRAMES, Rect


class LastKnownCache:
    def __init__(self, ttl_frames: int = LAST_KNOWN_TTL_FRAMES):
        self.ttl_frames = ttl_frames
        self._entries: Dict[str, Tuple[int, float, List[Rect]]] = {}

    def put(self, key: str, rects: List[Rect], frame_id: int) -> None:
        if not rects:
            return
        self._entries[key] = (frame_id, time.time(), list(rects))

    def get(self, key: str, frame_id: int) -> List[Rect]:
        entry = self._entries.get(key)
        if entry is None:
            return []
        stored_frame, _, rects = entry
        if frame_id - stored_frame > self.ttl_frames:
            del self._entries[key]
            return []
        return list(rects)

    def clear(self) -> None:
        self._entries.clear()
