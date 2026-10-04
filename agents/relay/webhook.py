"""Minimal inbound webhook: forwards tool intents to Core API (expand with Relay SDK)."""

from __future__ import annotations

import os
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException

load_dotenv()

app = FastAPI(title="CH4SE Relay webhook")
BASE = os.environ.get("CORE_API_BASE", "http://127.0.0.1:8787").rstrip("/")
TOKEN = os.environ.get("CORE_API_TOKEN") or os.environ.get("CORE_API_BEARER", "")
SECRET = os.environ.get("RELAY_WEBHOOK_SECRET", "")


def core_post(action: str, body: dict[str, Any]) -> Any:
    r = httpx.post(
        f"{BASE}/actions/{action}",
        json=body,
        headers={"Authorization": f"Bearer {TOKEN}"},
        timeout=30.0,
    )
    return r.json()


@app.post("/relay/inbound")
async def inbound(
    payload: dict[str, Any],
    x_relay_secret: str | None = Header(default=None),
):
    if SECRET and x_relay_secret != SECRET:
        raise HTTPException(status_code=401, detail="invalid webhook secret")

    # Relay-specific shape TBD after capability check; stub expects { action, body }
    action = payload.get("action")
    body = payload.get("body") or {}
    if not action:
        raise HTTPException(status_code=400, detail="missing action")

    if action == "acknowledge_incident":
        body.setdefault("actor", "RELAY_AGENT")
        body.setdefault("channel", "SMS")

    result = core_post(str(action), body)
    return result
