"""Inbound replies: prefer grounded Grok; fall back to deterministic scripts."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import core_api
from grok_inbound import answer_with_grok, grok_enabled
from intent import Intent, classify

PLAYBOOK_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "fixtures"
    / "company"
    / "response_playbook.json"
)


def resolve_incident_id(explicit: str | None = None) -> str:
    if explicit:
        return explicit
    env_id = os.environ.get("RELAY_DEFAULT_INCIDENT_ID", "").strip()
    if env_id:
        return env_id
    open_ones = core_api.get_open_incidents(limit=1)
    if not open_ones:
        raise core_api.CoreApiError("NO_OPEN_INCIDENTS", "no open incidents")
    return str(open_ones[0]["incident_id"])


def build_context_pack(incident_id: str) -> dict[str, Any]:
    """Assemble structured CH4SE facts for grounding (no phones)."""
    detail = core_api.get_incident(incident_id)
    evidence: dict[str, Any] = {}
    history: dict[str, Any] = {}
    policy: dict[str, Any] = {}
    asset: dict[str, Any] | None = None
    try:
        evidence = core_api.get_evidence(incident_id)
    except core_api.CoreApiError:
        pass
    try:
        history = core_api.get_asset_history(incident_id)
    except core_api.CoreApiError:
        pass
    try:
        policy = core_api.get_escalation_policy(incident_id)
    except core_api.CoreApiError:
        pass

    asset_id = detail.get("asset_id") or (detail.get("incident") or {}).get("asset_id")
    if asset_id:
        try:
            raw = core_api.get_asset(str(asset_id))
            # Strip phone numbers before Grok sees the pack.
            asset = _redact_phones(raw)
        except core_api.CoreApiError:
            asset = {"asset_id": asset_id}

    playbook = None
    if PLAYBOOK_PATH.exists():
        try:
            playbook = json.loads(PLAYBOOK_PATH.read_text())
        except json.JSONDecodeError:
            playbook = None

    return {
        "incident_id": incident_id,
        "incident": _redact_phones(detail),
        "evidence": _redact_phones(evidence),
        "history": _redact_phones(history),
        "policy": _redact_phones(policy),
        "asset": asset,
        "response_playbook": playbook,
        "grounding_notes": [
            "Quote display strings verbatim for any quantity or date.",
            "Playbook resources are synthetic demo inventory, not live dispatch proof.",
            "This demo may be a replayed historical observation.",
        ],
    }


def handle_operator_text(text: str, *, incident_id: str | None = None) -> str:
    intent = classify(text)
    try:
        iid = resolve_incident_id(incident_id)
    except core_api.CoreApiError as e:
        return f"CH4SE has no open incident to discuss ({e.code})."

    # State changes always go through Core API, not the LLM.
    if intent == Intent.ACKNOWLEDGE:
        try:
            ack_msg = _ack(iid)
        except core_api.CoreApiError as e:
            return f"Could not acknowledge ({e.code}: {e.message})."
        if grok_enabled():
            try:
                ctx = build_context_pack(iid)
                ctx["action_just_taken"] = {
                    "acknowledge_incident": True,
                    "then_status": "INVESTIGATING",
                    "system_message": ack_msg,
                }
                return answer_with_grok(
                    "Confirm acknowledgement briefly to the operator.",
                    ctx,
                )
            except Exception as e:  # noqa: BLE001
                print(f"[relay] grok ack phrasing failed: {e}")
        return ack_msg

    # Free-form: Grok over a fresh context pack.
    if grok_enabled():
        try:
            ctx = build_context_pack(iid)
            core_api.record_action(iid, "relay_grok_inbound", text[:120])
            return answer_with_grok(text, ctx)
        except Exception as e:  # noqa: BLE001
            print(f"[relay] grok inbound failed, using deterministic fallback: {e}")

    return _deterministic_fallback(text, iid, intent)


def _redact_phones(value: Any) -> Any:
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if k in ("phone", "to_phone") or k.endswith("_phone"):
                out[k] = "[redacted]"
            else:
                out[k] = _redact_phones(v)
        return out
    if isinstance(value, list):
        return [_redact_phones(v) for v in value]
    return value


def _deterministic_fallback(text: str, incident_id: str, intent: Intent) -> str:
    """Legacy scripted path if Grok is off or fails number-check."""
    try:
        if intent == Intent.HELP:
            return _help(False)
        if intent == Intent.WHY_ALERTED:
            return _why(incident_id)
        if intent == Intent.EVIDENCE:
            return _evidence(incident_id)
        if intent == Intent.HOW_BAD:
            return _how_bad(incident_id)
        if intent == Intent.HISTORY:
            return _history(incident_id)
        if intent == Intent.WHO_OWNS:
            return _who_owns(incident_id)
        if intent == Intent.POLICY:
            return _policy(incident_id)
        if intent == Intent.WHAT_TO_DO:
            return _what_to_do(incident_id)
        # Unknown free-form without Grok: still try a short sms briefing + tip
        briefing = core_api.generate_briefing(incident_id, "sms")
        return (
            (briefing.get("text") or "Here is the current CH4SE sms briefing.")
            + "\n\n(Grok inbound unavailable — ask a clearer question or retry.)"
        )
    except core_api.CoreApiError as e:
        return f"CH4SE could not complete that ({e.code}: {e.message})."


def _help(unknown: bool) -> str:
    prefix = "I didn't catch that. " if unknown else ""
    return (
        prefix
        + "Ask anything about the open incident — severity, evidence, history, "
        + "policy, what to do — or say acknowledge / mark investigating."
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
    ]
    return "\n".join(x for x in lines if x)


def _history(incident_id: str) -> str:
    hist = core_api.get_asset_history(incident_id)
    core_api.record_action(incident_id, "relay_asset_history", "")
    d = _display(hist)
    lines = [
        f"History for {incident_id}:",
        d.get("history"),
        d.get("persistence"),
        d.get("previous_incidents"),
    ]
    return "\n".join(x for x in lines if x)


def _who_owns(incident_id: str) -> str:
    detail = core_api.get_incident(incident_id)
    asset_id = detail.get("asset_id") or (detail.get("incident") or {}).get("asset_id")
    core_api.record_action(incident_id, "relay_who_owns", str(asset_id or ""))
    if not asset_id:
        d = _display(detail)
        return (d.get("asset") or "No registered asset matched this plume origin.") + (
            "\nOwnership is only defined for registered assets."
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
    return f"Policy {pid}: rule {rule} requires notifying {role}."


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
    contact_id = detail.get("assigned_contact_id") or (
        detail.get("incident") or {}
    ).get("assigned_contact_id")
    if not contact_id:
        return "No assigned contact on this incident; cannot acknowledge via Relay."
    updated = core_api.acknowledge_incident(
        incident_id, str(contact_id), then_status="INVESTIGATING"
    )
    core_api.record_action(incident_id, "relay_acknowledge", "INVESTIGATING")
    status = updated.get("status") or (updated.get("incident") or {}).get("status")
    return f"Acknowledged {incident_id}. Status is now {status}."
