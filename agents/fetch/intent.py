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


INCIDENT_ID_RE = re.compile(
    r"\b((?:INC|CH4|SAMPLE)[-_]?\d+|inc[-_][a-z0-9-]+)\b",
    re.IGNORECASE,
)

# Imperative / explicit action — substring "handle" alone is NOT enough.
HANDLE_ACTION_RE = re.compile(
    r"(?:"
    r"^\s*handle\b"
    r"|\bplease handle\b"
    r"|\bgo ahead and handle\b"
    r"|\b(?:can|could|would)\s+you\s+handle\b"
    r"|\bhandle\s+(?:our|the|this|highest|priority|inc[-_]|ch4)"
    r"|\bstart(?:\s+the)?\s+response\b"
    r"|\bnotify(?:\s+the)?\s+operator\b"
    r"|\bcontact(?:\s+the)?\s+operator\b"
    r"|\balert(?:\s+the)?\s+operator\b"
    r"|\bsend(?:\s+the)?\s+alert\b"
    r"|\bbrief and notify\b"
    r")",
    re.IGNORECASE,
)

# "handle" used in questions / negation — never notify.
HANDLE_NON_ACTION_RE = re.compile(
    r"(?:"
    r"\bdon'?t\s+handle\b"
    r"|\bdo\s+not\s+handle\b"
    r"|\bwithout\s+handling\b"
    r"|\bnot\s+handle\b"
    r"|\bbeen\s+handled\b"
    r"|\bhandled\s+yet\b"
    r"|\bwho\s+handles?\b"
    r"|\bwhat\s+handles?\b"
    r")",
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
    "tell me the status",
    "just tell me the status",
    "been handled",
    "handled yet",
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
    "which asset",
    "associated with",
    "most urgent",
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

    Order matters:
    - explain before handle
    - status / negation before handle
    - handle only on imperative action phrasing (not mere substring "handle")
    """
    raw = (message or "").strip()
    text = raw.lower()
    incident_id = extract_incident_id(raw)

    if not text:
        return RoutedIntent(Intent.HELP, raw=raw)

    if any(cue in text for cue in EXPLAIN_CUES):
        return RoutedIntent(Intent.EXPLAIN, incident_id=incident_id, raw=raw)

    # Questions / negations that mention handle must not notify.
    if HANDLE_NON_ACTION_RE.search(text):
        if any(cue in text for cue in STATUS_CUES) or "status" in text:
            return RoutedIntent(Intent.STATUS, incident_id=incident_id, raw=raw)
        if any(cue in text for cue in LIST_CUES):
            return RoutedIntent(Intent.LIST_OPEN, incident_id=incident_id, raw=raw)
        return RoutedIntent(Intent.STATUS, incident_id=incident_id, raw=raw)

    if any(cue in text for cue in STATUS_CUES):
        return RoutedIntent(Intent.STATUS, incident_id=incident_id, raw=raw)

    if any(cue in text for cue in LIST_CUES):
        return RoutedIntent(Intent.LIST_OPEN, incident_id=incident_id, raw=raw)

    if any(cue in text for cue in INVESTIGATE_CUES):
        return RoutedIntent(Intent.INVESTIGATE, incident_id=incident_id, raw=raw)

    if HANDLE_ACTION_RE.search(text):
        return RoutedIntent(Intent.HANDLE, incident_id=incident_id, raw=raw)

    # Bare "handle" / "handled" without imperative → status, not notify.
    if re.search(r"\bhandl", text):
        return RoutedIntent(Intent.STATUS, incident_id=incident_id, raw=raw)

    if incident_id and len(text.split()) <= 3:
        return RoutedIntent(Intent.INVESTIGATE, incident_id=incident_id, raw=raw)

    return RoutedIntent(Intent.HELP, incident_id=incident_id, raw=raw)
