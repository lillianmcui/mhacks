"""Async-first HTTP client for Core API actions — no business logic."""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx

from orchestrate import CoreApiError

_READ_ACTIONS = frozenset(
    {
        "get_open_incidents",
        "get_incident",
        "get_asset",
        "get_evidence",
        "get_asset_history",
        "get_escalation_policy",
        "generate_briefing",
    }
)
_SIDE_EFFECT_ACTIONS = frozenset(
    {
        "notify_operator",
        "record_action",
        "handle_highest_priority",
        "acknowledge_incident",
        "set_incident_status",
    }
)


def _base() -> str:
    return os.environ.get("CORE_API_BASE", "http://127.0.0.1:8787").rstrip("/")


def _token() -> str:
    # Backend root .env uses CORE_API_TOKEN; agents historically used CORE_API_BEARER.
    return os.environ.get("CORE_API_TOKEN") or os.environ.get("CORE_API_BEARER", "")


class HttpCoreApi:
    """Async Core API client. Reuse one instance per agent request when useful."""

    def __init__(self, *, timeout: float = 30.0) -> None:
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> HttpCoreApi:
        self._client = httpx.AsyncClient(timeout=self._timeout)
        return self

    async def __aexit__(self, *args: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _post(
        self,
        action: str,
        body: dict[str, Any] | None = None,
        *,
        retries: int | None = None,
    ) -> Any:
        token = _token()
        if not token:
            raise RuntimeError("CORE_API_TOKEN or CORE_API_BEARER is not set")

        if retries is None:
            retries = 2 if action in _READ_ACTIONS else 0

        url = f"{_base()}/actions/{action}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        payload_body = body or {}
        last_err: Exception | None = None

        for attempt in range(retries + 1):
            try:
                return await self._once(url, headers, payload_body)
            except CoreApiError as e:
                last_err = e
                # Retry only transient upstream / rate-limit style failures on reads.
                if action in _SIDE_EFFECT_ACTIONS or e.code not in (
                    "UPSTREAM_UNAVAILABLE",
                    "UNKNOWN",
                ):
                    raise
                if attempt >= retries:
                    raise
                await asyncio.sleep(0.25 * (attempt + 1))
            except (httpx.TimeoutException, httpx.TransportError) as e:
                last_err = e
                if action in _SIDE_EFFECT_ACTIONS or attempt >= retries:
                    raise CoreApiError("UPSTREAM_UNAVAILABLE", str(e)) from e
                await asyncio.sleep(0.25 * (attempt + 1))

        assert last_err is not None
        raise last_err

    async def _once(
        self, url: str, headers: dict[str, str], body: dict[str, Any]
    ) -> Any:
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=self._timeout)
        try:
            r = await client.post(url, json=body, headers=headers)
            try:
                payload = r.json()
            except ValueError as e:
                raise CoreApiError(
                    "UNKNOWN", f"non-JSON response HTTP {r.status_code}"
                ) from e
            if r.status_code == 429:
                raise CoreApiError("UPSTREAM_UNAVAILABLE", f"HTTP 429: {payload}")
            if r.status_code >= 500:
                raise CoreApiError(
                    "UPSTREAM_UNAVAILABLE", f"HTTP {r.status_code}: {payload}"
                )
        finally:
            if owns_client:
                await client.aclose()

        if not isinstance(payload, dict) or not payload.get("ok"):
            err = (payload or {}).get("error") if isinstance(payload, dict) else {}
            err = err or {}
            raise CoreApiError(
                str(err.get("code", "UNKNOWN")),
                str(err.get("message", payload)),
            )
        return payload.get("data")

    async def get_open_incidents(self, limit: int = 10) -> list[dict]:
        data = await self._post("get_open_incidents", {"limit": limit})
        return list(data or [])

    async def get_incident(self, incident_id: str) -> dict:
        return await self._post("get_incident", {"incident_id": incident_id})

    async def get_asset(self, asset_id: str) -> dict:
        return await self._post("get_asset", {"asset_id": asset_id})

    async def get_evidence(self, incident_id: str) -> dict:
        return await self._post("get_evidence", {"incident_id": incident_id})

    async def get_asset_history(self, incident_id: str) -> dict:
        return await self._post("get_asset_history", {"incident_id": incident_id})

    async def get_escalation_policy(
        self, *, incident_id: str | None = None, asset_id: str | None = None
    ) -> dict:
        body: dict[str, str] = {}
        if incident_id:
            body["incident_id"] = incident_id
        if asset_id:
            body["asset_id"] = asset_id
        return await self._post("get_escalation_policy", body)

    async def generate_briefing(self, incident_id: str, kind: str = "sms") -> dict:
        return await self._post(
            "generate_briefing", {"incident_id": incident_id, "kind": kind}
        )

    async def notify_operator(
        self, incident_id: str, channel: str = "SMS", *, actor: str = "FETCH_AGENT"
    ) -> dict:
        return await self._post(
            "notify_operator",
            {"incident_id": incident_id, "channel": channel, "actor": actor},
            retries=0,
        )

    async def record_action(
        self, incident_id: str, action_name: str, detail: str = ""
    ) -> dict:
        return await self._post(
            "record_action",
            {
                "incident_id": incident_id,
                "actor": "FETCH_AGENT",
                "action_name": action_name,
                "detail": detail,
            },
            retries=0,
        )

    async def handle_highest_priority(self) -> dict:
        """Compatibility only — Fetch demo orchestration does not call this."""
        return await self._post(
            "handle_highest_priority", {"actor": "FETCH_AGENT"}, retries=0
        )


# Sync wrappers for CLI / tests that prefer blocking calls.
def _run(coro: Any) -> Any:
    return asyncio.run(coro)


def get_open_incidents(limit: int = 10) -> list[dict]:
    return _run(HttpCoreApi().get_open_incidents(limit))


def get_incident(incident_id: str) -> dict:
    return _run(HttpCoreApi().get_incident(incident_id))


def notify_operator(incident_id: str, channel: str = "SMS") -> dict:
    return _run(HttpCoreApi().notify_operator(incident_id, channel))
