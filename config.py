from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

import paths

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None


@dataclass
class ApiConfig:
    host: str = '127.0.0.1'
    port: int = 17890


@dataclass
class RecognitionConfig:
    max_consecutive_miss_frames: int = 30
    last_known_ttl_frames: int = 3


@dataclass
class FreerConfig:
    adb_device: str = 'emulator-5554'
    data_dir: str = 'data'
    img_dir: str = 'img'
    capture_mode: str = 'adb_pipe'
    log_level: str = 'INFO'
    log_dir: str = 'logs'
    api: ApiConfig = field(default_factory=ApiConfig)
    recognition: RecognitionConfig = field(default_factory=RecognitionConfig)


_config: Optional[FreerConfig] = None


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _defaults_dict() -> Dict[str, Any]:
    return {
        'adb_device': 'emulator-5554',
        'data_dir': 'data',
        'img_dir': 'img',
        'capture_mode': 'adb_pipe',
        'log_level': 'INFO',
        'log_dir': 'logs',
        'api': {'host': '127.0.0.1', 'port': 17890},
        'recognition': {
            'max_consecutive_miss_frames': 30,
            'last_known_ttl_frames': 3,
        },
    }


def _dict_to_config(data: Dict[str, Any]) -> FreerConfig:
    api_data = data.get('api', {})
    rec_data = data.get('recognition', {})
    return FreerConfig(
        adb_device=str(data.get('adb_device', 'emulator-5554')),
        data_dir=str(data.get('data_dir', 'data')),
        img_dir=str(data.get('img_dir', 'img')),
        capture_mode=str(data.get('capture_mode', 'adb_pipe')),
        log_level=str(data.get('log_level', 'INFO')),
        log_dir=str(data.get('log_dir', 'logs')),
        api=ApiConfig(
            host=str(api_data.get('host', '127.0.0.1')),
            port=int(api_data.get('port', 17890)),
        ),
        recognition=RecognitionConfig(
            max_consecutive_miss_frames=int(rec_data.get('max_consecutive_miss_frames', 30)),
            last_known_ttl_frames=int(rec_data.get('last_known_ttl_frames', 3)),
        ),
    )


def load_config(config_path: Optional[Path] = None, reload: bool = False) -> FreerConfig:
    global _config
    if _config is not None and not reload:
        return _config

    path = config_path or paths.CONFIG_PATH
    data = _defaults_dict()
    if path.exists() and yaml is not None:
        with open(path, 'r', encoding='utf-8') as f:
            raw = yaml.safe_load(f) or {}
        data = _deep_merge(data, raw)
    _config = _dict_to_config(data)
    return _config


def get_config() -> FreerConfig:
    return load_config()


def save_config(config: FreerConfig, config_path: Optional[Path] = None) -> None:
    global _config
    if yaml is None:
        raise RuntimeError('PyYAML is required to save config (pip install pyyaml)')
    path = config_path or paths.CONFIG_PATH
    payload = {
        'adb_device': config.adb_device,
        'data_dir': config.data_dir,
        'img_dir': config.img_dir,
        'capture_mode': config.capture_mode,
        'log_level': config.log_level,
        'log_dir': config.log_dir,
        'api': {'host': config.api.host, 'port': config.api.port},
        'recognition': {
            'max_consecutive_miss_frames': config.recognition.max_consecutive_miss_frames,
            'last_known_ttl_frames': config.recognition.last_known_ttl_frames,
        },
    }
    with open(path, 'w', encoding='utf-8') as f:
        yaml.safe_dump(payload, f, allow_unicode=True, sort_keys=False)
    _config = config
    paths.refresh_paths()
