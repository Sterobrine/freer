from dataclasses import dataclass, field
from typing import List, Optional


MAX_MATCH_MS_PER_SYMBOL = 80
MAX_MATCH_MS_PER_FRAME = 200
FINISH_DEBOUNCE_FRAMES = 2
LAST_KNOWN_TTL_FRAMES = 3
OCR_INTERVAL_FRAMES = 2
ROI_EXPAND_PX = 20

MATCH_TYPES = frozenset({'template', 'feature', 'ocr', 'ui', 'color'})


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
    last_resort: str = 'none'
    roi_expand_px: int = ROI_EXPAND_PX
    fallback_accuracy_delta: float = 0.05
    max_fallback_steps: int = 2

    def cache_key(self) -> str:
        roi_part = ','.join(str(v) for v in self.roi) if self.roi else ''
        fb_part = ','.join(self.fallback) if self.fallback else ''
        return (
            f'{self.type}|{self.target}|{self.accuracy}|{roi_part}|'
            f'{self.index}|{fb_part}|{self.last_resort}'
        )

    def last_known_key(self) -> str:
        return f'{self.type}|{self.target}'

    def with_expanded_roi(self, px: Optional[int] = None) -> 'SymbolSpec':
        if not self.roi:
            return self
        expand = px if px is not None else self.roi_expand_px
        x1, y1, x2, y2 = self.roi
        return SymbolSpec(
            type=self.type,
            target=self.target,
            accuracy=self.accuracy,
            roi=[x1 - expand, y1 - expand, x2 + expand, y2 + expand],
            index=self.index,
            fallback=self.fallback,
            last_resort=self.last_resort,
            roi_expand_px=self.roi_expand_px,
            fallback_accuracy_delta=self.fallback_accuracy_delta,
            max_fallback_steps=self.max_fallback_steps,
        )
