from typing import List, Optional, Tuple

from recognition.frame import FrameContext
from recognition.matchers.base import BaseMatcher
from recognition.types import Rect, SymbolSpec


def _parse_ui_target(target: str) -> Tuple[str, str]:
    if target.startswith('resourceId:'):
        return 'resourceId', target.split(':', 1)[1].strip()
    if target.startswith('desc:'):
        return 'desc', target.split(':', 1)[1].strip()
    if target.startswith('text:'):
        return 'text', target.split(':', 1)[1].strip()
    return 'text', target.strip()


class UiMatcher(BaseMatcher):
    _device = None
    _warned_missing = False

    def _get_device(self):
        if self._device is not None:
            return self._device
        try:
            import uiautomator2 as u2
            self._device = u2.connect()
            return self._device
        except ImportError:
            if not self._warned_missing:
                print('警告：未安装 uiautomator2，UI 识别已跳过（pip install uiautomator2）')
                self._warned_missing = True
            return None
        except Exception as exc:
            if not self._warned_missing:
                print(f'警告：uiautomator2 连接失败: {exc}')
                self._warned_missing = True
            return None

    def match(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        if not spec.target:
            return []

        device = self._get_device()
        if device is None:
            return []

        field, value = _parse_ui_target(spec.target)
        try:
            if field == 'resourceId':
                elem = device(resourceId=value)
            elif field == 'desc':
                elem = device(description=value)
            else:
                elem = device(text=value)
            if not elem.exists:
                return []
            bounds = elem.info.get('bounds', {})
            x1 = bounds.get('left', 0)
            y1 = bounds.get('top', 0)
            x2 = bounds.get('right', x1)
            y2 = bounds.get('bottom', y1)
        except Exception as exc:
            print(f'警告：UI 查询失败: {exc}')
            return []

        rect = Rect(
            index=0,
            x1=int(x1),
            y1=int(y1),
            x2=int(x2),
            y2=int(y2),
            score=1.0,
            source='ui',
        )
        if spec.roi is not None:
            clipped = self._clip_to_roi(rect, spec.roi)
            return [clipped] if clipped is not None else []
        return [rect]

    @staticmethod
    def _clip_to_roi(rect: Rect, roi: Optional[tuple]) -> Optional[Rect]:
        if roi is None:
            return rect
        rx1, ry1, rx2, ry2 = roi
        cx = (rect.x1 + rect.x2) // 2
        cy = (rect.y1 + rect.y2) // 2
        if rx1 <= cx < rx2 and ry1 <= cy < ry2:
            return rect
        return None
