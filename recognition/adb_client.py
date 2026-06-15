import os
import subprocess
from typing import Optional

from recognition.types import AdbError


class AdbClient:
    """ADB wrapper with configurable device ID and return-code checks."""

    def __init__(self, device_id: Optional[str] = None):
        if device_id is None:
            try:
                from config import get_config
                device_id = get_config().adb_device
            except Exception:
                device_id = os.environ.get('FREER_ADB_DEVICE', 'emulator-5554')
        self.device_id = device_id

    def _base_cmd(self) -> list:
        return ['adb', '-s', self.device_id]

    def screencap(self) -> bytes:
        result = subprocess.run(
            self._base_cmd() + ['exec-out', 'screencap', '-p'],
            capture_output=True,
            timeout=15,
        )
        if result.returncode != 0:
            stderr = result.stderr.decode('utf-8', errors='replace').strip()
            raise AdbError(
                f'ADB 截屏失败 (device={self.device_id}, code={result.returncode}): {stderr}'
            )
        if not result.stdout:
            raise AdbError(f'ADB 截屏返回空数据 (device={self.device_id})')
        return result.stdout

    def input_text(self, text: str) -> None:
        result = subprocess.run(
            self._base_cmd() + ['shell', 'input', 'text', text],
            capture_output=True,
            timeout=10,
        )
        if result.returncode != 0:
            stderr = result.stderr.decode('utf-8', errors='replace').strip()
            raise AdbError(
                f'ADB 输入失败 (device={self.device_id}, code={result.returncode}): {stderr}'
            )
