"""Thin Relay HTTPS helpers for inbound replies."""

from __future__ import annotations

import os
from typing import Any

import httpx


def _base() -> str:
    return (os.environ.get("RELAY_API_BASE") or "https://api.relayapp.im").rstrip("/")


def _key() -> str:
    key = os.environ.get("RELAY_API_KEY", "")
    if not key:
        raise RuntimeError("RELAY_API_KEY is not set (repo-root .env)")
    return key


def headers(idempotency_key: str | None = None) -> dict[str, str]:
    h = {
        "Authorization": f"Bearer {_key()}",
        "Content-Type": "application/json",
    }
    if idempotency_key:
        h["Idempotency-Key"] = idempotency_key
    return h


def mark_read(chat_id: str, message_id: str | None = None) -> None:
    # POST /v1/chats/{chatId}/read — no body in current Relay API.
    del message_id  # kept for call-site compatibility
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            f"{_base()}/v1/chats/{chat_id}/read",
            headers=headers(),
        )
        if r.status_code >= 400:
            print(f"[relay] mark_read HTTP {r.status_code}: {r.text[:200]}")


def reply_text(chat_id: str, text: str, *, event_id: str) -> dict[str, Any]:
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            f"{_base()}/v1/chats/{chat_id}/messages",
            headers=headers(idempotency_key=f"ch4se-reply-{event_id}"),
            json={"message": {"parts": [{"type": "text", "value": text}]}},
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Relay reply HTTP {r.status_code}: {r.text[:500]}")
        return r.json()
