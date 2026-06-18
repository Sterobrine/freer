"""ADB ``input text`` escaping helpers."""

from __future__ import annotations

import re
from typing import List

# Shell metacharacters that break unquoted ``adb shell input text`` payloads.
_SHELL_METACHAR = set("'\"\\;&|()<>$`{}[]#?*")


def escape_adb_input_text(text: str) -> str:
    """Escape a string for ``adb shell input text <payload>``."""
    out: List[str] = []
    for ch in text:
        if ch == ' ':
            out.append('%s')
        elif ch == '%':
            out.append('%')
        elif ch in _SHELL_METACHAR:
            out.append('\\' + ch)
        else:
            out.append(ch)
    return ''.join(out)


def adb_text_warnings(text: str) -> List[str]:
    """Return human-readable warnings for characters that may still fail on some devices."""
    warnings: List[str] = []
    if re.search(r'[\x00-\x1f\x7f]', text):
        warnings.append('文本包含控制字符，部分设备可能无法输入')
    if '\n' in text or '\r' in text:
        warnings.append('文本包含换行，请拆分为多个 text 步骤或使用 key 步骤')
    return warnings
