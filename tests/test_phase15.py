import sys
from unittest.mock import MagicMock, patch

_np = MagicMock()
_np.frombuffer = MagicMock(return_value=b'')
_np.uint8 = 'uint8'
_np.zeros = MagicMock(return_value=MagicMock(shape=(100, 100, 3)))
_np.array = MagicMock(side_effect=lambda x, **kw: x)

for _mod in (
    'win32gui', 'win32api', 'win32con', 'win32ui', 'cv2', 'numpy',
    'paddleocr', 'uiautomator2',
):
    sys.modules.setdefault(_mod, _np if _mod == 'numpy' else MagicMock())

import unittest

from recognition.fallback import build_fallback_specs
from recognition.last_known import LastKnownCache
from recognition.matchers.roi import parse_bgr_color, expand_roi
from recognition.position_utils import default_position_to_rects
from recognition.router import MatcherRouter
from recognition.types import LAST_KNOWN_TTL_FRAMES, Rect, SymbolSpec, TaskPausedError
from recognition.frame import FrameContext


class TestBuildFallbackSpecs(unittest.TestCase):
    def test_type_only_uses_base_target(self):
        base = SymbolSpec(type='template', target='btn.bmp', fallback=['feature'])
        chain = build_fallback_specs(base)
        self.assertEqual(len(chain), 1)
        self.assertEqual(chain[0].type, 'feature')
        self.assertEqual(chain[0].target, 'btn.bmp')

    def test_type_with_path(self):
        base = SymbolSpec(type='template', target='a.bmp', fallback=['template|b.bmp'])
        chain = build_fallback_specs(base)
        self.assertEqual(chain[0].type, 'template')
        self.assertEqual(chain[0].target, 'b.bmp')

    def test_respects_max_fallback_steps(self):
        base = SymbolSpec(
            type='template',
            target='a.bmp',
            fallback=['feature', 'color', 'ocr'],
            max_fallback_steps=1,
        )
        self.assertEqual(len(build_fallback_specs(base)), 1)


class TestLastKnownCache(unittest.TestCase):
    def test_ttl_expires(self):
        cache = LastKnownCache(ttl_frames=2)
        rect = Rect(index=0, x1=1, y1=2, x2=3, y2=4)
        cache.put('k', [rect], frame_id=1)
        self.assertEqual(len(cache.get('k', frame_id=2)), 1)
        self.assertEqual(len(cache.get('k', frame_id=4)), 0)


class TestLastResort(unittest.TestCase):
    def test_default_position(self):
        router = MatcherRouter()
        frame = FrameContext(image=_np.zeros((100, 100, 3)), captured_at=0.0, frame_id=1)
        spec = SymbolSpec(type='template', target='x', last_resort='default_position')

        class Ev:
            default_position = [[10, 20], [30, 40]]

        with patch.object(router, '_resolve_l1', return_value=[]):
            results = router.resolve_for_action(frame, spec, event=Ev())
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].source, 'default')

    def test_pause_raises(self):
        router = MatcherRouter()
        frame = FrameContext(image=_np.zeros((100, 100, 3)), captured_at=0.0, frame_id=1)
        spec = SymbolSpec(type='template', target='x', last_resort='pause')
        with patch.object(router, '_resolve_l1', return_value=[]):
            with self.assertRaises(TaskPausedError):
                router.resolve_for_action(frame, spec)

    def test_last_known_fallback(self):
        router = MatcherRouter()
        frame = FrameContext(image=_np.zeros((100, 100, 3)), captured_at=0.0, frame_id=3)
        spec = SymbolSpec(type='template', target='btn', last_resort='last_known')
        rect = Rect(index=0, x1=1, y1=2, x2=3, y2=4, score=0.9)
        router.last_known.put(spec.last_known_key(), [rect], frame_id=2)
        with patch.object(router, '_resolve_l1', return_value=[]):
            results = router.resolve_for_action(frame, spec)
        self.assertEqual(len(results), 1)


class TestFallbackChain(unittest.TestCase):
    def test_tries_fallback_after_primary_miss(self):
        router = MatcherRouter()
        frame = FrameContext(image=_np.zeros((100, 100, 3)), captured_at=0.0, frame_id=1)
        spec = SymbolSpec(type='template', target='a.bmp', fallback=['color'])
        color_rect = Rect(index=0, x1=5, y1=5, x2=15, y2=15, source='color')

        with patch.object(router._matchers['template'], 'match', return_value=[]):
            with patch.object(router._matchers['color'], 'match', return_value=[color_rect]):
                results = router.resolve_for_action(frame, spec)
        self.assertEqual(results[0].source, 'color')


class TestParseHelpers(unittest.TestCase):
    def test_parse_hex_color(self):
        self.assertEqual(parse_bgr_color('#FF0000'), (0, 0, 255))

    def test_expand_roi(self):
        expanded = expand_roi([10, 10, 50, 50], 5, (100, 100))
        self.assertEqual(expanded, [5, 5, 55, 55])

    def test_default_position_pairs(self):
        rects = default_position_to_rects([[10, 20], [30, 40]])
        self.assertEqual(rects[0].x1, 10)
        self.assertEqual(rects[0].x2, 30)


class TestOptionalMatchersMissing(unittest.TestCase):
    def test_ocr_without_dependency_returns_empty(self):
        from recognition.matchers.ocr import OcrMatcher
        matcher = OcrMatcher()
        matcher._engine = None
        matcher._warned_missing = True
        frame = FrameContext(image=_np.zeros((50, 50, 3)), captured_at=0.0, frame_id=1)
        spec = SymbolSpec(type='ocr', target='test', roi=[0, 0, 50, 50])
        with patch.dict(sys.modules, {'paddleocr': None}):
            self.assertEqual(matcher.match(frame, spec), [])


if __name__ == '__main__':
    unittest.main()
