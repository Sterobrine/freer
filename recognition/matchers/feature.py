from typing import List

import cv2
import numpy as np

from recognition.frame import FrameContext
from recognition.matchers.base import BaseMatcher
from recognition.matchers.roi import crop_roi
from recognition.matchers.template import _load_template_bgr
from recognition.types import Rect, SymbolSpec

_MIN_FEATURE_MATCHES = 12
_MAX_TEMPLATE_SIDE = 256


class FeatureMatcher(BaseMatcher):
    _orb = None

    def _get_orb(self):
        if self._orb is None:
            self._orb = cv2.ORB_create(nfeatures=800)
        return self._orb

    def match(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        if not spec.target:
            return []
        if not spec.roi:
            print('警告：feature 匹配需要 ROI，已跳过')
            return []

        template_path = spec.target.split('|')[0].strip()
        template_bgr = _load_template_bgr(template_path)
        th, tw = template_bgr.shape[:2]
        if max(th, tw) > _MAX_TEMPLATE_SIDE:
            scale = _MAX_TEMPLATE_SIDE / max(th, tw)
            template_bgr = cv2.resize(template_bgr, None, fx=scale, fy=scale)
            th, tw = template_bgr.shape[:2]

        image, offset_x, offset_y = crop_roi(frame.image, spec.roi)
        if image.size == 0:
            return []

        template_gray = cv2.cvtColor(template_bgr, cv2.COLOR_BGR2GRAY)
        image_gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        orb = self._get_orb()
        kp1, des1 = orb.detectAndCompute(template_gray, None)
        kp2, des2 = orb.detectAndCompute(image_gray, None)
        if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
            return []

        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(des1, des2)
        if len(matches) < _MIN_FEATURE_MATCHES:
            return []

        matches = sorted(matches, key=lambda m: m.distance)[:30]
        src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
        M, _ = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
        if M is None:
            return []

        corners = np.float32([[0, 0], [tw, 0], [tw, th], [0, th]]).reshape(-1, 1, 2)
        transformed = cv2.perspectiveTransform(corners, M)
        xs = transformed[:, 0, 0] + offset_x
        ys = transformed[:, 0, 1] + offset_y
        score = len(matches) / max(len(kp1), 1)
        if score < spec.accuracy:
            return []

        return [Rect(
            index=0,
            x1=int(xs.min()),
            y1=int(ys.min()),
            x2=int(xs.max()),
            y2=int(ys.max()),
            score=float(score),
            source='feature',
        )]
