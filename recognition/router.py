import time
from typing import List, Optional

from recognition.frame import FrameContext
from recognition.matchers.template import TemplateMatcher
from recognition.types import (
    MAX_MATCH_MS_PER_FRAME,
    MAX_MATCH_MS_PER_SYMBOL,
    Rect,
    SymbolSpec,
)


class MatcherRouter:
    def __init__(self):
        self._matchers = {
            'template': TemplateMatcher(),
        }

    def resolve(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        if not spec.target:
            return []

        cache_key = spec.cache_key()
        if cache_key in frame.match_cache:
            return frame.match_cache[cache_key]

        if frame.match_elapsed_ms >= MAX_MATCH_MS_PER_FRAME:
            frame.match_cache[cache_key] = []
            return []

        symbol_start = time.perf_counter()
        results = self._run_matchers(frame, spec)
        symbol_elapsed_ms = (time.perf_counter() - symbol_start) * 1000

        if symbol_elapsed_ms > MAX_MATCH_MS_PER_SYMBOL:
            results = []

        frame.match_elapsed_ms += symbol_elapsed_ms
        frame.match_cache[cache_key] = results
        return results

    def _run_matchers(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        matcher = self._matchers.get(spec.type)
        if matcher is None:
            print(f'警告：未知 match_type "{spec.type}"，跳过识别')
            return []
        try:
            return matcher.match(frame, spec)
        except FileNotFoundError as exc:
            print(f'警告：{exc}')
            return []

    @staticmethod
    def to_legacy_positions(rects: List[Rect]) -> list:
        return [rect.to_legacy() for rect in rects]

    @staticmethod
    def select_by_index(rects: List[Rect], index: int = 0) -> List[Rect]:
        if not rects:
            return []
        if index < len(rects):
            return [rects[index]]
        return []
