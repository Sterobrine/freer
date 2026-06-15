import time
from typing import Any, Dict, List, Optional

from recognition.fallback import build_fallback_specs
from recognition.frame import FrameContext
from recognition.last_known import LastKnownCache
from recognition.matchers.color import ColorMatcher
from recognition.matchers.feature import FeatureMatcher
from recognition.matchers.ocr import OcrMatcher
from recognition.matchers.roi import expand_roi
from recognition.matchers.template import TemplateMatcher
from recognition.matchers.ui import UiMatcher
from recognition.position_utils import default_position_to_rects
from recognition.types import (
    MAX_MATCH_MS_PER_FRAME,
    MAX_MATCH_MS_PER_SYMBOL,
    OCR_INTERVAL_FRAMES,
    Rect,
    SymbolSpec,
    TaskPausedError,
)


class MatcherRouter:
    def __init__(self):
        self._matchers = {
            'template': TemplateMatcher(),
            'feature': FeatureMatcher(),
            'ocr': OcrMatcher(),
            'ui': UiMatcher(),
            'color': ColorMatcher(),
        }
        self.last_known = LastKnownCache()
        self._ocr_last_frame: Dict[str, int] = {}
        self._ocr_throttle_results: Dict[str, List[Rect]] = {}

    def resolve(self, frame: FrameContext, spec: SymbolSpec, event: Any = None) -> List[Rect]:
        return self.resolve_for_action(frame, spec, event=event)

    def resolve_for_action(
        self,
        frame: FrameContext,
        spec: SymbolSpec,
        event: Any = None,
    ) -> List[Rect]:
        if not spec.target:
            return []

        cache_key = spec.cache_key()
        if cache_key in frame.match_cache:
            return frame.match_cache[cache_key]

        if frame.match_elapsed_ms >= MAX_MATCH_MS_PER_FRAME:
            frame.match_cache[cache_key] = []
            return []

        symbol_start = time.perf_counter()
        results = self._resolve_l1(frame, spec)
        if not results:
            results = self._resolve_l2(frame, spec, event)

        symbol_elapsed_ms = (time.perf_counter() - symbol_start) * 1000
        if symbol_elapsed_ms > MAX_MATCH_MS_PER_SYMBOL and not results:
            results = []

        if results:
            self.last_known.put(spec.last_known_key(), results, frame.frame_id)

        frame.match_cache[cache_key] = results
        return results

    def _resolve_l1(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        chain = [spec] + build_fallback_specs(spec)
        for step_spec in chain:
            if frame.match_elapsed_ms >= MAX_MATCH_MS_PER_FRAME:
                break
            results = self._match_once(frame, step_spec)
            if results:
                return results
        return []

    def _resolve_l2(self, frame: FrameContext, spec: SymbolSpec, event: Any) -> List[Rect]:
        last_resort = spec.last_resort or 'none'

        if last_resort == 'expand_roi' and spec.roi:
            expanded_roi = expand_roi(spec.roi, spec.roi_expand_px, frame.image.shape)
            expanded = SymbolSpec(
                type=spec.type,
                target=spec.target,
                accuracy=spec.accuracy,
                roi=expanded_roi,
                index=spec.index,
                last_resort='none',
            )
            results = self._match_once(frame, expanded)
            if results:
                return results

        if last_resort == 'last_known':
            cached = self.last_known.get(spec.last_known_key(), frame.frame_id)
            if cached:
                return cached

        if last_resort == 'default_position' and event is not None:
            rects = default_position_to_rects(getattr(event, 'default_position', None))
            if rects:
                return rects

        if last_resort == 'pause':
            raise TaskPausedError(f'识别失败且 last_resort=pause: {spec.target}')

        return []

    def _match_once(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        if spec.type == 'ocr':
            key = spec.cache_key()
            last_frame = self._ocr_last_frame.get(key)
            if last_frame is not None and frame.frame_id - last_frame < OCR_INTERVAL_FRAMES:
                throttled = self._ocr_throttle_results.get(key)
                if throttled:
                    return throttled
                return []

        matcher = self._matchers.get(spec.type)
        if matcher is None:
            print(f'警告：未知 match_type "{spec.type}"，跳过识别')
            return []

        start = time.perf_counter()
        try:
            results = matcher.match(frame, spec)
        except FileNotFoundError as exc:
            print(f'警告：{exc}')
            results = []

        elapsed_ms = (time.perf_counter() - start) * 1000
        frame.match_elapsed_ms += elapsed_ms

        if results and spec.type == 'ocr':
            key = spec.cache_key()
            self._ocr_last_frame[key] = frame.frame_id
            self._ocr_throttle_results[key] = results

        return results

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
