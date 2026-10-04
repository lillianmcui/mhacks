"""HTTP entry for local/tunnel testing — same respond path as the WebSocket worker."""

from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException

from respond import handle_operator_text

load_dotenv()

app = FastAPI(title="CH4SE Relay inbound")
SECRET = os.environ.get("RELAY_WEBHOOK_SECRET", "")


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "ch4se-relay-inbound"}


@app.post("/relay/inbound")
async def inbound(
    payload: dict[str, Any],
    x_relay_secret: str | None = Header(default=None),
):
    """
    Accept either:
    - Relay-like { event_type, data: { chat, parts, ... } }
    - Simple test { text, incident_id? }
    """
    if SECRET and x_relay_secret != SECRET:
        raise HTTPException(status_code=401, detail="invalid webhook secret")

    if "text" in payload:
        reply = handle_operator_text(
            str(payload.get("text") or ""),
            incident_id=payload.get("incident_id"),
        )
        return {"ok": True, "reply": reply}

    event_type = payload.get("event_type") or (payload.get("event") or {}).get("event_type")
    data = payload.get("data") or (payload.get("event") or {}).get("data") or {}
    if event_type and event_type != "message.received":
        return {"ok": True, "ignored": event_type}

    parts = data.get("parts") or []
    text = "\n".join(
        str(p.get("value")) for p in parts if isinstance(p, dict) and p.get("type") == "text"
    )
    if not text and payload.get("body"):
        text = str(payload["body"])
    reply = handle_operator_text(text, incident_id=payload.get("incident_id"))
    return {"ok": True, "reply": reply, "chat_id": (data.get("chat") or {}).get("id")}
