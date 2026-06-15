from typing import Any, List, Optional

from recognition.types import MATCH_TYPES, ROI_EXPAND_PX, SymbolSpec


def _coerce_symbol_dict(data: dict, accuracy: float) -> SymbolSpec:
    fallback = data.get('fallback')
    if isinstance(fallback, str):
        fallback = [s.strip() for s in fallback.split('|') if s.strip()]
    return SymbolSpec(
        type=data.get('type', 'template'),
        target=str(data.get('target', '')),
        accuracy=float(data.get('accuracy', accuracy)),
        roi=data.get('roi'),
        index=int(data.get('index', 0)),
        fallback=fallback,
        last_resort=str(data.get('last_resort', 'none')),
        roi_expand_px=int(data.get('roi_expand_px', ROI_EXPAND_PX)),
        fallback_accuracy_delta=float(data.get('fallback_accuracy_delta', 0.05)),
        max_fallback_steps=int(data.get('max_fallback_steps', 2)),
    )


def parse_symbol(
    value: Any,
    accuracy: float = 0.85,
    *,
    kind: str = 'start',
    event: Any = None,
) -> SymbolSpec:
    """Parse legacy strings, object format, or flat event fields into SymbolSpec."""
    if event is not None:
        flat_type = getattr(event, f'match_type_{kind}', None)
        flat_roi = getattr(event, f'roi_{kind}', None)
        flat_fallback = getattr(event, f'match_fallback_{kind}', None)
        flat_index = getattr(event, f'index_{kind}', None)
        flat_last_resort = getattr(event, f'last_resort_{kind}', None)
        if flat_type is not None:
            fb = None
            if flat_fallback:
                fb = [s.strip() for s in str(flat_fallback).split('|') if s.strip()]
            return SymbolSpec(
                type=str(flat_type),
                target=str(value) if value is not None else '',
                accuracy=accuracy,
                roi=flat_roi,
                index=int(flat_index or 0),
                fallback=fb,
                last_resort=str(flat_last_resort or 'none'),
            )

    if isinstance(value, dict):
        return _coerce_symbol_dict(value, accuracy)

    if value is None:
        return SymbolSpec(type='template', target='', accuracy=accuracy)

    return SymbolSpec(type='template', target=str(value), accuracy=accuracy)
