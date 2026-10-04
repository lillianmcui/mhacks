"""Map operator Relay text → intents. Deterministic; no LLM required for P0."""

from __future__ import annotations

from enum import Enum


class Intent(str, Enum):
    HELP = "help"
    WHY_ALERTED = "why_alerted"
    EVIDENCE = "evidence"
    HOW_BAD = "how_bad"
    HISTORY = "history"
    WHO_OWNS = "who_owns"
    POLICY = "policy"
    WHAT_TO_DO = "what_to_do"
    ACKNOWLEDGE = "acknowledge"
    UNKNOWN = "unknown"


def classify(text: str) -> Intent:
    t = (text or "").strip().lower()
    if not t:
        return Intent.HELP

    if any(k in t for k in ("ack", "acknowledge", "investigating", "mark us", "mark my")):
        return Intent.ACKNOWLEDGE
    if "why" in t and ("alert" in t or "notified" in t or "contacted" in t):
        return Intent.WHY_ALERTED
    if "evidence" in t or "what do we have" in t or "proof" in t:
        return Intent.EVIDENCE
    if "how bad" in t or "severity" in t or "how serious" in t or "emission" in t:
        return Intent.HOW_BAD
    if "before" in t or "history" in t or "happened" in t and "has" in t:
        return Intent.HISTORY
    if "who owns" in t or "owner" in t or "operator" in t and "who" in t:
        return Intent.WHO_OWNS
    if "policy" in t or "require" in t or "escalat" in t:
        return Intent.POLICY
    if (
        "what should" in t
        or "what do i" in t
        or "do now" in t
        or "next step" in t
        or "recommend" in t
        or "dispatch" in t
    ):
        return Intent.WHAT_TO_DO
    if t in ("help", "?", "hi", "hello") or "help" in t:
        return Intent.HELP
    return Intent.UNKNOWN
