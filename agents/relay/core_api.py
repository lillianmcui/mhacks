"""Core API client for the Relay inbound agent (actor RELAY_AGENT)."""

from __future__ import annotations

import os
from typing import Any

import httpx


class CoreApiError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def _base() -> str:
    return os.environ.get("CORE_API_BASE", "http://127.0.0.1:8787").rstrip("/")


def _token() -> str:
    return os.environ.get("CORE_API_TOKEN") or os.environ.get("CORE_API_BEARER", "")


def post(action: str, body: dict[str, Any] | None = None) -> Any:
    token = _token()
    if not token:
        raise RuntimeError("CORE_API_TOKEN or CORE_API_BEARER is not set")
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            f"{_base()}/actions/{action}",
            json=body or {},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        try:
            payload = r.json()
        except ValueError as e:
            raise CoreApiError("UNKNOWN", f"non-JSON HTTP {r.status_code}") from e
    if not isinstance(payload, dict) or not payload.get("ok"):
        err = (payload or {}).get("error") if isinstance(payload, dict) else {}
        err = err or {}
        raise CoreApiError(str(err.get("code", "UNKNOWN")), str(err.get("message", payload)))
    return payload.get("data")


def get_open_incidents(limit: int = 5) -> list[dict]:
    return list(post("get_open_incidents", {"limit": limit}) or [])


def get_incident(incident_id: str) -> dict:
    return post("get_incident", {"incident_id": incident_id})


def get_evidence(incident_id: str) -> dict:
    return post("get_evidence", {"incident_id": incident_id})


def get_asset(asset_id: str) -> dict:
    return post("get_asset", {"asset_id": asset_id})


def get_asset_history(incident_id: str) -> dict:
    return post("get_asset_history", {"incident_id": incident_id})


def get_escalation_policy(incident_id: str) -> dict:
    return post("get_escalation_policy", {"incident_id": incident_id})


def generate_briefing(incident_id: str, kind: str = "sms") -> dict:
    return post("generate_briefing", {"incident_id": incident_id, "kind": kind})


def acknowledge_incident(
    incident_id: str,
    contact_id: str,
    *,
    then_status: str | None = "INVESTIGATING",
) -> dict:
    body: dict[str, Any] = {
        "incident_id": incident_id,
        "contact_id": contact_id,
        "channel": "SMS",
    }
    if then_status:
        body["then_status"] = then_status
    return post("acknowledge_incident", body)


def record_action(incident_id: str, action_name: str, detail: str = "") -> dict:
    return post(
        "record_action",
        {
            "incident_id": incident_id,
            "actor": "RELAY_AGENT",
            "action_name": action_name,
            "detail": detail,
        },
    )
