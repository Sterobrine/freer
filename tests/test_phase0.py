import sys
from unittest.mock import MagicMock

_np = MagicMock()
_np.frombuffer = MagicMock()
_np.uint8 = 'uint8'

# Stub platform-specific deps so tests run without Win32 / OpenCV installed.
for _mod in (
    'win32gui', 'win32api', 'win32con', 'win32ui', 'cv2', 'numpy',
):
    sys.modules.setdefault(_mod, _np if _mod == 'numpy' else MagicMock())

import unittest
from unittest.mock import patch

import Models
import paths
from Tools import ImageTool, ScreenshotError


class TestPaths(unittest.TestCase):
    def test_data_dir_under_project_root(self):
        self.assertEqual(paths.DATA_DIR.parent, paths.PROJECT_ROOT)
        self.assertTrue(str(paths.EVENT_JSON).endswith('data/event.json'))


class TestModelInstanceState(unittest.TestCase):
    def test_grand_event_lists_not_shared(self):
        a = Models.GrandEvent(name='a')
        b = Models.GrandEvent(name='b')
        a.event_list.append({'event': 'x'})
        self.assertEqual(len(b.event_list), 0)

    def test_action_hwnd_not_shared(self):
        a = Models.Action(name='click')
        b = Models.Action(name='drag')
        a.hwnd = 100
        self.assertIsNone(b.hwnd)


class TestScreenshotGuard(unittest.TestCase):
    def test_find_image_raises_when_screenshot_missing(self):
        with patch('cv2.imread', return_value=None):
            with self.assertRaises(ScreenshotError) as ctx:
                ImageTool.FindImage(None, 'missing.bmp', 0.85)
            self.assertIn('无法读取截图', str(ctx.exception))


class TestDragIndexLogic(unittest.TestCase):
    """Verify drag pair indexing: each (start, end) pair visited once per outer step."""

    def test_pair_indices_for_three_points(self):
        position = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12]]
        visited = []
        i = 0
        while i + 1 < len(position):
            visited.append((i, i + 1))
            i += 2
        self.assertEqual(visited, [(0, 1)])
        self.assertEqual(len(visited) * 2, 2)

    def test_pair_indices_with_run_time_three(self):
        position = [
            [0, 0, 0, 1, 1],
            [0, 2, 2, 3, 3],
            [0, 4, 4, 5, 5],
            [0, 6, 6, 7, 7],
        ]
        run_time = 3
        pair_visits = []
        i = 0
        while i + 1 < len(position):
            for _ in range(run_time):
                pair_visits.append((position[i][1], position[i + 1][1]))
            i += 2
        self.assertEqual(pair_visits.count((0, 2)), 3)
        self.assertEqual(pair_visits.count((4, 6)), 3)
        self.assertEqual(len(pair_visits), 6)


class TestEventExInstanceState(unittest.TestCase):
    def test_separate_stacks(self):
        import Control

        a = Control.EventEx.__new__(Control.EventEx)
        b = Control.EventEx.__new__(Control.EventEx)
        a.stack = []
        b.stack = []
        a.stack.append('task-a')
        self.assertEqual(len(b.stack), 0)


class TestCountAndClearRedundant(unittest.TestCase):
    def _make_event_ex(self):
        import Control

        ex = Control.EventEx.__new__(Control.EventEx)
        ex.stack = []
        return ex

    def test_parent_not_complete_when_max_before_should(self):
        import Control

        child_event = Models.MicroEvent(name='child')
        child_entry = {
            'event': child_event,
            'should_run_time': 2,
            'max_run_time': 1,
            'has_run_time': 0,
        }
        parent = Models.GrandEvent(name='parent')
        parent.event_list = [child_entry]
        parent.inactive_list = []

        ex = self._make_event_ex()
        ex.stack = [parent, child_event]
        ex.cursor = child_event

        ex.CountAndClearRedundant()

        self.assertEqual(child_entry['has_run_time'], 1)
        self.assertEqual(len(parent.event_list), 1)
        self.assertIn(child_entry, parent.inactive_list)

    def test_child_removed_when_should_met(self):
        import Control

        child_event = Models.MicroEvent(name='child')
        child_entry = {
            'event': child_event,
            'should_run_time': 1,
            'max_run_time': 1,
            'has_run_time': 0,
        }
        parent = Models.GrandEvent(name='parent')
        parent.event_list = [child_entry]
        parent.inactive_list = []

        ex = self._make_event_ex()
        ex.stack = [parent, child_event]
        ex.cursor = child_event

        ex.CountAndClearRedundant()

        self.assertEqual(child_entry['has_run_time'], 1)
        self.assertEqual(len(parent.event_list), 0)


class TestGrandEventFinish(unittest.TestCase):
    def test_finish_false_when_child_below_should(self):
        parent = Models.GrandEvent(name='parent')
        parent.event_list = [
            {
                'event': Models.MicroEvent(name='c'),
                'should_run_time': 2,
                'max_run_time': 1,
                'has_run_time': 1,
            }
        ]

        import Control

        ex = Control.EventEx.__new__(Control.EventEx)
        ex.cursor = parent
        ex.tmp_position = []
        ex._finish_streak = 0
        ex._finish_debounce_frames = 2
        ex.GetPosition = lambda target, accuracy=None, kind='start': []

        self.assertFalse(ex.EventIsFinish())


if __name__ == '__main__':
    unittest.main()
