from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "data"
EVENT_JSON = DATA_DIR / "event.json"
ACTION_JSON = DATA_DIR / "action.json"
COUNT_JSON = DATA_DIR / "count.json"
SCREENSHOT_PATH = PROJECT_ROOT / "sc.bmp"
