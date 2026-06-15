from abc import ABC, abstractmethod
from typing import List

from recognition.frame import FrameContext
from recognition.types import Rect, SymbolSpec


class BaseMatcher(ABC):
    @abstractmethod
    def match(self, frame: FrameContext, spec: SymbolSpec) -> List[Rect]:
        ...
