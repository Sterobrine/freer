import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

for _mod in (
    'win32gui', 'win32api', 'win32con', 'win32ui', 'cv2', 'numpy',
    'paddleocr', 'uiautomator2',
):
    sys.modules.setdefault(_mod, MagicMock())


def _load_freer_api_validate():
    """Load validate without freer_api/__init__.py (avoids FastAPI dependency)."""
    pkg = types.ModuleType('freer_api')
    sys.modules['freer_api'] = pkg

    store_spec = importlib.util.spec_from_file_location(
        'freer_api.store', ROOT / 'freer_api' / 'store.py',
    )
    store_mod = importlib.util.module_from_spec(store_spec)
    sys.modules['freer_api.store'] = store_mod
    store_spec.loader.exec_module(store_mod)
    pkg.store = store_mod

    validate_spec = importlib.util.spec_from_file_location(
        'freer_api.validate', ROOT / 'freer_api' / 'validate.py',
    )
    validate_mod = importlib.util.module_from_spec(validate_spec)
    sys.modules['freer_api.validate'] = validate_mod
    validate_spec.loader.exec_module(validate_mod)
    pkg.validate = validate_mod
    return validate_mod.validate_event


import paths

validate_event = _load_freer_api_validate()


class TestValidateActionContract(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        root = Path(self._tmpdir.name)
        data_dir = root / 'data'
        data_dir.mkdir()
        (data_dir / 'event.json').write_text('[]', encoding='utf-8')
        (data_dir / 'action.json').write_text('[]', encoding='utf-8')
        paths.PROJECT_ROOT = root
        paths.CONFIG_PATH = root / 'config.yaml'
        paths.refresh_paths()

    def _write_actions(self, actions):
        (paths.PROJECT_ROOT / 'data' / 'action.json').write_text(
            json.dumps(actions, ensure_ascii=False), encoding='utf-8',
        )

    def test_warns_insufficient_position_slots(self):
        self._write_actions([{
            'name': '拖拽',
            'platform': 'windows',
            'run_time': 1,
            'steps': [{'op': 'drag', 'from_pos': 0, 'to_pos': 1, 'duration': 1}],
        }])
        result = validate_event({
            'name': '微事件',
            'event_type': 1,
            'action': '拖拽',
            'symbol_start': 'only_one.bmp',
        }, index={})
        self.assertTrue(result['valid'])
        self.assertIn('insufficient_position_slots', [w['code'] for w in result['warnings']])

    def test_warns_missing_window_for_windows_action(self):
        self._write_actions([{
            'name': '点',
            'platform': 'windows',
            'run_time': 1,
            'steps': [{'op': 'click', 'pos': 0}],
        }])
        result = validate_event({
            'name': '微事件',
            'event_type': 1,
            'action': '点',
            'symbol_start': 'btn.bmp',
        }, index={})
        self.assertIn('missing_window_for_action', [w['code'] for w in result['warnings']])

    def test_warns_adb_action_with_window(self):
        self._write_actions([{
            'name': '点',
            'platform': 'adb',
            'run_time': 1,
            'steps': [{'op': 'tap', 'pos': 0}],
        }])
        result = validate_event({
            'name': '微事件',
            'event_type': 1,
            'action': '点',
            'symbol_start': 'btn.bmp',
            'window_name': '父|子',
        }, index={})
        self.assertIn('adb_action_with_window', [w['code'] for w in result['warnings']])

    def test_offset_swipe_needs_one_slot(self):
        self._write_actions([{
            'name': '滑',
            'platform': 'adb',
            'run_time': 1,
            'steps': [{'op': 'swipe', 'from_pos': 0, 'offset': [0, -100], 'duration': 0.3}],
        }])
        result = validate_event({
            'name': '微事件',
            'event_type': 1,
            'action': '滑',
            'symbol_start': 'ref.bmp',
        }, index={})
        slot_warnings = [w for w in result['warnings'] if w['code'] == 'insufficient_position_slots']
        self.assertEqual(slot_warnings, [])


if __name__ == '__main__':
    unittest.main()
