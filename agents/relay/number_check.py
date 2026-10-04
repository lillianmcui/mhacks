"""Number grounding for inbound Grok replies (mirrors Core API adapter)."""

from __future__ import annotations

import json
import re

NUMBER_RE = re.compile(r"-?\d+(?:\.\d+)?(?:e[+-]?\d+)?", re.I)


def extract_numbers(text: str) -> list[str]:
    out: list[str] = []
    for raw in NUMBER_RE.findall(text or ""):
        try:
            n = float(raw)
            if not (n == n):  # NaN
                out.append(raw)
            elif "." in raw.lower() or "e" in raw.lower():
                out.append(str(float(raw)))
            else:
                out.append(str(int(float(raw))))
        except ValueError:
            out.append(raw)
    return out


def assert_numbers_grounded(output_text: str, input_json: object) -> None:
    input_blob = json.dumps(input_json, default=str)
    allowed = set(extract_numbers(input_blob))
    bad = [n for n in extract_numbers(output_text) if n not in allowed]
    if bad:
        raise ValueError(f"Grok number-check failed: {', '.join(bad)}")
