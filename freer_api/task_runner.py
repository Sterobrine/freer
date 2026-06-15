import threading
from typing import Any, Dict, Optional

import Control
from freer_log import get_logger

logger = get_logger('freer.task')


class TaskRunner:
    def __init__(self):
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._runner: Optional[Control.EventEx] = None
        self._status = 'idle'
        self._error: Optional[str] = None
        self._event_name: Optional[str] = None
        self._repeat_time = 1

    @property
    def status(self) -> str:
        return self._status

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                'status': self._status,
                'event_name': self._event_name,
                'repeat_time': self._repeat_time,
                'error': self._error,
            }

    def start(self, event_name: str, repeat_time: int = 1) -> Dict[str, Any]:
        with self._lock:
            if self._status == 'running':
                raise RuntimeError('任务正在运行中')
            self._status = 'running'
            self._error = None
            self._event_name = event_name
            self._repeat_time = repeat_time

        def _run():
            try:
                logger.info('任务启动: %s repeat=%s', event_name, repeat_time)
                runner = Control.EventEx(event_name, repeat_time)
                with self._lock:
                    self._runner = runner
                runner.Start()
                with self._lock:
                    if runner._stop_requested:
                        self._status = 'stopped'
                        logger.info('任务已停止: %s', event_name)
                    else:
                        self._status = 'completed'
                        logger.info('任务完成: %s', event_name)
            except Exception as exc:
                with self._lock:
                    self._status = 'error'
                    self._error = str(exc)
                logger.exception('任务异常: %s', event_name)
            finally:
                with self._lock:
                    self._runner = None

        self._thread = threading.Thread(target=_run, name='freer-task', daemon=True)
        self._thread.start()
        return self.snapshot()

    def stop(self) -> Dict[str, Any]:
        with self._lock:
            if self._runner is not None:
                self._runner.request_stop()
            if self._status == 'running':
                self._status = 'stopping'
            logger.info('任务停止请求')
        return self.snapshot()

    def wait(self, timeout: Optional[float] = None) -> bool:
        thread = self._thread
        if thread is None:
            return True
        thread.join(timeout)
        return not thread.is_alive()
