import sys
import unittest
from unittest.mock import MagicMock, patch

for _mod in (
    'win32gui', 'win32api', 'win32con', 'win32ui', 'cv2', 'numpy',
    'paddleocr', 'uiautomator2',
):
    sys.modules.setdefault(_mod, MagicMock())

from Control import ActionEx, _PointerSession


class TestResolvePointNoMutation(unittest.TestCase):
    def test_does_not_mutate_position_slot(self):
        position = [[1, 10, 20, 30, 40]]
        original = list(position[0])
        with patch('Control.EventEx.GetRandomPosition', return_value=[[15, 25]]):
            pt = ActionEx._resolve_point(position, 0)
        self.assertEqual(pt, (15, 25))
        self.assertEqual(position[0], original)


class TestPointerSession(unittest.TestCase):
    def setUp(self):
        self.position = [
            [0, 0, 0, 100, 100],
            [1, 200, 200, 300, 300],
        ]
        self.session = _PointerSession()
        self.resolve_values = {(0, 0, 0, 100, 100): (50, 50), (1, 200, 200, 300, 300): (250, 250)}

    def _fake_resolve(self, position, pos_index):
        slot = tuple(position[pos_index])
        return self.resolve_values.get(slot)

    def test_down_move_up_same_pos_reuses_locked_point(self):
        with patch.object(ActionEx, '_resolve_point', side_effect=self._fake_resolve):
            down = ActionEx._resolve_pointer_point(
                self.position, {'op': 'pointer_down', 'pos': 0}, self.session, 'pointer_down',
            )
            move = ActionEx._resolve_pointer_point(
                self.position, {'op': 'pointer_move', 'pos': 0}, self.session, 'pointer_move',
            )
            up = ActionEx._resolve_pointer_point(
                self.position, {'op': 'pointer_up', 'pos': 0}, self.session, 'pointer_up',
            )
        self.assertEqual(down, (50, 50))
        self.assertEqual(move, (50, 50))
        self.assertEqual(up, (50, 50))

    def test_move_to_different_pos_updates_session(self):
        with patch.object(ActionEx, '_resolve_point', side_effect=self._fake_resolve):
            ActionEx._resolve_pointer_point(
                self.position, {'op': 'pointer_down', 'pos': 0}, self.session, 'pointer_down',
            )
            move = ActionEx._resolve_pointer_point(
                self.position, {'op': 'pointer_move', 'pos': 1}, self.session, 'pointer_move',
            )
            up = ActionEx._resolve_pointer_point(
                self.position, {'op': 'pointer_up', 'pos': 1}, self.session, 'pointer_up',
            )
        self.assertEqual(move, (250, 250))
        self.assertEqual(up, (250, 250))

    def test_execute_step_windows_pointer_chain_calls_same_coords(self):
        calls = []
        session = _PointerSession()

        def record_down(x, y, hwnd, button='left'):
            calls.append(('down', x, y))

        def record_move(x, y, hwnd):
            calls.append(('move', x, y))

        def record_up(x, y, hwnd, button='left'):
            calls.append(('up', x, y))

        with patch.object(ActionEx, '_resolve_point', return_value=(77, 88)):
            with patch('Control.Tools.WindowsAction.pointer_down', side_effect=record_down):
                with patch('Control.Tools.WindowsAction.pointer_move', side_effect=record_move):
                    with patch('Control.Tools.WindowsAction.pointer_up', side_effect=record_up):
                        with patch('Control.Tools.RandomTool.getRandomGap', return_value=0):
                            for op in ('pointer_down', 'pointer_move', 'pointer_up'):
                                ActionEx.execute_step(
                                    {'op': op, 'pos': 0},
                                    self.position, None, [0, 0], 'windows', session,
                                )
        self.assertEqual(calls, [
            ('down', 77, 88),
            ('move', 77, 88),
            ('up', 77, 88),
        ])
        self.assertFalse(session.active)


if __name__ == '__main__':
    unittest.main()
