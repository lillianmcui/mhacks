"""Deterministic intent routing for the CH4SE Fetch agent (no LLM required)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum


class Intent(str, Enum):
    LIST_OPEN = "LIST_OPEN"
    INVESTIGATE = "INVESTIGATE"
    HANDLE = "HANDLE"
    STATUS = "STATUS"
    EXPLAIN = "EXPLAIN"
    HELP = "HELP"


# Explicit incident ids used in demos / contracts (INC-0001, CH4-1042, stub ids).
INCIDENT_ID_RE = re.compile(
    r"\b((?:INC|CH4|SAMPLE)[-_]?\d+|inc[-_][a-z0-9-]+)\b",
    re.IGNORECASE,
)

EXPLAIN_CUES = (
    "what happens",
    "walk me through",
    "how do you",
    "how does",
    "how would",
    "how will",
    "explain",
    "what can you",
    "what do you",
    "what would",
    "describe",
)

HANDLE_CUES = (
    "handle",
    "start the response",
    "start response",
    "notify the operator",
    "notify operator",
    "contact the operator",
    "contact operator",
    "alert the operator",
    "send the alert",
    "brief and notify",
)

INVESTIGATE_CUES = (
    "investigate",
    "why is",
    "why does",
    "why was",
    "what evidence",
    "show evidence",
    "get evidence",
    "look into",
    "dig into",
)

STATUS_CUES = (
    "acknowledged",
    "acknowledge",
    "has the operator",
    "did the operator",
    "anyone investigating",
    "is anyone",
    "current status",
    "what is the status",
    "what's the status",
    "status of",
)

LIST_CUES = (
    "unresolved",
    "open incident",
    "open methane",
    "any incidents",
    "any unresolved",
    "what needs attention",
    "needs attention",
    "show me open",
    "list open",
    "list incidents",
    "do we have",
)


@dataclass(frozen=True)
class RoutedIntent:
    intent: Intent
    incident_id: str | None = None
    raw: str = ""


def extract_incident_id(text: str) -> str | None:
    m = INCIDENT_ID_RE.search(text or "")
    if not m:
        return None
    return m.group(1).upper().replace("_", "-")


def classify(message: str) -> RoutedIntent:
    """
    Route a manager/ASI:One message to a small intent set.

    Order matters: explain-before-handle so "how do you handle…" never notifies.
    """
    raw = (message or "").strip()
    text = raw.lower()
    incident_id = extract_incident_id(raw)

    if not text:
        return RoutedIntent(Intent.HELP, raw=raw)

    if any(cue in text for cue in EXPLAIN_CUES):
        return RoutedIntent(Intent.EXPLAIN, incident_id=incident_id, raw=raw)

    if any(cue in text for cue in HANDLE_CUES):
        return RoutedIntent(Intent.HANDLE, incident_id=incident_id, raw=raw)

    if any(cue in text for cue in INVESTIGATE_CUES):
        return RoutedIntent(Intent.INVESTIGATE, incident_id=incident_id, raw=raw)

    if any(cue in text for cue in STATUS_CUES):
        return RoutedIntent(Intent.STATUS, incident_id=incident_id, raw=raw)

    if any(cue in text for cue in LIST_CUES):
        return RoutedIntent(Intent.LIST_OPEN, incident_id=incident_id, raw=raw)

    # Bare incident id → investigate (read-only).
    if incident_id and len(text.split()) <= 3:
        return RoutedIntent(Intent.INVESTIGATE, incident_id=incident_id, raw=raw)

    return RoutedIntent(Intent.HELP, incident_id=incident_id, raw=raw)
