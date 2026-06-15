from typing import List

from recognition.types import MATCH_TYPES, SymbolSpec


def build_fallback_specs(base: SymbolSpec) -> List[SymbolSpec]:
    if not base.fallback:
        return []

    specs: List[SymbolSpec] = []
    for i, entry in enumerate(base.fallback[: base.max_fallback_steps]):
        entry = entry.strip()
        if not entry:
            continue

        parts = entry.split('|', 1)
        if parts[0] in MATCH_TYPES and len(parts) == 1:
            fb_type, fb_target = parts[0], base.target
        elif parts[0] in MATCH_TYPES and len(parts) == 2:
            fb_type, fb_target = parts[0], parts[1]
        else:
            fb_type, fb_target = entry, base.target

        accuracy = max(0.5, base.accuracy - (i + 1) * base.fallback_accuracy_delta)
        specs.append(
            SymbolSpec(
                type=fb_type,
                target=fb_target,
                accuracy=accuracy,
                roi=base.roi,
                index=base.index,
                last_resort='none',
            )
        )
    return specs
