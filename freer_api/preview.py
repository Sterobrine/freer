from typing import Any, Dict, List, Optional

from recognition.adb_client import AdbClient
from recognition.frame import FrameContext
from recognition.parse import parse_symbol
from recognition.router import MatcherRouter


def _rect_to_dict(rect) -> Dict[str, Any]:
    return {
        'index': rect.index,
        'x1': rect.x1,
        'y1': rect.y1,
        'x2': rect.x2,
        'y2': rect.y2,
        'score': rect.score,
        'source': rect.source,
    }


def recognize_preview(
    symbol: Any,
    *,
    accuracy: float = 0.85,
    kind: str = 'start',
    event_fields: Optional[Dict[str, Any]] = None,
    use_capture: bool = True,
) -> Dict[str, Any]:
    router = MatcherRouter()
    event_obj = _EventStub(event_fields or {})
    spec = parse_symbol(symbol, accuracy=accuracy, kind=kind, event=event_obj)

    frame = None
    capture_error = None
    if use_capture:
        try:
            frame = FrameContext.capture(AdbClient())
        except Exception as exc:
            capture_error = str(exc)

    rects: List = []
    if frame is not None:
        rects = router.resolve_for_action(frame, spec, event=event_obj)

    legacy = router.to_legacy_positions(rects)
    return {
        'spec': {
            'type': spec.type,
            'target': spec.target,
            'accuracy': spec.accuracy,
            'roi': spec.roi,
            'index': spec.index,
            'last_resort': spec.last_resort,
        },
        'rects': [_rect_to_dict(r) for r in rects],
        'positions': legacy,
        'frame_id': frame.frame_id if frame else None,
        'capture_error': capture_error,
    }


class _EventStub:
    """Minimal event-like object for parse_symbol flat fields."""

    def __init__(self, data: Dict[str, Any]):
        self._data = data

    def __getattr__(self, name: str):
        return self._data.get(name)
