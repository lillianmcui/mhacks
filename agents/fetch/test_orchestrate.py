"""Unit tests for Fetch orchestration (no network, no uAgents)."""

from __future__ import annotations

import unittest
from typing import Any

from orchestrate import CoreApiError, handle_user_request, run_handle_sequence, summarize_open


class FakeApi:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._open = [
            {
                "incident_id": "inc-1",
                "asset_id": "TX-184",
                "facility_type": "compressor_station",
                "priority": "HIGH",
            }
        ]

    def get_open_incidents(self, limit: int = 5) -> list[dict]:
        self.calls.append(("get_open_incidents", {"limit": limit}))
        return self._open[:limit]

    def get_incident(self, incident_id: str) -> dict:
        self.calls.append(("get_incident", {"incident_id": incident_id}))
        return {
            "incident_id": incident_id,
            "asset_id": "TX-184",
            "facility_type": "compressor_station",
        }

    def get_asset(self, asset_id: str) -> dict:
        self.calls.append(("get_asset", {"asset_id": asset_id}))
        return {"asset_id": asset_id}

    def get_escalation_policy(
        self, *, incident_id: str | None = None, asset_id: str | None = None
    ) -> dict:
        self.calls.append(
            ("get_escalation_policy", {"incident_id": incident_id, "asset_id": asset_id})
        )
        return {"policy_id": "policy-default"}

    def generate_briefing(self, incident_id: str, kind: str = "sms") -> dict:
        self.calls.append(("generate_briefing", {"incident_id": incident_id, "kind": kind}))
        return {"text": "SMS stub for TX-184", "source": "TEMPLATE"}

    def notify_operator(self, incident_id: str, channel: str = "SMS") -> dict:
        self.calls.append(("notify_operator", {"incident_id": incident_id, "channel": channel}))
        return {"alert_id": "a1", "delivery_status": "queued"}

    def record_action(
        self, incident_id: str, action_name: str, detail: str = ""
    ) -> dict:
        self.calls.append(
            (
                "record_action",
                {
                    "incident_id": incident_id,
                    "action_name": action_name,
                    "detail": detail,
                },
            )
        )
        return {"action_id": "x"}

    def handle_highest_priority(self) -> dict:
        self.calls.append(("handle_highest_priority", {}))
        raise CoreApiError("NOT_FOUND", "not implemented")


class OrchestrateTests(unittest.TestCase):
    def test_summarize_empty(self) -> None:
        self.assertIn("No unresolved", summarize_open([]))

    def test_summarize_top(self) -> None:
        text = summarize_open(
            [
                {
                    "incident_id": "inc-1",
                    "asset_id": "TX-184",
                    "facility_type": "compressor_station",
                    "priority": "CRITICAL",
                }
            ]
        )
        self.assertIn("1 unresolved", text)
        self.assertIn("TX-184", text)
        self.assertIn("compressor_station", text)
        self.assertIn("CRITICAL", text)

    def test_handle_sequence_records_each_step(self) -> None:
        api = FakeApi()
        out = run_handle_sequence(api, "inc-1")
        names = [c[0] for c in api.calls]
        self.assertEqual(
            names,
            [
                "get_incident",
                "record_action",
                "get_asset",
                "record_action",
                "get_escalation_policy",
                "record_action",
                "generate_briefing",
                "record_action",
                "notify_operator",
                "record_action",
            ],
        )
        recorded = [c[1]["action_name"] for c in api.calls if c[0] == "record_action"]
        self.assertEqual(
            recorded,
            [
                "get_incident",
                "get_asset",
                "get_escalation_policy",
                "generate_briefing",
                "notify_operator",
            ],
        )
        self.assertIn("TX-184", out["summary"])

    def test_user_unresolved(self) -> None:
        api = FakeApi()
        reply = handle_user_request(api, "Do we have any unresolved methane incidents?")
        self.assertIn("TX-184", reply)

    def test_user_handle_falls_back_to_sequence(self) -> None:
        api = FakeApi()
        reply = handle_user_request(api, "Handle the highest priority one")
        self.assertIn("Handled inc-1", reply)
        self.assertIn("SMS stub", reply)

    def test_user_handle_no_open(self) -> None:
        api = FakeApi()
        api._open = []
        reply = handle_user_request(api, "Handle the highest priority one")
        self.assertEqual(reply, "No open incidents to handle.")

    def test_help_text(self) -> None:
        api = FakeApi()
        reply = handle_user_request(api, "hello")
        self.assertIn("Ask:", reply)


if __name__ == "__main__":
    unittest.main()
