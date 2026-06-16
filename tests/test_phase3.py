import io
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

_np = MagicMock()
_np.frombuffer = MagicMock(return_value=b'')
_np.uint8 = 'uint8'
_np.zeros = MagicMock(return_value=MagicMock(shape=(100, 100, 3)))

for _mod in (
    'win32gui', 'win32api', 'win32con', 'win32ui', 'cv2', 'numpy',
    'paddleocr', 'uiautomator2', 'fastapi', 'fastapi.middleware', 'fastapi.responses',
    'starlette', 'starlette.websockets', 'uvicorn',
):
    sys.modules.setdefault(_mod, _np if _mod == 'numpy' else MagicMock())

try:
    import yaml
except ImportError:
    yaml = None

import paths
from config import load_config
from freer_api.validate import validate_event, validate_events
from freer_api.tree import build_event_tree
from freer_api.export_import import export_package, import_package


class TestValidate(unittest.TestCase):
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

    def test_detects_missing_action(self):
        result = validate_event({
            'name': '微事件A',
            'event_type': 1,
            'action': '不存在',
        }, index={})
        self.assertFalse(result['valid'])
        codes = [i['code'] for i in result['issues']]
        self.assertIn('missing_action_ref', codes)

    def test_detects_cycle(self):
        index = {
            'A': {'name': 'A', 'event_type': 0, 'event_list': [{'event': 'B'}], 'exception_list': []},
            'B': {'name': 'B', 'event_type': 0, 'event_list': [{'event': 'A'}], 'exception_list': []},
        }
        result = validate_event(index['A'], index=index)
        self.assertFalse(result['valid'])
        self.assertTrue(any(i['code'] == 'cycle_detected' for i in result['issues']))

    def test_invalid_roi(self):
        result = validate_event({
            'name': 'x',
            'event_type': 1,
            'action': 'a',
            'roi_start': [10, 20, 5, 30],
        }, index={})
        self.assertFalse(result['valid'])


class TestEventTree(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        root = Path(self._tmpdir.name)
        data_dir = root / 'data'
        data_dir.mkdir()
        events = [
            {
                'name': '根',
                'event_type': 0,
                'event_list': [{'event': '子', 'should_run_time': 1, 'max_run_time': 1}],
                'exception_list': ['异'],
            },
            {'name': '子', 'event_type': 1, 'action': '点'},
            {'name': '异', 'event_type': 1, 'action': '点', 'is_exception': True},
        ]
        actions = [{
            'name': '点',
            'platform': 'windows',
            'run_time': 1,
            'gap': [0.1, 0.2],
            'steps': [{'op': 'click', 'pos': 0}],
        }]
        (data_dir / 'event.json').write_text(json.dumps(events, ensure_ascii=False), encoding='utf-8')
        (data_dir / 'action.json').write_text(json.dumps(actions, ensure_ascii=False), encoding='utf-8')
        paths.PROJECT_ROOT = root
        paths.CONFIG_PATH = root / 'config.yaml'
        load_config(paths.CONFIG_PATH, reload=True)
        paths.refresh_paths()

    def test_build_tree(self):
        tree = build_event_tree('根')
        self.assertEqual(tree['name'], '根')
        self.assertEqual(len(tree['children']), 1)
        self.assertEqual(tree['children'][0]['name'], '子')
        self.assertEqual(len(tree['exceptions']), 1)


class TestFreerApiV11(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        root = Path(self._tmpdir.name)
        data_dir = root / 'data'
        img_dir = root / 'img'
        data_dir.mkdir()
        img_dir.mkdir()
        events = [{
            'name': '测试根事件',
            'event_type': 0,
            'window_name': 'w',
            'symbol_start': None,
            'event_list': [],
            'exception_list': [],
            'max_rotate_time': 5,
            'id': 1,
        }]
        (data_dir / 'event.json').write_text(json.dumps(events, ensure_ascii=False), encoding='utf-8')
        (data_dir / 'action.json').write_text('[]', encoding='utf-8')
        cfg_path = root / 'config.yaml'
        if yaml is not None:
            with open(cfg_path, 'w', encoding='utf-8') as f:
                yaml.safe_dump({'data_dir': 'data', 'img_dir': 'img', 'api': {'port': 17891}}, f)
        paths.PROJECT_ROOT = root
        paths.CONFIG_PATH = cfg_path
        load_config(cfg_path, reload=True)
        paths.refresh_paths()

    def _client(self):
        from fastapi.testclient import TestClient
        from freer_api.app import create_app
        return TestClient(create_app())

    def test_health_v11(self):
        resp = self._client().get('/health')
        self.assertEqual(resp.json()['data']['api_version'], '1.1.0')

    def test_validate_endpoint(self):
        resp = self._client().post('/events/validate', json={})
        self.assertTrue(resp.json()['ok'])

    def test_event_tree_endpoint(self):
        resp = self._client().get('/events/测试根事件/tree')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['data']['name'], '测试根事件')

    def test_get_event_by_name(self):
        resp = self._client().get('/events/测试根事件')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['data']['name'], '测试根事件')

    def test_screenshot_not_found(self):
        resp = self._client().get('/screenshot')
        self.assertEqual(resp.status_code, 404)

    def test_pause_without_task(self):
        resp = self._client().post('/task/pause')
        self.assertEqual(resp.status_code, 409)

    def test_preview_without_capture(self):
        resp = self._client().post('/recognize/preview', json={
            'symbol': '../img/test.bmp',
            'use_capture': False,
        })
        self.assertTrue(resp.json()['ok'])
        self.assertEqual(resp.json()['data']['rects'], [])

    def test_export_import_roundtrip(self):
        client = self._client()
        exported = client.post('/export', json={})
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(exported.headers['content-type'], 'application/zip')

        resp = client.post(
            '/import',
            files={'file': ('pack.zip', exported.content, 'application/zip')},
            data={'mode': 'replace'},
        )
        self.assertTrue(resp.json()['ok'])
        self.assertEqual(resp.json()['data']['imported_events'], 1)


class TestExportImport(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        root = Path(self._tmpdir.name)
        data_dir = root / 'data'
        data_dir.mkdir()
        (data_dir / 'event.json').write_text(json.dumps([{'name': 'E', 'event_type': 1, 'action': 'A'}]), encoding='utf-8')
        (data_dir / 'action.json').write_text(json.dumps([{'name': 'A', 'action_type': 1}]), encoding='utf-8')
        paths.PROJECT_ROOT = root
        paths.CONFIG_PATH = root / 'config.yaml'
        paths.refresh_paths()

    def test_zip_contains_manifest(self):
        data = export_package()
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            manifest = json.loads(zf.read('manifest.json'))
            self.assertEqual(manifest['format'], 'freer-export')


if __name__ == '__main__':
    unittest.main()
