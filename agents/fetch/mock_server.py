#!/usr/bin/env python3
"""
Local stub Core API for Fetch agent development until backend CP0 lands.

Canned shapes match TRACK_BACKEND §3.6–3.7. Values are clearly synthetic stubs —
not Carbon Mapper fixtures. Do not use this for demo replay.

  python mock_server.py
  # listens on http://127.0.0.1:8787
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

HOST = os.environ.get("MOCK_CORE_HOST", "127.0.0.1")
PORT = int(os.environ.get("MOCK_CORE_PORT", "8787"))
TOKEN = (
    os.environ.get("CORE_API_TOKEN")
    or os.environ.get("CORE_API_BEARER")
    or "dev-bearer"
)

INCIDENT_ID = "inc-stub-001"
ASSET_ID = "TX-184"
CONTACT_ID = "contact-ops-lead"

# Synthetic display strings only — labeled as stub, not real provider numbers.
SMS_TEXT = (
    "This is a replayed historical observation from Carbon Mapper, not a live event. "
    "CH4SE alert: STUB_EMISSION_DISPLAY at STUB_TIMESTAMP. "
    "Review associated asset TX-184 (compressor_station). Priority: HIGH."
)

ACTIONS: list[dict[str, Any]] = []


def ok(data: Any) -> dict:
    return {"ok": True, "data": data}


def err(code: str, message: str) -> dict:
    return {"ok": False, "error": {"code": code, "message": message}}


def open_incidents() -> list[dict]:
    return [
        {
            "incident_id": INCIDENT_ID,
            "asset_id": ASSET_ID,
            "facility_type": "compressor_station",
            "priority": "HIGH",
            "priority_display": "HIGH",
            "status": "ANALYZED",
            "match_result": "MATCHED",
        }
    ]


def dispatch(action: str, body: dict[str, Any]) -> dict:
    if action == "get_open_incidents":
        limit = int(body.get("limit") or 5)
        return ok(open_incidents()[:limit])

    if action == "get_incident":
        iid = body.get("incident_id")
        if iid != INCIDENT_ID:
            return err("NOT_FOUND", f"incident {iid}")
        return ok(
            {
                "incident_id": INCIDENT_ID,
                "asset_id": ASSET_ID,
                "facility_type": "compressor_station",
                "priority": "HIGH",
                "status": "ANALYZED",
                "match_result": "MATCHED",
                "distance_m": 42.0,
                "assigned_contact_id": CONTACT_ID,
            }
        )

    if action == "get_asset":
        aid = body.get("asset_id")
        if aid != ASSET_ID:
            return err("NOT_FOUND", f"asset {aid}")
        return ok(
            {
                "asset_id": ASSET_ID,
                "facility_type": "compressor_station",
                "operator_name": "Basin Midstream Co.",
                "latitude": 31.8508,
                "longitude": -103.4495,
                "contact": {
                    "contact_id": CONTACT_ID,
                    "name": "Ops Lead (teammate)",
                    "role": "site_manager",
                    "phone": "+1REPLACE_ME",
                },
            }
        )

    if action == "get_escalation_policy":
        return ok(
            {
                "policy_id": "policy-default",
                "fired_rule_id": "high-emission",
                "priority": "HIGH",
                "notify_role": "site_manager",
            }
        )

    if action == "generate_briefing":
        if body.get("incident_id") != INCIDENT_ID:
            return err("NOT_FOUND", "incident")
        return ok({"text": SMS_TEXT, "source": "TEMPLATE"})

    if action == "notify_operator":
        if body.get("incident_id") != INCIDENT_ID:
            return err("NOT_FOUND", "incident")
        # Contract DeliveryStatus: SENT | DELIVERED | FAILED
        return ok({"alert_id": "alert-stub-001", "delivery_status": "SENT"})

    if action == "record_action":
        ACTIONS.append(body)
        return ok({"action_id": f"act-{len(ACTIONS):04d}"})

    if action == "handle_highest_priority":
        # Simulate backend not implementing this yet so Fetch exercises local sequence.
        return err("NOT_FOUND", "handle_highest_priority not implemented in mock")

    if action in (
        "get_evidence",
        "get_asset_history",
        "acknowledge_incident",
        "set_incident_status",
    ):
        return ok({"stub": True, "action": action, "body": body})

    return err("VALIDATION_ERROR", f"unknown action {action}")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[mock-core] {self.address_string()} {fmt % args}")

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, dict) else {}

    def _write(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        auth = self.headers.get("Authorization", "")
        if auth != f"Bearer {TOKEN}":
            self._write(401, err("UNAUTHORIZED", "bad bearer"))
            return
        if not path.startswith("/actions/"):
            self._write(404, err("NOT_FOUND", path))
            return
        action = path[len("/actions/") :].strip("/")
        body = self._read_json()
        self._write(200, dispatch(action, body))


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Mock Core API on http://{HOST}:{PORT}  bearer={TOKEN!r}", flush=True)
    print(
        "Set CORE_API_BASE and CORE_API_BEARER to match, then run: python cli.py",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down", flush=True)


if __name__ == "__main__":
    main()
