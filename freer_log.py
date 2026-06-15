import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import List, Optional

import paths

_log_handlers: List[logging.Handler] = []
_broadcast_handlers: List['LogBroadcastHandler'] = []


class LogBroadcastHandler(logging.Handler):
    """Forward log records to WebSocket subscribers."""

    def __init__(self):
        super().__init__()
        self.subscribers: List = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            payload = {
                'level': record.levelname,
                'message': self.format(record),
                'logger': record.name,
                'time': record.created,
            }
            dead = []
            for queue in self.subscribers:
                try:
                    queue.put_nowait(payload)
                except Exception:
                    dead.append(queue)
            for queue in dead:
                if queue in self.subscribers:
                    self.subscribers.remove(queue)
        except Exception:
            self.handleError(record)


def setup_logging(level: Optional[str] = None, log_dir: Optional[Path] = None) -> logging.Logger:
    from config import get_config
    cfg = get_config()
    log_level = (level or cfg.log_level).upper()
    directory = log_dir or paths.LOG_DIR
    directory.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger('freer')
    if root.handlers:
        return root

    root.setLevel(log_level)
    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
    )

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    root.addHandler(console)
    _log_handlers.append(console)

    file_handler = RotatingFileHandler(
        directory / 'freer.log',
        maxBytes=2 * 1024 * 1024,
        backupCount=5,
        encoding='utf-8',
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)
    _log_handlers.append(file_handler)

    broadcast = LogBroadcastHandler()
    broadcast.setFormatter(formatter)
    root.addHandler(broadcast)
    _broadcast_handlers.append(broadcast)

    return root


def get_logger(name: str = 'freer') -> logging.Logger:
    if not logging.getLogger('freer').handlers:
        setup_logging()
    return logging.getLogger(name)


def get_broadcast_handler() -> Optional[LogBroadcastHandler]:
    return _broadcast_handlers[0] if _broadcast_handlers else None
