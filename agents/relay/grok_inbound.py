"""Free-form inbound answers via Grok, grounded on a Core API context pack."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from number_check import assert_numbers_grounded

SYSTEM = """You are the CH4SE methane incident assistant texting a field operator on Relay.

You accept ANY operator message — questions, status updates, short slang, or free-form prose.
Answer in plain SMS text (never JSON, never markdown code fences).

Hard rules:
- Answer ONLY using the JSON context pack. If the pack lacks the answer, say you do not have that in CH4SE and suggest what you can answer.
- You may acknowledge facts the operator stated (e.g. their own ETA) without treating them as CH4SE data.
- Quote every emission, uncertainty, timestamp, persistence, count, and distance using the exact display strings from the pack when you mention them.
- Never invent observations, assets, phone numbers, ETAs, or quantities that are not in the pack or the operator message.
- Never rewrite dates into prose (do not turn 2026-01-01 into January 1).
- Say "associated asset" / "nearest registered asset" using the pack's wording; never "caused by".
- If match_result is not MATCHED, say the match is uncertain.
- If is_replay / replay_notice is present, say this is a replayed historical observation.
- Keep replies short for mobile: prefer under 12 lines.
- Do not claim you dispatched real crews unless the pack says a Core API action already did so.
"""

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.I | re.M)


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
    user_payload = json.dumps(
        {"operator_question": question, "ch4se_context": context},
        indent=2,
        default=str,
    )
    grounding = {"operator_question": question, "ch4se_context": context}

    text = _call_grok(api_key, model, SYSTEM, user_payload)
    text = _normalize_reply(text)
    try:
        assert_numbers_grounded(text, grounding)
        return text
    except ValueError as first_err:
        # One retry with a stricter reminder instead of dropping to scripted intents.
        retry_system = (
            SYSTEM
            + "\n\nYour previous draft failed grounding. Reply again in plain text. "
            + "Use only numbers that appear in the context pack or the operator question. "
            + f"Failure detail: {first_err}"
        )
        text = _normalize_reply(_call_grok(api_key, model, retry_system, user_payload))
        assert_numbers_grounded(text, grounding)
        return text


def _call_grok(api_key: str, model: str, system: str, user_content: str) -> str:
    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
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
    return text


def _normalize_reply(text: str) -> str:
    """Unwrap accidental JSON / fences so Relay always gets plain SMS text."""
    cleaned = _FENCE_RE.sub("", text).strip()
    if cleaned.startswith("{") and cleaned.endswith("}"):
        try:
            obj = json.loads(cleaned)
        except json.JSONDecodeError:
            return cleaned
        if isinstance(obj, dict):
            for key in ("reply", "answer", "text", "message"):
                val = obj.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()
    return cleaned
