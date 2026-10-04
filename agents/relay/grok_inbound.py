"""Free-form inbound answers via Grok, grounded on a Core API context pack."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from number_check import assert_numbers_grounded

SYSTEM = """You are a sharp field ops partner on Relay helping with a CH4SE methane incident.
Text like a calm, experienced colleague — natural, direct, a little warm. Not a checklist bot.

How to reply:
- Answer the operator's actual question or update first. Mirror their situation (waiting on a truck, deciding next step, confused about the alert, etc.).
- Write plain SMS text: short paragraphs or a few sentences. No JSON, no markdown, no bold, no bullet dumps unless they really help.
- Sound human: contractions are fine, light conversational phrasing is fine. Avoid robotic openers like "Match uncertain (NO_REGISTERED_ASSET)." or labeled field dumps ("Emission:", "Persistence:", "Priority:").
- Weave facts into advice. Example vibe: "Yeah — that plume's still showing about 432 ± 99 kg CH4/hr from Carbon Mapper, and we don't have a registered asset tied to it yet, so I'd widen the search while you wait on the vac truck."
- If you don't have something in CH4SE, say so casually and still be useful with what you do know.
- You can acknowledge what the operator told you (their ETA, plan, etc.) without treating it as system data.

Stay honest (don't invent):
- Stick to the context pack for CH4SE facts. Don't invent assets, phones, dispatches, ETAs, or measurements.
- When you mention rates, uncertainties, timestamps, persistence, or distances, use the pack's exact display strings (don't round or rephrase numbers/dates).
- If the match isn't MATCHED, make clear the site link is uncertain — in plain language, not enum codes.
- If this is a replayed historical observation, mention that once, naturally.
- Don't claim you already dispatched crews unless the pack says a Core API action did.
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
        # One retry: keep the same natural voice, just fix invented numbers.
        retry_system = (
            SYSTEM
            + "\n\nQuick fix: your last draft used a number that isn't in the pack or the "
            + "operator's message. Rewrite in the same natural voice, but only use numbers "
            + f"from those sources. ({first_err})"
        )
        text = _normalize_reply(_call_grok(api_key, model, retry_system, user_payload))
        assert_numbers_grounded(text, grounding)
        return text


def _call_grok(api_key: str, model: str, system: str, user_content: str) -> str:
    payload = {
        "model": model,
        "temperature": float(os.environ.get("GROK_INBOUND_TEMPERATURE", "0.65")),
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
    cleaned = re.sub(r"\*\*(.+?)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    if cleaned.startswith("{") and cleaned.endswith("}"):
        try:
            obj = json.loads(cleaned)
        except json.JSONDecodeError:
            return cleaned
        if isinstance(obj, dict):
            for key in ("reply", "answer", "text", "message"):
                val = obj.get(key)
                if isinstance(val, str) and val.strip():
                    return _normalize_reply(val.strip())
    return cleaned
