from pathlib import Path
import sys

def _project_root() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent

PROJECT_ROOT = _project_root()

DATA_DIR = PROJECT_ROOT / 'data'
IMG_DIR = PROJECT_ROOT / 'img'
LOG_DIR = PROJECT_ROOT / 'logs'
EVENT_JSON = DATA_DIR / 'event.json'
ACTION_JSON = DATA_DIR / 'action.json'
COUNT_JSON = DATA_DIR / 'count.json'
SCREENSHOT_PATH = PROJECT_ROOT / 'sc.bmp'
DEBUG_DIR = LOG_DIR / 'debug'
CONFIG_PATH = PROJECT_ROOT / 'config.yaml'


def refresh_paths() -> None:
    global DATA_DIR, IMG_DIR, LOG_DIR, EVENT_JSON, ACTION_JSON, COUNT_JSON, SCREENSHOT_PATH
    try:
        from config import get_config
        cfg = get_config()
        DATA_DIR = (PROJECT_ROOT / cfg.data_dir).resolve()
        IMG_DIR = (PROJECT_ROOT / cfg.img_dir).resolve()
        LOG_DIR = (PROJECT_ROOT / cfg.log_dir).resolve()
    except Exception:
        DATA_DIR = PROJECT_ROOT / 'data'
        IMG_DIR = PROJECT_ROOT / 'img'
        LOG_DIR = PROJECT_ROOT / 'logs'
    EVENT_JSON = DATA_DIR / 'event.json'
    ACTION_JSON = DATA_DIR / 'action.json'
    COUNT_JSON = DATA_DIR / 'count.json'
    SCREENSHOT_PATH = PROJECT_ROOT / 'sc.bmp'


refresh_paths()
