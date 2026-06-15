import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

_np = MagicMock()
_np.frombuffer = MagicMock(return_value=b'')
_np.uint8 = 'uint8'
_np.zeros = MagicMock(return_value=MagicMock(shape=(100, 100, 3)))

for _mod in (
    'win32gui', 'win32api', 'win32con', 'win32ui', 'cv2', 'numpy',
    'paddleocr', 'uiautomator2',
):
    sys.modules.setdefault(_mod, _np if _mod == 'numpy' else MagicMock())

try:
    import yaml
except ImportError:
    yaml = None

import paths
from config import load_config, save_config, FreerConfig, ApiConfig, RecognitionConfig
from serialization import sanitize_event_dict, sanitize_child_entry


class TestConfig(unittest.TestCase):
    def test_load_defaults_without_file(self):
        load_config(config_path=Path('/nonexistent/config.yaml'), reload=True)
        cfg = load_config(config_path=Path('/nonexistent/config.yaml'))
        self.assertEqual(cfg.adb_device, 'emulator-5554')
        self.assertEqual(cfg.data_dir, 'data')

    @unittest.skipIf(yaml is None, 'PyYAML not installed')
    def test_save_and_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg_path = Path(tmp) / 'config.yaml'
            cfg = FreerConfig(adb_device='test-device', data_dir='custom_data')
            save_config(cfg, cfg_path)
            loaded = load_config(cfg_path, reload=True)
            self.assertEqual(loaded.adb_device, 'test-device')
            self.assertEqual(loaded.data_dir, 'custom_data')


class TestSerialization(unittest.TestCase):
    def test_strips_runtime_fields_from_child(self):
        entry = sanitize_child_entry({
            'event': 'child',
            'should_run_time': 2,
            'max_run_time': 3,
            'has_run_time': 5,
            'hwnd': 1,
        })
        self.assertEqual(entry['has_run_time'], 0)
        self.assertNotIn('hwnd', entry)

    def test_grand_event_runtime_symbol_start_cleared(self):
        cleaned = sanitize_event_dict({
            'name': 'macro',
            'event_type': 0,
            'window_name': 'w',
            'symbol_start': 'a.bmp|b.bmp',
            'event_list': [],
            'exception_list': [],
            'has_rotate_time': 3,
        })
        self.assertIsNone(cleaned.get('symbol_start'))
        self.assertNotIn('has_rotate_time', cleaned)


class TestPathsFromConfig(unittest.TestCase):
    @unittest.skipIf(yaml is None, 'PyYAML not installed')
    def test_refresh_paths_uses_config_data_dir(self):
        original_root = paths.PROJECT_ROOT
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                cfg_path = root / 'config.yaml'
                data_dir = root / 'alt_data'
                data_dir.mkdir()
                (data_dir / 'event.json').write_text('[]', encoding='utf-8')
                (data_dir / 'action.json').write_text('[]', encoding='utf-8')
                with open(cfg_path, 'w', encoding='utf-8') as f:
                    yaml.safe_dump({'data_dir': 'alt_data'}, f)
                paths.PROJECT_ROOT = root
                paths.CONFIG_PATH = cfg_path
                load_config(cfg_path, reload=True)
                paths.refresh_paths()
                self.assertEqual(paths.DATA_DIR.resolve(), data_dir.resolve())
        finally:
            paths.PROJECT_ROOT = original_root
            paths.refresh_paths()


class TestFreerApi(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        root = Path(self._tmpdir.name)
        data_dir = root / 'data'
        data_dir.mkdir()
        event = [{
            'name': '测试根事件',
            'event_type': 0,
            'window_name': '雷电模拟器|TheRender',
            'symbol_start': None,
            'symbol_finish': None,
            'accuracy': 0.85,
            'max_suc_run_time': 5,
            'is_exception': False,
            'event_list': [],
            'exception_list': [],
            'max_rotate_time': 5,
            'id': 1,
        }]
        (data_dir / 'event.json').write_text(json.dumps(event, ensure_ascii=False), encoding='utf-8')
        (data_dir / 'action.json').write_text('[]', encoding='utf-8')
        cfg_path = root / 'config.yaml'
        if yaml is not None:
            with open(cfg_path, 'w', encoding='utf-8') as f:
                yaml.safe_dump({'data_dir': 'data', 'api': {'port': 17891}}, f)
        paths.PROJECT_ROOT = root
        paths.CONFIG_PATH = cfg_path
        load_config(cfg_path, reload=True)
        paths.refresh_paths()

    def test_health_and_events(self):
        from fastapi.testclient import TestClient
        from freer_api.app import create_app

        client = TestClient(create_app())
        health = client.get('/health')
        self.assertEqual(health.status_code, 200)
        self.assertTrue(health.json()['ok'])

        events = client.get('/events')
        self.assertEqual(events.status_code, 200)
        self.assertEqual(events.json()['data'][0]['name'], '测试根事件')

    def test_task_start_unknown_event(self):
        from fastapi.testclient import TestClient
        from freer_api.app import create_app

        client = TestClient(create_app())
        resp = client.post('/task/start', json={'event_name': '不存在', 'repeat_time': 1})
        self.assertEqual(resp.status_code, 404)
        self.assertFalse(resp.json()['ok'])


if __name__ == '__main__':
    unittest.main()
