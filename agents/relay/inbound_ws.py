#!/usr/bin/env python3
"""
CH4SE Relay inbound worker (WebSocket).

Listens for operator messages, maps them to Core API actions (no Grok required
for P0 scripted Q&A), and replies in the same Relay chat.

Requires repo-root .env: RELAY_API_KEY, RELAY_API_BASE
And agents/relay/.env or env: CORE_API_BASE, CORE_API_TOKEN

  cd agents/relay
  python inbound_ws.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

import websockets
from dotenv import load_dotenv

import relay_client
from respond import handle_operator_text

# Load agent env then repo-root .env (keys for Relay)
load_dotenv()
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

RELAY_WS = os.environ.get(
    "RELAY_WS_URL",
    "wss://api.relayapp.im/v1/websocket?subscribed_events=message.received",
)
INBOX_DB = Path(os.environ.get("RELAY_INBOX_DB", Path(__file__).resolve().parent / ".relay_inbox.sqlite"))


def _auth_header() -> dict[str, str]:
    key = os.environ.get("RELAY_API_KEY", "")
    if not key:
        raise SystemExit("RELAY_API_KEY missing — put it in the repo-root .env")
    return {"Authorization": f"Bearer {key}"}


def _inbox() -> sqlite3.Connection:
    INBOX_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(INBOX_DB)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, received_at TEXT NOT NULL)"
    )
    conn.commit()
    return conn


def _insert_once(conn: sqlite3.Connection, event_id: str) -> bool:
    try:
        conn.execute(
            "INSERT INTO events(event_id, received_at) VALUES (?, ?)",
            (event_id, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def _extract_text(parts: list) -> str:
    chunks: list[str] = []
    for p in parts or []:
        if isinstance(p, dict) and p.get("type") == "text" and p.get("value"):
            chunks.append(str(p["value"]))
    return "\n".join(chunks).strip()


async def _ping_loop(ws: Any, interval_ms: int) -> None:
    interval = max(5.0, (interval_ms or 30_000) / 1000.0)
    while True:
        await asyncio.sleep(interval)
        await ws.send(json.dumps({"type": "ping"}))


async def _handle_message_received(event: dict) -> None:
    data = event.get("data") or {}
    if data.get("direction") and data.get("direction") != "inbound":
        return
    sender = data.get("sender_handle") or {}
    if sender.get("kind") == "agent" and sender.get("is_me"):
        return

    chat = data.get("chat") or {}
    chat_id = chat.get("id")
    message_id = data.get("id")
    event_id = event.get("event_id") or message_id
    text = _extract_text(data.get("parts") or [])
    if not chat_id or not text:
        return

    print(f"[relay] inbound from {sender.get('handle')}: {text[:120]!r}")
    if message_id:
        try:
            relay_client.mark_read(str(chat_id), str(message_id))
        except Exception as e:  # noqa: BLE001
            print(f"[relay] mark_read failed: {e}")

    reply = handle_operator_text(text)
    relay_client.reply_text(str(chat_id), reply, event_id=str(event_id))
    print(f"[relay] replied ({len(reply)} chars)")


async def run() -> None:
    conn = _inbox()
    backoff = 1.0
    while True:
        try:
            print(f"[relay] connecting {RELAY_WS}")
            async with websockets.connect(
                RELAY_WS,
                additional_headers=_auth_header(),
                ping_interval=None,
                max_size=8_000_000,
            ) as ws:
                backoff = 1.0
                ready_raw = await ws.recv()
                ready = json.loads(ready_raw)
                print(f"[relay] ready: {ready.get('type')} acked_through={ready.get('acked_through')}")
                if ready.get("full_sync_required"):
                    print(
                        "[relay] full_sync_required=true — complete FULL sync per Relay docs before relying on ACK"
                    )
                interval = int(ready.get("heartbeat_interval_ms") or 30_000)
                ping_task = asyncio.create_task(_ping_loop(ws, interval))
                try:
                    async for raw in ws:
                        frame = json.loads(raw)
                        ftype = frame.get("type")
                        if ftype == "pong":
                            continue
                        if ftype == "error":
                            print(f"[relay] error frame: {frame}")
                            continue
                        if ftype == "disconnect":
                            print(f"[relay] disconnect: {frame}")
                            break
                        if ftype != "event":
                            continue

                        sequence = str(frame.get("sequence"))
                        event = frame.get("event") or {}
                        event_id = str(event.get("event_id") or "")
                        is_new = _insert_once(conn, event_id) if event_id else True
                        # ACK after durable insert (dedupe side effects on replay)
                        await ws.send(json.dumps({"type": "ack", "through_sequence": sequence}))
                        if not is_new:
                            print(f"[relay] duplicate event_id {event_id}; acked only")
                            continue
                        if event.get("event_type") == "message.received":
                            try:
                                await _handle_message_received(event)
                            except Exception as e:  # noqa: BLE001
                                print(f"[relay] handler error: {e}")
                finally:
                    ping_task.cancel()
        except Exception as e:  # noqa: BLE001
            print(f"[relay] connection error: {e}; retry in {backoff:.0f}s")
            await asyncio.sleep(backoff)
            backoff = min(60.0, backoff * 2)


if __name__ == "__main__":
    asyncio.run(run())
