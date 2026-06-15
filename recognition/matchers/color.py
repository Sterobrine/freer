from typing import List

import cv2
import numpy as np

from recognition.frame import FrameContext
from recognition.matchers.base import BaseMatcher
from recognition.matchers.roi import crop_roi, parse_bgr_color, color_tolerance
from recognition.types import Rect, SymbolSpec


class ColorMatcher(BaseMatcher):
    def match(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        if not spec.target:
            return []
        if not spec.roi:
            print('警告：color 匹配需要 ROI，已跳过')
            return []

        try:
            target_bgr = parse_bgr_color(spec.target)
        except ValueError as exc:
            print(f'警告：{exc}')
            return []

        image, offset_x, offset_y = crop_roi(frame.image, spec.roi)
        if image.size == 0:
            return []

        tol = color_tolerance(spec.accuracy)
        lower = np.array([max(0, c - tol) for c in target_bgr], dtype=np.uint8)
        upper = np.array([min(255, c + tol) for c in target_bgr], dtype=np.uint8)
        mask = cv2.inRange(image, lower, upper)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        rects: List[Rect] = []
        for i, cnt in enumerate(sorted(contours, key=cv2.contourArea, reverse=True)):
            x, y, w, h = cv2.boundingRect(cnt)
            if w * h < 16:
                continue
            rects.append(Rect(
                index=i,
                x1=offset_x + x,
                y1=offset_y + y,
                x2=offset_x + x + w,
                y2=offset_y + y + h,
                score=1.0,
                source='color',
            ))

        if not rects:
            return []
        if spec.index < len(rects):
            return [rects[spec.index]]
        return []
