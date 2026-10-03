"""Thin HTTP client for Core API actions — no business logic."""

from __future__ import annotations

import os
from typing import Any

import httpx

BASE = os.environ.get("CORE_API_BASE", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.environ.get("CORE_API_BEARER", "")


class CoreApiError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def _post(action: str, body: dict[str, Any] | None = None) -> Any:
    if not TOKEN:
        raise RuntimeError("CORE_API_BEARER is not set")
    url = f"{BASE}/actions/{action}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    with httpx.Client(timeout=30.0) as client:
        r = client.post(url, json=body or {}, headers=headers)
        payload = r.json()
    if not payload.get("ok"):
        err = payload.get("error") or {}
        raise CoreApiError(err.get("code", "UNKNOWN"), err.get("message", str(payload)))
    return payload.get("data")


def get_open_incidents(limit: int = 5) -> list[dict]:
    return _post("get_open_incidents", {"limit": limit})


def get_incident(incident_id: str) -> dict:
    return _post("get_incident", {"incident_id": incident_id})


def get_asset(asset_id: str) -> dict:
    return _post("get_asset", {"asset_id": asset_id})


def get_escalation_policy(*, incident_id: str | None = None, asset_id: str | None = None) -> dict:
    body: dict[str, str] = {}
    if incident_id:
        body["incident_id"] = incident_id
    if asset_id:
        body["asset_id"] = asset_id
    return _post("get_escalation_policy", body)


def generate_briefing(incident_id: str, kind: str = "sms") -> dict:
    return _post("generate_briefing", {"incident_id": incident_id, "kind": kind})


def notify_operator(incident_id: str, channel: str = "SMS") -> dict:
    return _post("notify_operator", {"incident_id": incident_id, "channel": channel})


def record_action(incident_id: str, action_name: str, detail: str = "") -> dict:
    return _post(
        "record_action",
        {
            "incident_id": incident_id,
            "actor": "FETCH_AGENT",
            "action_name": action_name,
            "detail": detail,
        },
    )


def handle_highest_priority() -> dict:
    return _post("handle_highest_priority", {"actor": "FETCH_AGENT"})
