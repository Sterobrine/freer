"""Phase 5A — engine reliability tests."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_np = MagicMock()
_np.frombuffer = MagicMock()
_np.uint8 = 'uint8'

for _mod in (
    'win32gui', 'win32api', 'win32con', 'win32ui', 'cv2', 'numpy',
    'paddleocr', 'uiautomator2',
):
    sys.modules.setdefault(_mod, _np if _mod == 'numpy' else MagicMock())

import Models
from recognition.adb_text import escape_adb_input_text


def _load_validate_event():
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
    return validate_mod.validate_event


def _load_task_runner():
    spec = importlib.util.spec_from_file_location(
        'freer_api.task_runner', ROOT / 'freer_api' / 'task_runner.py',
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.TaskRunner


validate_event = _load_validate_event()


class TestRecoverExceptionMicro(unittest.TestCase):
    def test_micro_exception_restores_parent_inactive(self):
        import Control

        child_entry = {
            'event': Models.MicroEvent(name='child'),
            'should_run_time': 1,
            'max_run_time': 1,
            'has_run_time': 1,
        }
        parent = Models.GrandEvent(name='parent')
        parent.event_list = []
        parent.inactive_list = [child_entry]

        exc_micro = Models.MicroEvent(name='exc', is_exception=True)
        exc_micro.event_type = 1

        ex = Control.EventEx.__new__(Control.EventEx)
        ex.stack = [parent, exc_micro]
        ex.cursor = exc_micro

        ex.RecoverExceptionEvent()

        self.assertEqual(len(parent.inactive_list), 0)
        self.assertEqual(len(parent.event_list), 1)
        self.assertEqual(parent.event_list[0]['has_run_time'], 0)

    def test_macro_exception_still_restores_own_inactive(self):
        import Control

        child_entry = {
            'event': Models.MicroEvent(name='child'),
            'should_run_time': 1,
            'max_run_time': 1,
            'has_run_time': 1,
        }
        exc_macro = Models.GrandEvent(name='exc', is_exception=True)
        exc_macro.inactive_list = [child_entry]
        exc_macro.event_list = []

        ex = Control.EventEx.__new__(Control.EventEx)
        ex.stack = [exc_macro]
        ex.cursor = exc_macro

        ex.RecoverExceptionEvent()

        self.assertEqual(len(exc_macro.inactive_list), 0)
        self.assertEqual(len(exc_macro.event_list), 1)


class TestTaskTerminalStatus(unittest.TestCase):
    def test_paused_end_reason_maps_to_error_status(self):
        TaskRunner = _load_task_runner()

        runner = TaskRunner()
        mock_ex = MagicMock()
        mock_ex._stop_requested = False
        mock_ex._end_reason = 'paused'
        mock_ex._end_message = '未找到窗口: test'
        mock_ex.GetEventRoute.return_value = 'root'

        with patch('Control.EventEx', return_value=mock_ex):
            runner.start('root', 1)
            runner.wait(timeout=2)

        snap = runner.snapshot()
        self.assertEqual(snap['status'], 'error')
        self.assertIn('未找到窗口', snap['error'] or '')


class TestAdbTextEscape(unittest.TestCase):
    def test_space_and_percent(self):
        self.assertEqual(escape_adb_input_text('a b'), 'a%sb')
        self.assertEqual(escape_adb_input_text('100%'), '100%')

    def test_shell_metachar(self):
        self.assertIn('\\', escape_adb_input_text('a&b'))


class TestValidateMissingRef(unittest.TestCase):
    def setUp(self):
        import json
        import tempfile
        import paths as paths_mod

        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        root = Path(self._tmpdir.name)
        data_dir = root / 'data'
        data_dir.mkdir()
        (data_dir / 'event.json').write_text('[]', encoding='utf-8')
        (data_dir / 'action.json').write_text('[]', encoding='utf-8')
        paths_mod.PROJECT_ROOT = root
        paths_mod.CONFIG_PATH = root / 'config.yaml'
        paths_mod.refresh_paths()

    def test_macro_child_missing_is_invalid(self):

        macro = {
            'name': 'root',
            'event_type': 0,
            'event_list': [{'event': 'missing-child'}],
            'exception_list': [],
        }
        result = validate_event(macro, index={'root': macro}, check_assets=False)
        self.assertFalse(result['valid'])
        codes = [i['code'] for i in result['issues']]
        self.assertIn('missing_event_ref', codes)


class TestColdEventRunTime(unittest.TestCase):
    def test_run_time_never_negative(self):
        import Control

        parent = Models.GrandEvent(name='parent')
        parent.event_list = []
        parent.exception_list = []
        parent.inactive_list = []
        child = Models.MicroEvent(name='child')
        ex = Control.EventEx.__new__(Control.EventEx)
        ex.stack = [parent, child]
        ex.cursor = child
        ex.pre_cursor = child
        ex.run_time = 0
        ex.router = MagicMock()
        ex.router.last_known.clear = MagicMock()

        child.max_suc_run_time = 1
        ex.EventIsCold = MagicMock(return_value=True)
        ex.AddNextEvent = MagicMock(return_value=False)
        ex.EventIsFinish = MagicMock(return_value=False)
        ex.CountAndClearRedundant = MagicMock()
        ex.RecoverExceptionEvent = MagicMock()

        ex.ColdEventCape()
        self.assertGreaterEqual(ex.run_time, 0)


if __name__ == '__main__':
    unittest.main()
