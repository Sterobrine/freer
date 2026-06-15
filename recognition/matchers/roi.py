from typing import List, Tuple, Optional

import numpy as np


def crop_roi(image: np.ndarray, roi: List[int]) -> Tuple[np.ndarray, int, int]:
    x1, y1, x2, y2 = roi
    h, w = image.shape[:2]
    x1 = max(0, min(x1, w - 1))
    y1 = max(0, min(y1, h - 1))
    x2 = max(x1 + 1, min(x2, w))
    y2 = max(y1 + 1, min(y2, h))
    return image[y1:y2, x1:x2], x1, y1


def expand_roi(roi: List[int], px: int, image_shape: Tuple[int, int]) -> List[int]:
    h, w = image_shape[:2]
    x1, y1, x2, y2 = roi
    return [
        max(0, x1 - px),
        max(0, y1 - px),
        min(w, x2 + px),
        min(h, y2 + px),
    ]


def parse_bgr_color(target: str) -> Tuple[int, int, int]:
    target = target.strip()
    if target.startswith('#'):
        hex_color = target[1:]
        if len(hex_color) == 6:
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            return b, g, r
    parts = [int(p.strip()) for p in target.split(',')]
    if len(parts) >= 3:
        r, g, b = parts[0], parts[1], parts[2]
        return b, g, r
    raise ValueError(f'无法解析颜色目标: {target}')


def color_tolerance(accuracy: float) -> int:
    return max(5, int((1.0 - accuracy) * 64))
