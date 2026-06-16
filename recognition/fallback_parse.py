"""Parse flat match_fallback_* strings into SymbolSpec.fallback entries."""

from typing import List, Optional

from recognition.types import MATCH_TYPES


def parse_fallback_chain(flat: Optional[str]) -> Optional[List[str]]:
    """
  Split a pipe-separated flat fallback field into per-step entries.

  Steps are normally match types (``feature``, ``ocr``, …). A step may include
  a custom target as ``type|target``; the parser groups ``template`` + path
  so ``template|a.bmp|feature`` becomes ``['template|a.bmp', 'feature']``.
  """
    if flat is None or not str(flat).strip():
        return None

    parts = [s.strip() for s in str(flat).split('|') if s.strip()]
    if not parts:
        return None

    entries: List[str] = []
    i = 0
    while i < len(parts):
        part = parts[i]
        if part in MATCH_TYPES:
            nxt = parts[i + 1] if i + 1 < len(parts) else None
            if nxt is not None and nxt not in MATCH_TYPES:
                entries.append(f'{part}|{nxt}')
                i += 2
            else:
                entries.append(part)
                i += 1
        else:
            entries.append(part)
            i += 1
    return entries or None


def serialize_fallback_chain(entries: Optional[List[str]]) -> Optional[str]:
    if not entries:
        return None
    cleaned = [e.strip() for e in entries if e and e.strip()]
    return '|'.join(cleaned) if cleaned else None
