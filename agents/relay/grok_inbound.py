"""Free-form inbound answers via Grok, grounded on a Core API context pack."""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from number_check import assert_numbers_grounded

SYSTEM = """You are the CH4SE methane incident assistant texting a field operator on Relay.

Hard rules:
- Answer ONLY using the JSON context pack. If the pack lacks the answer, say you do not have that in CH4SE and suggest a related question.
- Quote every emission, uncertainty, timestamp, persistence, count, and distance using the exact display strings from the pack when you mention them.
- Never invent observations, assets, phone numbers, ETAs, or quantities.
- Never rewrite dates into prose (do not turn 2026-01-01 into January 1).
- Say "associated asset" / "nearest registered asset" using the pack's wording; never "caused by".
- If match_result is not MATCHED, say the match is uncertain.
- If is_replay / replay_notice is present, say this is a replayed historical observation.
- Keep replies short for mobile: prefer under 12 lines.
- Do not claim you dispatched real crews unless the pack says a Core API action already did so.
"""


def grok_enabled() -> bool:
    flag = os.environ.get("GROK_INBOUND", "true").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return False
    return bool(os.environ.get("GROK_API_KEY"))


def answer_with_grok(question: str, context: dict[str, Any]) -> str:
    api_key = os.environ.get("GROK_API_KEY")
    if not api_key:
        raise RuntimeError("GROK_API_KEY is not set")

    model = os.environ.get("GROK_MODEL", "grok-3")
    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": json.dumps(
                    {"operator_question": question, "ch4se_context": context},
                    indent=2,
                    default=str,
                ),
            },
        ],
    }
    with httpx.Client(timeout=45.0) as client:
        r = client.post(
            "https://api.x.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Grok HTTP {r.status_code}: {r.text[:400]}")
    data = r.json()
    text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    text = text.strip()
    if not text:
        raise RuntimeError("Grok returned empty content")
    assert_numbers_grounded(text, {"operator_question": question, "ch4se_context": context})
    return text
