from dataclasses import dataclass, field
from typing import List, Optional


MAX_MATCH_MS_PER_SYMBOL = 80
MAX_MATCH_MS_PER_FRAME = 200
FINISH_DEBOUNCE_FRAMES = 2


class TaskPausedError(Exception):
    """Raised when the task must stop (ADB failure, window missing, etc.)."""


class AdbError(Exception):
    """Raised when an ADB command fails."""


@dataclass
class Rect:
    index: int
    x1: int
    y1: int
    x2: int
    y2: int
    score: float = 0.0
    source: str = 'template'

    def to_legacy(self) -> list:
        return [self.index, self.x1, self.y1, self.x2, self.y2]


@dataclass
class SymbolSpec:
    type: str
    target: str
    accuracy: float = 0.85
    roi: Optional[List[int]] = None
    index: int = 0
    fallback: Optional[List[str]] = None

    def cache_key(self) -> str:
        roi_part = ','.join(str(v) for v in self.roi) if self.roi else ''
        fb_part = ','.join(self.fallback) if self.fallback else ''
        return f'{self.type}|{self.target}|{self.accuracy}|{roi_part}|{self.index}|{fb_part}'
