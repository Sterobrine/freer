from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

import paths
from recognition.frame import FrameContext
from recognition.matchers.base import BaseMatcher
from recognition.matchers.roi import crop_roi
from recognition.types import Rect, SymbolSpec


def _resolve_template_path(template_path: str) -> Path:
    raw = Path(template_path)
    if raw.is_absolute():
        return raw
    for base in (paths.PROJECT_ROOT, paths.PROJECT_ROOT.parent):
        candidate = (base / template_path).resolve()
        if candidate.exists():
            return candidate
    return (paths.PROJECT_ROOT / template_path.lstrip('./')).resolve()


def _load_template_bgr(template_path: str) -> np.ndarray:
    path = _resolve_template_path(template_path)
    template = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if template is None:
        raise FileNotFoundError(f'无法加载模板图像: {path}')
    return template


def _iou(a: Tuple[int, int, int, int], b: Tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def nms_boxes(
    boxes: List[Tuple[int, int, int, int]],
    scores: List[float],
    iou_threshold: float = 0.3,
) -> List[int]:
    if not boxes:
        return []
    order = sorted(range(len(boxes)), key=lambda i: scores[i], reverse=True)
    keep: List[int] = []
    while order:
        current = order.pop(0)
        keep.append(current)
        order = [
            idx for idx in order
            if _iou(boxes[current], boxes[idx]) < iou_threshold
        ]
    return keep


def _find_template_matches(
    image_bgr: np.ndarray,
    template_bgr: np.ndarray,
    accuracy: float,
    offset_x: int = 0,
    offset_y: int = 0,
    template_index: int = 0,
) -> List[Rect]:
    if template_bgr.shape[0] > image_bgr.shape[0] or template_bgr.shape[1] > image_bgr.shape[1]:
        return []

    if template_bgr.shape[2] == 4:
        template_bgr = cv2.cvtColor(template_bgr, cv2.COLOR_BGRA2BGR)
    search_img = image_bgr
    if search_img.shape[2] == 4:
        search_img = cv2.cvtColor(search_img, cv2.COLOR_BGRA2BGR)

    result = cv2.matchTemplate(search_img, template_bgr, cv2.TM_CCOEFF_NORMED)
    th, tw = template_bgr.shape[:2]
    ys, xs = np.where(result >= accuracy)
    boxes: List[Tuple[int, int, int, int]] = []
    scores: List[float] = []
    for x, y in zip(xs, ys):
        boxes.append((offset_x + x, offset_y + y, offset_x + x + tw, offset_y + y + th))
        scores.append(float(result[y, x]))

    rects: List[Rect] = []
    for idx in nms_boxes(boxes, scores):
        x1, y1, x2, y2 = boxes[idx]
        rects.append(Rect(
            index=template_index,
            x1=x1, y1=y1, x2=x2, y2=y2,
            score=scores[idx],
            source='template',
        ))
    rects.sort(key=lambda r: r.score, reverse=True)
    return rects


class TemplateMatcher(BaseMatcher):
    def match(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        if not spec.target:
            return []

        image = frame.image
        offset_x, offset_y = 0, 0
        if spec.roi:
            image, offset_x, offset_y = crop_roi(frame.image, spec.roi)

        all_rects: List[Rect] = []
        templates = [t.strip() for t in spec.target.split('|') if t.strip()]
        for template_index, template_path in enumerate(templates):
            template_bgr = _load_template_bgr(template_path)
            all_rects.extend(
                _find_template_matches(
                    image, template_bgr, spec.accuracy,
                    offset_x, offset_y, template_index,
                )
            )

        all_rects.sort(key=lambda r: (r.score, -r.index), reverse=True)
        if not all_rects:
            return []

        if spec.index < len(all_rects):
            return [all_rects[spec.index]]
        return []
