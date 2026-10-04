"""Pure Fetch orchestration sequence — no business logic, Core API actions only."""

from __future__ import annotations

from typing import Any, Protocol


class CoreApi(Protocol):
    def get_open_incidents(self, limit: int = 5) -> list[dict]: ...

    def get_incident(self, incident_id: str) -> dict: ...

    def get_asset(self, asset_id: str) -> dict: ...

    def get_escalation_policy(
        self, *, incident_id: str | None = None, asset_id: str | None = None
    ) -> dict: ...

    def generate_briefing(self, incident_id: str, kind: str = "sms") -> dict: ...

    def notify_operator(self, incident_id: str, channel: str = "SMS") -> dict: ...

    def record_action(
        self, incident_id: str, action_name: str, detail: str = ""
    ) -> dict: ...

    def handle_highest_priority(self) -> dict: ...


class CoreApiError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


UNACKNOWLEDGED = ("DETECTED", "ANALYZED", "ALERT_SENT")

HELP = (
    "I am the CH4SE methane incident response agent. "
    "Ask: 'Do we have any unresolved methane incidents?' "
    "or 'Handle the highest priority one.'"
)

EXPLAIN = """Here is what happens when I handle the highest priority incident. Nothing is sent until you tell me to handle it.

1. I pick the most urgent methane incident that nobody has been alerted about yet (priority first, then oldest).
2. I load the incident and the provider observation behind it.
3. I look up the registered asset associated with the plume, or the nearest candidates when the match is ambiguous.
4. I read the escalation policy to find the rule that fired and who it routes to.
5. I generate a short briefing. Every number in it is quoted from the provider's estimate, never computed by me.
6. I notify the assigned operator and record each step on the incident timeline.

If the operator was already alerted I do not send a second message. The operator acknowledges from the alert or the CH4SE dashboard.

To run it, say: 'Handle the highest priority one.'"""

# A question about how handling works must never trigger it.
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
STATUS_CUES = (
    "unresolved",
    "open incident",
    "any incidents",
    "any unresolved",
    "incident",
    "asset",
    "urgent",
    "status",
    "emission",
    "leak",
    "plume",
    "methane",
)


def _incident_lines(incident: dict) -> list[str]:
    """One incident, using the Core API's display strings for every number."""
    display = incident.get("display") or {}
    asset = incident.get("asset_id") or "unmatched site"
    ftype = incident.get("facility_type") or "facility"
    priority = (incident.get("priority_display") or incident.get("priority") or "").strip()
    headline = display.get("headline") or incident.get("status") or ""
    lines = [f"{incident.get('incident_id', '?')}: priority {priority}. Status: {headline}.".replace("  ", " ")]
    lines.append(f"- {display.get('asset') or f'Associated with {asset} {ftype}'}")
    if display.get("emission"):
        lines.append(f"- Emission estimate: {display['emission']}")
    if display.get("provenance"):
        replay = " (real historical observation, replayed through CH4SE)" if incident.get("is_replay") else ""
        lines.append(f"- Observation: {display['provenance']}{replay}")
    return lines


def summarize_open(incidents: list[dict]) -> str:
    if not incidents:
        return "No unresolved methane incidents in CH4SE right now."
    count = len(incidents)
    top = incidents[0]
    asset = top.get("asset_id") or "unmatched site"
    ftype = top.get("facility_type") or "facility"
    noun = "incident" if count == 1 else "incidents"
    lines = [
        f"{count} unresolved methane {noun} in CH4SE. "
        f"Highest priority is associated with {asset} {ftype}.",
        "",
        *_incident_lines(top),
    ]
    for other in incidents[1:]:
        display = other.get("display") or {}
        lines.append(
            f"Also open: {other.get('incident_id', '?')}, priority {other.get('priority', '?')}, "
            f"{display.get('headline') or other.get('status') or ''}".rstrip(", ")
        )
    waiting = [i for i in incidents if i.get("status") in UNACKNOWLEDGED]
    lines.append("")
    if any(i.get("status") != "ALERT_SENT" for i in waiting):
        lines.append("Nobody has been alerted yet. Say 'Handle the highest priority one' to brief and notify the assigned operator.")
    elif waiting:
        lines.append("The operator has been alerted and has not acknowledged yet.")
    elif "status" in top:
        lines.append("Every open incident has been acknowledged, so there is nothing waiting to be handled.")
    return "\n".join(lines).strip()


def format_handle_result(result: dict[str, Any]) -> str:
    """Format backend handle_highest_priority data for the operator."""
    incident = result.get("incident") or {}
    incident_id = incident.get("incident_id") or result.get("incident_id") or "?"
    steps = result.get("steps") or []
    briefing = result.get("briefing") or {}
    lines = [f"Handled {incident_id}."]
    for step in steps:
        name = step.get("step", "?")
        detail = step.get("detail", "")
        ok = step.get("ok")
        if ok is False:
            lines.append(f"  [fail] {name}: {detail}")
        else:
            lines.append(f"  [ok] {name}: {detail}")
        if name == "notify_operator" and isinstance(detail, str) and "already alerted" in detail.lower():
            lines.append("  (repeat handle: no second SMS sent)")
    text = briefing.get("text")
    if text:
        lines.append(f"SMS briefing:\n{text}")
    elif result.get("summary"):
        lines.append(str(result["summary"]))
    return "\n".join(lines)


def run_handle_sequence(api: CoreApi, incident_id: str) -> dict[str, Any]:
    """
    Local fallback sequence when handle_highest_priority is not implemented.
    Prefer the Core API one-shot once backend is merged (identical dashboard path).
    """
    detail = api.get_incident(incident_id)
    api.record_action(incident_id, "get_incident", "Fetch agent sequence")

    # get_incident nests the row under "incident"; older mocks returned it flat.
    asset_id = (detail.get("incident") or {}).get("asset_id") or detail.get("asset_id")
    if asset_id:
        api.get_asset(str(asset_id))
        api.record_action(incident_id, "get_asset", str(asset_id))

    api.get_escalation_policy(incident_id=incident_id)
    api.record_action(incident_id, "get_escalation_policy", "")

    briefing = api.generate_briefing(incident_id, "sms")
    api.record_action(incident_id, "generate_briefing", str(briefing.get("source", "")))

    try:
        alert = api.notify_operator(incident_id, "SMS")
        api.record_action(
            incident_id, "notify_operator", str(alert.get("delivery_status", ""))
        )
    except CoreApiError as e:
        # Backend: INVALID_TRANSITION once acknowledged; UPSTREAM_UNAVAILABLE if Relay down.
        api.record_action(incident_id, "notify_operator", f"{e.code}: {e.message}")
        return {
            "incident_id": incident_id,
            "briefing": briefing,
            "alert": None,
            "summary": f"{briefing.get('text') or ''}\nNotify failed: {e.code}: {e.message}".strip(),
        }

    return {
        "incident_id": incident_id,
        "briefing": briefing,
        "alert": alert,
        "summary": briefing.get("text") or "Operator notification attempted.",
    }


def _report_open(api: CoreApi) -> str:
    incidents = api.get_open_incidents()
    if incidents:
        api.record_action(
            str(incidents[0]["incident_id"]),
            "get_open_incidents",
            f"count={len(incidents)}",
        )
    return summarize_open(incidents)


def handle_user_request(api: CoreApi, message: str) -> str:
    text = (message or "").strip().lower()

    if any(cue in text for cue in EXPLAIN_CUES):
        return EXPLAIN

    if "handle" in text and ("priority" in text or "urgent" in text):
        try:
            result = api.handle_highest_priority()
            if isinstance(result, dict):
                return format_handle_result(result)
            return str(result)
        except CoreApiError as e:
            if e.code == "NO_OPEN_INCIDENTS":
                # Nothing is waiting for an alert; say what is still open instead.
                remaining = api.get_open_incidents()
                if not remaining:
                    return "No open incidents to handle."
                return "Nothing to handle: no incident is waiting for an alert.\n\n" + summarize_open(remaining)
            # Prefer backend one-shot when available; fall back only if action missing.
            if e.code != "NOT_FOUND":
                raise

        incidents = api.get_open_incidents(limit=1)
        if not incidents:
            return "No open incidents to handle."
        incident_id = str(incidents[0]["incident_id"])
        out = run_handle_sequence(api, incident_id)
        return f"Handled {incident_id}. SMS briefing:\n{out['summary']}"

    if any(cue in text for cue in STATUS_CUES):
        return _report_open(api)

    return HELP
