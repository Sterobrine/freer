import sys
from unittest.mock import MagicMock, patch

_np = MagicMock()
_np.frombuffer = MagicMock(return_value=b'')
_np.uint8 = 'uint8'
_np.zeros = MagicMock(return_value=MagicMock(shape=(100, 100, 3)))

for _mod in (
    'win32gui', 'win32api', 'win32con', 'win32ui', 'cv2', 'numpy',
):
    sys.modules.setdefault(_mod, _np if _mod == 'numpy' else MagicMock())

import unittest

from recognition.parse import parse_symbol
from recognition.types import SymbolSpec, FINISH_DEBOUNCE_FRAMES, MAX_MATCH_MS_PER_FRAME
from recognition.matchers.template import nms_boxes
from recognition.frame import FrameContext
from recognition.router import MatcherRouter
from recognition.types import Rect


class TestParseSymbol(unittest.TestCase):
    def test_legacy_string_becomes_template(self):
        spec = parse_symbol('../img/a.bmp|../img/b.bmp', accuracy=0.9)
        self.assertEqual(spec.type, 'template')
        self.assertEqual(spec.target, '../img/a.bmp|../img/b.bmp')
        self.assertEqual(spec.accuracy, 0.9)

    def test_object_format(self):
        spec = parse_symbol({
            'type': 'template',
            'target': 'btn.bmp',
            'roi': [0, 0, 100, 100],
            'index': 1,
        })
        self.assertEqual(spec.index, 1)
        self.assertEqual(spec.roi, [0, 0, 100, 100])

    def test_flat_event_fields(self):
        class Ev:
            match_type_start = 'template'
            roi_start = [1, 2, 3, 4]
            match_fallback_start = 'feature|ocr'
            index_start = 2

        spec = parse_symbol('btn.bmp', accuracy=0.8, kind='start', event=Ev())
        self.assertEqual(spec.type, 'template')
        self.assertEqual(spec.roi, [1, 2, 3, 4])
        self.assertEqual(spec.fallback, ['feature', 'ocr'])
        self.assertEqual(spec.index, 2)


class TestNms(unittest.TestCase):
    def test_suppresses_overlapping_boxes(self):
        boxes = [(0, 0, 10, 10), (1, 1, 11, 11), (50, 50, 60, 60)]
        scores = [0.9, 0.85, 0.8]
        keep = nms_boxes(boxes, scores, iou_threshold=0.3)
        self.assertEqual(len(keep), 2)
        self.assertIn(0, keep)
        self.assertIn(2, keep)


class TestMatcherRouter(unittest.TestCase):
    def test_match_cache_avoids_duplicate_work(self):
        frame = FrameContext(image=_np.zeros((100, 100, 3)), captured_at=0.0)
        router = MatcherRouter()
        spec = SymbolSpec(type='template', target='btn.bmp', accuracy=0.85)
        cached_rects = [Rect(index=0, x1=1, y1=2, x2=3, y2=4, score=0.9)]
        with patch.object(router._matchers['template'], 'match', return_value=cached_rects) as mocked:
            first = router.resolve(frame, spec)
            second = router.resolve(frame, spec)
        mocked.assert_called_once()
        self.assertEqual(first, cached_rects)
        self.assertEqual(second, cached_rects)

    def test_frame_budget_returns_empty_when_exceeded(self):
        frame = FrameContext(
            image=_np.zeros((100, 100, 3)),
            captured_at=0.0,
            match_elapsed_ms=MAX_MATCH_MS_PER_FRAME,
        )
        router = MatcherRouter()
        spec = SymbolSpec(type='template', target='missing.bmp', accuracy=0.85)
        with patch.object(router._matchers['template'], 'match') as mocked:
            result = router.resolve(frame, spec)
        mocked.assert_not_called()
        self.assertEqual(result, [])


class TestFinishDebounce(unittest.TestCase):
    def test_requires_consecutive_frames(self):
        import Control

        ex = Control.EventEx.__new__(Control.EventEx)
        ex._finish_streak = 0
        ex._finish_debounce_frames = FINISH_DEBOUNCE_FRAMES
        ex.cursor = type('E', (), {'symbol_finish': None, 'event_type': 0, 'event_list': []})()

        calls = {'n': 0}

        def met():
            calls['n'] += 1
            return True

        ex._finish_condition_met = met
        self.assertFalse(ex.EventIsFinish())
        self.assertTrue(ex.EventIsFinish())


class TestPriorityOrdering(unittest.TestCase):
    def test_higher_priority_first(self):
        entries = [
            {'event': type('E', (), {'name': 'low'})(), 'priority': 1},
            {'event': type('E', (), {'name': 'high'})(), 'priority': 10},
            {'event': type('E', (), {'name': 'mid'})(), 'priority': 5},
        ]
        ordered = sorted(entries, key=lambda e: e.get('priority', 0), reverse=True)
        self.assertEqual(
            [e['event'].name for e in ordered],
            ['high', 'mid', 'low'],
        )


class TestAdbClient(unittest.TestCase):
    def test_screencap_raises_on_failure(self):
        from recognition.adb_client import AdbClient
        from recognition.types import AdbError

        client = AdbClient(device_id='test-device')
        with patch('recognition.adb_client.subprocess.run') as run:
            run.return_value = MagicMock(returncode=1, stdout=b'', stderr=b'offline')
            with self.assertRaises(AdbError) as ctx:
                client.screencap()
        self.assertIn('test-device', str(ctx.exception))


if __name__ == '__main__':
    unittest.main()
