"""Fetch orchestration — multi-step Core API tools, no methane business logic."""

from __future__ import annotations

from typing import Any, Protocol

from intent import Intent, RoutedIntent, classify

# Unacknowledged = still waiting for operator ack (backend: ANALYZED | ALERT_SENT).
UNACKNOWLEDGED = frozenset({"DETECTED", "ANALYZED", "ALERT_SENT"})

HELP = (
    "I am the CH4SE methane incident-response agent.\n\n"
    "Try:\n"
    "• Do we have any unresolved methane incidents?\n"
    "• Why is the highest-priority incident critical?\n"
    "• Handle our highest-priority methane incident.\n"
    "• Has the operator acknowledged it?\n\n"
    "ASI:One is the manager interface. Relay is how CH4SE contacts the field operator."
)

EXPLAIN = """Here is what I do when you ask me to handle an incident. Nothing is sent until you explicitly say handle / notify / start response.

1. List open incidents and pick the highest-priority unacknowledged one (or the id you named).
2. Load incident detail, evidence, asset, and escalation policy from the Core API.
3. Generate a grounded operator briefing (numbers come from provider display strings).
4. Request operator notification through Relay via notify_operator.
5. Record each step on the incident timeline.
6. Report delivery status and current incident state.

Repeat handle on an already-alerted incident does not invent a second success — I report what Relay / Core API returns.

Say: 'Handle our highest-priority methane incident.' to run it."""


class CoreApi(Protocol):
    async def get_open_incidents(self, limit: int = 10) -> list[dict]: ...

    async def get_incident(self, incident_id: str) -> dict: ...

    async def get_asset(self, asset_id: str) -> dict: ...

    async def get_evidence(self, incident_id: str) -> dict: ...

    async def get_asset_history(self, incident_id: str) -> dict: ...

    async def get_escalation_policy(
        self, *, incident_id: str | None = None, asset_id: str | None = None
    ) -> dict: ...

    async def generate_briefing(self, incident_id: str, kind: str = "sms") -> dict: ...

    async def notify_operator(
        self, incident_id: str, channel: str = "SMS", *, actor: str = "FETCH_AGENT"
    ) -> dict: ...

    async def record_action(
        self, incident_id: str, action_name: str, detail: str = ""
    ) -> dict: ...


class CoreApiError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def _display(blob: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(blob, dict):
        return {}
    d = blob.get("display")
    return d if isinstance(d, dict) else {}


def _incident_row(detail: dict[str, Any]) -> dict[str, Any]:
    """IncidentDetail nests the row under `incident`; summaries are flat."""
    nested = detail.get("incident")
    return nested if isinstance(nested, dict) else detail


def _asset_id_from(detail: dict[str, Any], summary: dict[str, Any] | None = None) -> str | None:
    row = _incident_row(detail)
    aid = row.get("asset_id")
    if aid:
        return str(aid)
    if summary and summary.get("asset_id"):
        return str(summary["asset_id"])
    asset = detail.get("asset")
    if isinstance(asset, dict) and asset.get("asset_id"):
        return str(asset["asset_id"])
    return None


def _status_of(item: dict[str, Any]) -> str:
    row = _incident_row(item)
    return str(item.get("status") or row.get("status") or "")


def unacknowledged(incidents: list[dict]) -> list[dict]:
    """Open includes acknowledged; handle only targets still waiting for ack."""
    waiting = [i for i in incidents if _status_of(i) in UNACKNOWLEDGED]
    return waiting or []


def _incident_lines(incident: dict) -> list[str]:
    display = _display(incident)
    asset = incident.get("asset_id") or "unmatched site"
    ftype = incident.get("facility_type") or "facility"
    priority = (incident.get("priority_display") or incident.get("priority") or "").strip()
    headline = display.get("headline") or incident.get("status") or ""
    lines = [
        f"{incident.get('incident_id', '?')}: priority {priority}. Status: {headline}.".replace(
            "  ", " "
        )
    ]
    lines.append(f"- {display.get('asset') or f'Associated with {asset} {ftype}'}")
    if display.get("emission"):
        lines.append(f"- Emission estimate: {display['emission']}")
    if display.get("provenance"):
        replay = (
            " (real historical observation, replayed through CH4SE)"
            if incident.get("is_replay")
            else ""
        )
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
        display = _display(other)
        lines.append(
            f"Also open: {other.get('incident_id', '?')}, priority {other.get('priority', '?')}, "
            f"{display.get('headline') or other.get('status') or ''}".rstrip(", ")
        )
    waiting = unacknowledged(incidents)
    lines.append("")
    if any(_status_of(i) != "ALERT_SENT" for i in waiting):
        lines.append(
            "Nobody has been alerted yet on the top unacknowledged item. "
            "Say 'Handle our highest-priority methane incident' to brief and notify via Relay."
        )
    elif waiting:
        lines.append(
            "The operator has been alerted through Relay and has not acknowledged yet."
        )
    elif "status" in top:
        lines.append(
            "Every open incident has been acknowledged, so there is nothing waiting to be handled."
        )
    return "\n".join(lines).strip()


async def list_open(api: CoreApi) -> str:
    incidents = await api.get_open_incidents()
    if incidents:
        try:
            await api.record_action(
                str(incidents[0]["incident_id"]),
                "get_open_incidents",
                f"count={len(incidents)}",
            )
        except CoreApiError:
            pass
    return summarize_open(incidents)


async def _resolve_incident_id(
    api: CoreApi,
    routed: RoutedIntent,
    *,
    for_handle: bool,
) -> tuple[str | None, list[dict], str | None]:
    """
    Returns (incident_id, open_incidents, error_message).
    For handle: prefer unacknowledged; never pick a random acknowledged open row.
    """
    open_ones = await api.get_open_incidents(limit=20)
    if routed.incident_id:
        # Normalize against known open ids when possible.
        wanted = routed.incident_id.upper()
        for item in open_ones:
            iid = str(item.get("incident_id", "")).upper()
            if iid == wanted or iid.replace("-", "") == wanted.replace("-", ""):
                return str(item["incident_id"]), open_ones, None
        return routed.incident_id, open_ones, None

    pool = unacknowledged(open_ones) if for_handle else open_ones
    if not pool:
        if for_handle and open_ones:
            return None, open_ones, "nothing_to_handle"
        return None, open_ones, "no_open"
    return str(pool[0]["incident_id"]), open_ones, None


async def investigate(api: CoreApi, routed: RoutedIntent) -> str:
    incident_id, open_ones, err = await _resolve_incident_id(
        api, routed, for_handle=False
    )
    if err == "no_open" or not incident_id:
        return "No open incidents to investigate."

    steps: list[str] = []
    steps.append(f"✓ Selected {incident_id} for investigation (read-only — no Relay notify)")

    try:
        detail = await api.get_incident(incident_id)
        steps.append("✓ Retrieved incident detail")
    except CoreApiError as e:
        return f"Could not load {incident_id} ({e.code}: {e.message})."

    display = _display(detail)
    row = _incident_row(detail)
    summary = next(
        (i for i in open_ones if str(i.get("incident_id")) == incident_id),
        {},
    )
    asset_id = _asset_id_from(detail, summary)

    evidence: dict[str, Any] = {}
    try:
        evidence = await api.get_evidence(incident_id)
        steps.append("✓ Retrieved provider evidence")
    except CoreApiError as e:
        steps.append(f"• Evidence unavailable ({e.code})")

    if asset_id:
        try:
            await api.get_asset(asset_id)
            steps.append(f"✓ Retrieved asset {asset_id}")
        except CoreApiError as e:
            steps.append(f"• Asset lookup failed ({e.code})")
    else:
        steps.append("• No registered asset id on this incident (match may be uncertain)")

    policy: dict[str, Any] = {}
    try:
        policy = await api.get_escalation_policy(incident_id=incident_id)
        steps.append("✓ Checked escalation policy")
    except CoreApiError as e:
        steps.append(f"• Policy unavailable ({e.code})")

    try:
        await api.get_asset_history(incident_id)
        steps.append("✓ Retrieved asset / source history")
    except CoreApiError:
        pass

    try:
        await api.record_action(incident_id, "fetch_investigate", "read-only")
    except CoreApiError:
        pass

    ev_display = _display(evidence) or display
    priority = row.get("priority") or summary.get("priority") or "?"
    status = detail.get("status") or row.get("status") or summary.get("status") or "?"
    fired = (
        (policy.get("fired_rule") or {}).get("rule_id")
        if isinstance(policy.get("fired_rule"), dict)
        else policy.get("fired_rule_id") or policy.get("rule_id")
    )
    role = policy.get("notify_role")

    lines = [
        *steps,
        "",
        f"Incident {incident_id} — priority {priority}, status {status}.",
    ]
    if display.get("headline"):
        lines.append(display["headline"])
    if ev_display.get("emission") or display.get("emission"):
        lines.append(
            f"Provider emission: {ev_display.get('emission') or display.get('emission')}"
        )
    if display.get("asset"):
        lines.append(display["asset"])
    if ev_display.get("provenance") or display.get("provenance"):
        lines.append(
            f"Provenance: {ev_display.get('provenance') or display.get('provenance')}"
        )
    if display.get("replay_notice"):
        lines.append(display["replay_notice"])
    elif detail.get("is_replay") or summary.get("is_replay") or evidence.get("is_replay"):
        lines.append("This is a replayed historical observation.")
    if fired or role:
        lines.append(
            f"Escalation: rule {fired or '?'} routes to {role or '?'}."
        )
    lines.append("")
    lines.append("No operator notification was sent (investigate is read-only).")
    return "\n".join(lines)


async def handle_incident(api: CoreApi, routed: RoutedIntent) -> str:
    """
    Primary demo path: Fetch visibly orchestrates separate Core API tools.
    Does NOT call handle_highest_priority (kept on backend for dashboard compat only).
    """
    incident_id, open_ones, err = await _resolve_incident_id(
        api, routed, for_handle=True
    )
    if err == "no_open":
        return "No open incidents to handle."
    if err == "nothing_to_handle":
        return (
            "Nothing to handle: no incident is waiting for an alert "
            "(everything open is already acknowledged).\n\n"
            + summarize_open(open_ones)
        )
    assert incident_id

    steps: list[str] = []
    summary = next(
        (i for i in open_ones if str(i.get("incident_id")) == incident_id),
        {},
    )
    priority = summary.get("priority") or "?"
    steps.append(f"✓ Found {len(open_ones)} unresolved incident(s)")
    steps.append(f"✓ Selected {incident_id} — {priority}")

    try:
        detail = await api.get_incident(incident_id)
        steps.append("✓ Retrieved incident detail")
    except CoreApiError as e:
        return "\n".join(steps + [f"✗ get_incident failed ({e.code}: {e.message})"])

    display = _display(detail)
    asset_id = _asset_id_from(detail, summary)
    asset_label = display.get("asset") or (asset_id or "no registered asset")

    if asset_id:
        try:
            await api.get_asset(asset_id)
            steps.append(f"✓ Retrieved asset {asset_id}")
        except CoreApiError as e:
            steps.append(f"• get_asset failed ({e.code}) — continuing")
    else:
        steps.append(f"• Asset: {asset_label}")

    try:
        policy = await api.get_escalation_policy(incident_id=incident_id)
        role = policy.get("notify_role") or "?"
        steps.append(f"✓ Checked escalation policy (notify role: {role})")
    except CoreApiError as e:
        steps.append(f"• get_escalation_policy failed ({e.code}) — continuing")

    try:
        evidence = await api.get_evidence(incident_id)
        steps.append("✓ Retrieved evidence")
    except CoreApiError:
        evidence = {}
        steps.append("• Evidence endpoint unavailable — using incident display fields")

    try:
        briefing = await api.generate_briefing(incident_id, "sms")
        src = briefing.get("source") or "?"
        steps.append(f"✓ Prepared incident briefing ({src})")
    except CoreApiError as e:
        return "\n".join(
            steps
            + [
                f"✗ generate_briefing failed ({e.code}: {e.message})",
                "Operator was not notified.",
            ]
        )

    # Side effect — no automatic retry.
    alert: dict[str, Any] | None = None
    notify_ok = False
    try:
        alert = await api.notify_operator(incident_id, "SMS", actor="FETCH_AGENT")
        delivery = str(alert.get("delivery_status") or "").upper()
        if delivery in ("SENT", "DELIVERED"):
            notify_ok = True
            steps.append(
                f"✓ Requested operator notification through Relay ({delivery})"
            )
        elif delivery == "FAILED":
            steps.append("✗ Relay notification reported FAILED")
        else:
            steps.append(
                f"• notify_operator returned delivery_status={delivery or 'unknown'}"
            )
        try:
            await api.record_action(
                incident_id, "notify_operator", delivery or "unknown"
            )
        except CoreApiError:
            pass
    except CoreApiError as e:
        steps.append(
            f"✗ Operator notification through Relay failed ({e.code}: {e.message})"
        )
        try:
            await api.record_action(
                incident_id, "notify_operator", f"{e.code}: {e.message}"
            )
        except CoreApiError:
            pass

    # Fresh status after notify attempt.
    status = detail.get("status") or _incident_row(detail).get("status") or "?"
    try:
        refreshed = await api.get_incident(incident_id)
        status = refreshed.get("status") or _incident_row(refreshed).get("status") or status
        steps.append(f"✓ Current status: {status}")
    except CoreApiError:
        steps.append(f"• Status after notify attempt: {status}")

    ev_display = _display(evidence) or display
    lines = [*steps, ""]
    if notify_ok:
        lines.append(
            f"Incident {incident_id} notification was sent through Relay "
            f"and is awaiting operator acknowledgement."
            if status in UNACKNOWLEDGED
            else f"Incident {incident_id} — current status {status}."
        )
    else:
        lines.append(
            f"I analyzed {incident_id}, but Relay operator notification did not succeed. "
            "Treat the incident as still unnotified unless status shows otherwise."
        )

    if ev_display.get("emission") or display.get("emission"):
        lines.append(
            f"Provider-reported emission: {ev_display.get('emission') or display.get('emission')}"
        )
    if display.get("asset"):
        lines.append(display["asset"])
    briefing_text = (briefing.get("text") or "").strip()
    if briefing_text:
        lines.append("")
        lines.append("Briefing sent / prepared:")
        lines.append(briefing_text)
    return "\n".join(lines)


async def status_query(api: CoreApi, routed: RoutedIntent) -> str:
    incident_id, open_ones, err = await _resolve_incident_id(
        api, routed, for_handle=False
    )
    if err == "no_open" or not incident_id:
        return "No open incidents to report status on."

    try:
        detail = await api.get_incident(incident_id)
    except CoreApiError as e:
        return f"Could not load status for {incident_id} ({e.code}: {e.message})."

    display = _display(detail)
    row = _incident_row(detail)
    status = detail.get("status") or row.get("status") or "?"
    priority = row.get("priority") or "?"
    contact = detail.get("assigned_contact")
    contact_bit = ""
    if isinstance(contact, dict) and contact.get("name"):
        contact_bit = f" Assigned contact: {contact.get('name')}."

    lines = [
        f"✓ Retrieved {incident_id}",
        f"Status: {status}",
        f"Priority: {priority}",
    ]
    if display.get("headline"):
        lines.append(display["headline"])
    if display.get("emission"):
        lines.append(f"Emission: {display['emission']}")
    if display.get("asset"):
        lines.append(display["asset"])

    if status in ("ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"):
        lines.append("")
        lines.append(
            f"Yes — the operator has acknowledged through Relay "
            f"(incident is now {status}).{contact_bit}"
        )
    elif status == "ALERT_SENT":
        lines.append("")
        lines.append(
            "Not yet. The Relay notification was successfully requested earlier, "
            "but the incident is still awaiting operator acknowledgement."
        )
    elif status == "ANALYZED":
        lines.append("")
        lines.append(
            "Not yet. No successful operator acknowledgement is recorded. "
            "If you have not handled this incident, say "
            "'Handle our highest-priority methane incident.'"
        )
    else:
        lines.append("")
        lines.append(f"Current lifecycle state is {status}.{contact_bit}")

    try:
        await api.record_action(incident_id, "fetch_status", status)
    except CoreApiError:
        pass
    return "\n".join(lines)


async def handle_user_request(api: CoreApi, message: str) -> str:
    routed = classify(message)
    try:
        if routed.intent == Intent.EXPLAIN:
            return EXPLAIN
        if routed.intent == Intent.LIST_OPEN:
            return await list_open(api)
        if routed.intent == Intent.INVESTIGATE:
            return await investigate(api, routed)
        if routed.intent == Intent.HANDLE:
            return await handle_incident(api, routed)
        if routed.intent == Intent.STATUS:
            return await status_query(api, routed)
        return HELP
    except CoreApiError as e:
        return f"Core API error ({e.code}): {e.message}"


# Sync entry for CLI convenience.
def handle_user_request_sync(api: Any, message: str) -> str:
    import asyncio

    return asyncio.run(handle_user_request(api, message))
