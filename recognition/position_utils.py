from typing import Any, List, Optional

from recognition.types import Rect


def default_position_to_rects(default_position: Any) -> List[Rect]:
    if not default_position:
        return []

    rects: List[Rect] = []
    idx = 0
    i = 0
    while i < len(default_position):
        p1 = default_position[i]
        if i + 1 >= len(default_position):
            break
        p2 = default_position[i + 1]
        if isinstance(p1, (list, tuple)) and isinstance(p2, (list, tuple)):
            rects.append(Rect(
                index=idx,
                x1=int(p1[0]),
                y1=int(p1[1]),
                x2=int(p2[0]),
                y2=int(p2[1]),
                score=1.0,
                source='default',
            ))
            i += 2
        else:
            if i + 3 < len(default_position):
                x1, y1, x2, y2 = default_position[i:i + 4]
                rects.append(Rect(
                    index=idx,
                    x1=int(x1),
                    y1=int(y1),
                    x2=int(x2),
                    y2=int(y2),
                    score=1.0,
                    source='default',
                ))
                i += 4
            else:
                break
        idx += 1
    return rects
