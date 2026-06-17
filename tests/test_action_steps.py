import unittest

from action_steps import (
    event_position_slots,
    get_action_steps,
    sanitize_action_dict,
    steps_position_demand,
    summarize_steps,
)


class TestActionSteps(unittest.TestCase):
    def test_legacy_click_defaults_windows(self):
        cleaned = sanitize_action_dict({'name': 'x', 'action_type': 1, 'run_time': 1})
        self.assertEqual(cleaned['platform'], 'windows')
        self.assertEqual(cleaned['steps'], [{'op': 'click', 'pos': 0}])

    def test_adb_swipe(self):
        cleaned = sanitize_action_dict({
            'name': '滑',
            'platform': 'adb',
            'run_time': 1,
            'steps': [{'op': 'swipe', 'from_pos': 0, 'offset': [0, -100], 'duration': 0.3}],
        })
        self.assertEqual(cleaned['platform'], 'adb')
        self.assertEqual(cleaned['steps'][0]['op'], 'swipe')

    def test_windows_pointer_ops(self):
        steps = get_action_steps({
            'platform': 'windows',
            'steps': [
                {'op': 'pointer_down', 'pos': 0},
                {'op': 'wait', 'seconds': 0.5},
                {'op': 'pointer_up', 'pos': 0},
            ],
        })
        self.assertEqual(len(steps), 3)

    def test_rejects_adb_click(self):
        with self.assertRaises(ValueError):
            sanitize_action_dict({
                'name': 'bad',
                'platform': 'adb',
                'run_time': 1,
                'steps': [{'op': 'click', 'pos': 0}],
            })

    def test_summarize_includes_platform(self):
        text = summarize_steps([{'op': 'tap', 'pos': 0}], 'adb')
        self.assertIn('ADB', text)
        self.assertIn('点击', text)

    def test_steps_position_demand_drag(self):
        needs, max_idx = steps_position_demand([
            {'op': 'drag', 'from_pos': 0, 'to_pos': 1, 'duration': 1},
        ])
        self.assertTrue(needs)
        self.assertEqual(max_idx, 1)

    def test_steps_position_demand_swipe_with_offset(self):
        needs, max_idx = steps_position_demand([
            {'op': 'swipe', 'from_pos': 0, 'offset': [0, -100], 'duration': 0.3},
        ])
        self.assertTrue(needs)
        self.assertEqual(max_idx, 0)

    def test_event_position_slots_from_pipe_symbols(self):
        slots = event_position_slots({
            'symbol_start': 'a.bmp|b.bmp',
        })
        self.assertEqual(slots, 2)

    def test_event_position_slots_from_default_position(self):
        slots = event_position_slots({
            'default_position': [[10, 20], [30, 40], [50, 60], [70, 80]],
        })
        self.assertEqual(slots, 2)


if __name__ == '__main__':
    unittest.main()
