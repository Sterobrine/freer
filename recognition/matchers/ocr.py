import re
from typing import List, Optional

from recognition.frame import FrameContext
from recognition.matchers.base import BaseMatcher
from recognition.matchers.roi import crop_roi
from recognition.types import Rect, SymbolSpec


class OcrMatcher(BaseMatcher):
    _engine = None
    _warned_missing = False

    def _get_engine(self):
        if self._engine is not None:
            return self._engine
        try:
            from paddleocr import PaddleOCR
            self._engine = PaddleOCR(use_angle_cls=False, lang='ch', show_log=False)
            return self._engine
        except ImportError:
            if not self._warned_missing:
                print('警告：未安装 paddleocr，OCR 识别已跳过（pip install paddleocr）')
                self._warned_missing = True
            return None

    def match(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        if not spec.target:
            return []
        if not spec.roi:
            print('警告：OCR 必须在 ROI 内执行，已跳过')
            return []

        engine = self._get_engine()
        if engine is None:
            return []

        image, offset_x, offset_y = crop_roi(frame.image, spec.roi)
        if image.size == 0:
            return []

        try:
            result = engine.ocr(image, cls=False)
        except Exception as exc:
            print(f'警告：OCR 识别失败: {exc}')
            return []

        if not result or not result[0]:
            return []

        keyword = spec.target.strip()
        use_regex = keyword.startswith('re:')
        pattern = re.compile(keyword[3:], re.IGNORECASE) if use_regex else None

        rects: List[Rect] = []
        for i, line in enumerate(result[0]):
            text = line[1][0]
            score = float(line[1][1])
            if score < spec.accuracy:
                continue
            if use_regex:
                if not pattern.search(text):
                    continue
            elif keyword not in text:
                continue

            box = line[0]
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            rects.append(Rect(
                index=i,
                x1=int(min(xs)) + offset_x,
                y1=int(min(ys)) + offset_y,
                x2=int(max(xs)) + offset_x,
                y2=int(max(ys)) + offset_y,
                score=score,
                source='ocr',
            ))

        if not rects:
            return []
        if spec.index < len(rects):
            return [rects[spec.index]]
        return []
