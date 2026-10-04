"""Grounded replies from Core API data — no Grok required for P0 scripted Q&A."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import core_api
from intent import Intent, classify

PLAYBOOK_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "fixtures" / "company" / "response_playbook.json"
)


def resolve_incident_id(explicit: str | None = None) -> str:
    if explicit:
        return explicit
    import os

    env_id = os.environ.get("RELAY_DEFAULT_INCIDENT_ID", "").strip()
    if env_id:
        return env_id
    open_ones = core_api.get_open_incidents(limit=1)
    if not open_ones:
        raise core_api.CoreApiError("NO_OPEN_INCIDENTS", "no open incidents")
    return str(open_ones[0]["incident_id"])


def handle_operator_text(text: str, *, incident_id: str | None = None) -> str:
    intent = classify(text)
    if intent == Intent.HELP or intent == Intent.UNKNOWN:
        return _help(intent == Intent.UNKNOWN)

    iid = resolve_incident_id(incident_id)
    try:
        if intent == Intent.ACKNOWLEDGE:
            return _ack(iid)
        if intent == Intent.WHY_ALERTED:
            return _why(iid)
        if intent == Intent.EVIDENCE:
            return _evidence(iid)
        if intent == Intent.HOW_BAD:
            return _how_bad(iid)
        if intent == Intent.HISTORY:
            return _history(iid)
        if intent == Intent.WHO_OWNS:
            return _who_owns(iid)
        if intent == Intent.POLICY:
            return _policy(iid)
        if intent == Intent.WHAT_TO_DO:
            return _what_to_do(iid)
    except core_api.CoreApiError as e:
        return f"CH4SE could not complete that ({e.code}: {e.message})."
    return _help(True)


def _help(unknown: bool) -> str:
    prefix = "I didn't catch that. " if unknown else ""
    return (
        prefix
        + "Ask one of:\n"
        + "• Why was I alerted?\n"
        + "• How bad is this?\n"
        + "• What evidence do we have?\n"
        + "• Has this happened before?\n"
        + "• Who owns this site?\n"
        + "• What does our policy require?\n"
        + "• What should I do?\n"
        + "• Acknowledge and mark investigating"
    )


def _display(blob: dict[str, Any]) -> dict[str, Any]:
    return blob.get("display") if isinstance(blob.get("display"), dict) else {}


def _why(incident_id: str) -> str:
    detail = core_api.get_incident(incident_id)
    policy = core_api.get_escalation_policy(incident_id)
    core_api.record_action(incident_id, "relay_why_alerted", "")
    d = _display(detail)
    priority = detail.get("priority") or (detail.get("incident") or {}).get("priority")
    rule = policy.get("fired_rule_id") or policy.get("rule_id") or "?"
    role = policy.get("notify_role") or "?"
    lines = [
        f"You were alerted for {incident_id} ({priority}).",
        d.get("emission") and f"Release: {d['emission']}",
        d.get("asset") and str(d["asset"]),
        f"Policy rule {rule} routes to {role}.",
        d.get("headline") and f"Status: {d['headline']}",
        "This is a replayed historical observation.",
    ]
    return "\n".join(x for x in lines if x)


def _evidence(incident_id: str) -> str:
    evidence = core_api.get_evidence(incident_id)
    core_api.record_action(incident_id, "relay_get_evidence", "")
    d = _display(evidence)
    lines = [
        f"Evidence for {incident_id}:",
        d.get("emission") and f"Release: {d['emission']}",
        d.get("provenance") and f"Provenance: {d['provenance']}",
        d.get("asset") and str(d["asset"]),
        "Replayed historical observation." if evidence.get("is_replay") else None,
    ]
    return "\n".join(x for x in lines if x)


def _how_bad(incident_id: str) -> str:
    detail = core_api.get_incident(incident_id)
    evidence = core_api.get_evidence(incident_id)
    core_api.record_action(incident_id, "relay_how_bad", "")
    d = _display(evidence) or _display(detail)
    priority = detail.get("priority") or (detail.get("incident") or {}).get("priority")
    lines = [
        f"Priority: {priority}.",
        d.get("emission") and f"Release: {d['emission']}",
        d.get("asset") and str(d["asset"]),
        "Do not invent a severity beyond the priority and emission display strings.",
    ]
    return "\n".join(x for x in lines if x)


def _history(incident_id: str) -> str:
    hist = core_api.get_asset_history(incident_id)
    core_api.record_action(incident_id, "relay_asset_history", "")
    d = _display(hist)
    lines = [
        f"History for {incident_id}:",
        d.get("history") or hist.get("history_display"),
        d.get("persistence") or hist.get("persistence_display"),
        d.get("previous_incidents"),
    ]
    # Also accept nested provider fields if display missing
    if not any(lines[1:]):
        src = hist.get("source") or {}
        if src:
            lines.append(
                f"Provider source {src.get('source_name')}: "
                f"{len(src.get('detection_dates') or [])} detections / "
                f"{len(src.get('observation_dates') or [])} observations"
            )
    return "\n".join(x for x in lines if x)


def _who_owns(incident_id: str) -> str:
    detail = core_api.get_incident(incident_id)
    asset_id = detail.get("asset_id") or (detail.get("incident") or {}).get("asset_id")
    core_api.record_action(incident_id, "relay_who_owns", str(asset_id or ""))
    if not asset_id:
        d = _display(detail)
        return (
            (d.get("asset") or "No registered asset matched this plume origin.")
            + "\nOwnership is only defined for registered assets."
        )
    asset = core_api.get_asset(str(asset_id))
    name = asset.get("operator_name") or (asset.get("asset") or {}).get("operator_name")
    ftype = asset.get("facility_type") or (asset.get("asset") or {}).get("facility_type")
    return f"Associated asset {asset_id} ({ftype}). Operator: {name}."


def _policy(incident_id: str) -> str:
    policy = core_api.get_escalation_policy(incident_id)
    core_api.record_action(incident_id, "relay_policy", "")
    rule = policy.get("fired_rule_id") or policy.get("rule_id") or "?"
    role = policy.get("notify_role") or "?"
    pid = policy.get("policy_id") or (policy.get("policy") or {}).get("policy_id") or "?"
    return (
        f"Policy {pid}: rule {rule} requires notifying {role}.\n"
        "Acknowledge in CH4SE, then mark INVESTIGATING when your team is engaged."
    )


def _what_to_do(incident_id: str) -> str:
    detail = core_api.get_incident(incident_id)
    briefing = core_api.generate_briefing(incident_id, "sms")
    core_api.record_action(incident_id, "relay_what_to_do", briefing.get("source", ""))
    match = detail.get("match_result") or (detail.get("incident") or {}).get("match_result")
    playbook_bit = _playbook_lines(str(match or "NO_REGISTERED_ASSET"))
    text = briefing.get("text") or ""
    if playbook_bit:
        return f"{text}\n\nResources (demo):\n{playbook_bit}"
    return text


def _playbook_lines(match_result: str) -> str:
    if not PLAYBOOK_PATH.exists():
        return ""
    data = json.loads(PLAYBOOK_PATH.read_text())
    scripts = (data.get("scripts") or {}).get(match_result) or []
    resources = data.get("resources") or []
    lines = [f"• {s}" for s in scripts[:4]]
    if resources:
        top = resources[0]
        lines.append(
            f"• Nearest demo resource: {top.get('label')} "
            f"(~{top.get('eta_minutes_typical')} min typical)"
        )
    return "\n".join(lines)


def _ack(incident_id: str) -> str:
    detail = core_api.get_incident(incident_id)
    contact_id = (
        detail.get("assigned_contact_id")
        or (detail.get("incident") or {}).get("assigned_contact_id")
    )
    if not contact_id:
        return "No assigned contact on this incident; cannot acknowledge via Relay."
    updated = core_api.acknowledge_incident(
        incident_id, str(contact_id), then_status="INVESTIGATING"
    )
    core_api.record_action(incident_id, "relay_acknowledge", "INVESTIGATING")
    status = updated.get("status") or (updated.get("incident") or {}).get("status")
    return (
        f"Acknowledged {incident_id}. Status is now {status}.\n"
        "Dashboard should flip live. Stay safe — treat match wording carefully."
    )
