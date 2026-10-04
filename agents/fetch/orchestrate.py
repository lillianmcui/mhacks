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


def summarize_open(incidents: list[dict]) -> str:
    if not incidents:
        return "No unresolved methane incidents in CH4SE right now."
    count = len(incidents)
    top = incidents[0]
    asset = top.get("asset_id") or "unmatched site"
    ftype = top.get("facility_type") or "facility"
    priority = (top.get("priority_display") or top.get("priority") or "").strip()
    head = (
        f"{count} unresolved. Highest priority is associated with {asset} {ftype}."
    )
    return f"{head} {priority}".strip()


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

    asset_id = detail.get("asset_id")
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


def handle_user_request(api: CoreApi, message: str) -> str:
    text = (message or "").strip().lower()

    if (
        "unresolved" in text
        or "open incident" in text
        or "any incidents" in text
        or "any unresolved" in text
    ):
        incidents = api.get_open_incidents()
        if incidents:
            api.record_action(
                str(incidents[0]["incident_id"]),
                "get_open_incidents",
                f"count={len(incidents)}",
            )
        return summarize_open(incidents)

    if "handle" in text and "priority" in text:
        try:
            result = api.handle_highest_priority()
            if isinstance(result, dict):
                return format_handle_result(result)
            return str(result)
        except CoreApiError as e:
            if e.code == "NO_OPEN_INCIDENTS":
                return "No open incidents to handle."
            # Prefer backend one-shot when available; fall back only if action missing.
            if e.code != "NOT_FOUND":
                raise

        incidents = api.get_open_incidents(limit=1)
        if not incidents:
            return "No open incidents to handle."
        incident_id = str(incidents[0]["incident_id"])
        out = run_handle_sequence(api, incident_id)
        return f"Handled {incident_id}. SMS briefing:\n{out['summary']}"

    return (
        "Ask: 'Do we have any unresolved methane incidents?' "
        "or 'Handle the highest priority one.'"
    )
