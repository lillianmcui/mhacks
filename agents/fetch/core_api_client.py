"""Thin HTTP client for Core API actions — no business logic."""

from __future__ import annotations

import os
from typing import Any

import httpx

from orchestrate import CoreApiError


def _base() -> str:
    return os.environ.get("CORE_API_BASE", "http://127.0.0.1:8787").rstrip("/")


def _token() -> str:
    # Backend root .env uses CORE_API_TOKEN; agents historically used CORE_API_BEARER.
    return os.environ.get("CORE_API_TOKEN") or os.environ.get("CORE_API_BEARER", "")


def _post(action: str, body: dict[str, Any] | None = None) -> Any:
    token = _token()
    if not token:
        raise RuntimeError("CORE_API_TOKEN or CORE_API_BEARER is not set")
    url = f"{_base()}/actions/{action}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=30.0) as client:
        r = client.post(url, json=body or {}, headers=headers)
        try:
            payload = r.json()
        except ValueError as e:
            raise CoreApiError(
                "UNKNOWN", f"non-JSON response HTTP {r.status_code}"
            ) from e
    if not isinstance(payload, dict) or not payload.get("ok"):
        err = (payload or {}).get("error") if isinstance(payload, dict) else {}
        err = err or {}
        raise CoreApiError(
            str(err.get("code", "UNKNOWN")),
            str(err.get("message", payload)),
        )
    return payload.get("data")


class HttpCoreApi:
    def get_open_incidents(self, limit: int = 5) -> list[dict]:
        data = _post("get_open_incidents", {"limit": limit})
        return list(data or [])

    def get_incident(self, incident_id: str) -> dict:
        return _post("get_incident", {"incident_id": incident_id})

    def get_asset(self, asset_id: str) -> dict:
        return _post("get_asset", {"asset_id": asset_id})

    def get_escalation_policy(
        self, *, incident_id: str | None = None, asset_id: str | None = None
    ) -> dict:
        body: dict[str, str] = {}
        if incident_id:
            body["incident_id"] = incident_id
        if asset_id:
            body["asset_id"] = asset_id
        return _post("get_escalation_policy", body)

    def generate_briefing(self, incident_id: str, kind: str = "sms") -> dict:
        return _post("generate_briefing", {"incident_id": incident_id, "kind": kind})

    def notify_operator(self, incident_id: str, channel: str = "SMS") -> dict:
        return _post("notify_operator", {"incident_id": incident_id, "channel": channel})

    def record_action(
        self, incident_id: str, action_name: str, detail: str = ""
    ) -> dict:
        return _post(
            "record_action",
            {
                "incident_id": incident_id,
                "actor": "FETCH_AGENT",
                "action_name": action_name,
                "detail": detail,
            },
        )

    def handle_highest_priority(self) -> dict:
        return _post("handle_highest_priority", {"actor": "FETCH_AGENT"})


# Module-level helpers kept for convenience / older call sites
def get_open_incidents(limit: int = 5) -> list[dict]:
    return HttpCoreApi().get_open_incidents(limit)


def get_incident(incident_id: str) -> dict:
    return HttpCoreApi().get_incident(incident_id)


def get_asset(asset_id: str) -> dict:
    return HttpCoreApi().get_asset(asset_id)


def get_escalation_policy(
    *, incident_id: str | None = None, asset_id: str | None = None
) -> dict:
    return HttpCoreApi().get_escalation_policy(
        incident_id=incident_id, asset_id=asset_id
    )


def generate_briefing(incident_id: str, kind: str = "sms") -> dict:
    return HttpCoreApi().generate_briefing(incident_id, kind)


def notify_operator(incident_id: str, channel: str = "SMS") -> dict:
    return HttpCoreApi().notify_operator(incident_id, channel)


def record_action(incident_id: str, action_name: str, detail: str = "") -> dict:
    return HttpCoreApi().record_action(incident_id, action_name, detail)


def handle_highest_priority() -> dict:
    return HttpCoreApi().handle_highest_priority()
