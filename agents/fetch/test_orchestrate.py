"""Unit tests for Fetch intent + orchestration (no network, no uAgents)."""

from __future__ import annotations

import asyncio
import unittest
from typing import Any

from intent import Intent, classify
from orchestrate import (
    CoreApiError,
    handle_user_request,
    summarize_open,
    unacknowledged,
)


class FakeApi:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._open = [
            {
                "incident_id": "INC-0001",
                "asset_id": "TX-184",
                "facility_type": "compressor_station",
                "priority": "CRITICAL",
                "status": "ANALYZED",
                "is_replay": True,
                "display": {
                    "headline": "CRITICAL — UNACKNOWLEDGED",
                    "asset": "Associated asset: TX-184 compressor_station (18 m from plume origin)",
                    "emission": "1993 ± 521 kg CH4/hr (Carbon Mapper estimate)",
                    "provenance": "Carbon Mapper · Tanager · 2026-08-13 19:04 UTC",
                },
            }
        ]
        self.notify_result = {"alert_id": "a1", "delivery_status": "DELIVERED"}
        self.notify_error: CoreApiError | None = None

    async def get_open_incidents(self, limit: int = 10) -> list[dict]:
        self.calls.append(("get_open_incidents", {"limit": limit}))
        return self._open[:limit]

    async def get_incident(self, incident_id: str) -> dict:
        self.calls.append(("get_incident", {"incident_id": incident_id}))
        return {
            "incident": {
                "incident_id": incident_id,
                "asset_id": "TX-184",
                "priority": "CRITICAL",
                "status": "ANALYZED",
            },
            "status": "ANALYZED",
            "asset": {"asset_id": "TX-184", "facility_type": "compressor_station"},
            "assigned_contact": {"contact_id": "contact-ops-lead", "name": "Ops Lead"},
            "display": self._open[0]["display"],
            "is_replay": True,
        }

    async def get_asset(self, asset_id: str) -> dict:
        self.calls.append(("get_asset", {"asset_id": asset_id}))
        return {"asset": {"asset_id": asset_id}, "contact": {"name": "Ops Lead"}}

    async def get_evidence(self, incident_id: str) -> dict:
        self.calls.append(("get_evidence", {"incident_id": incident_id}))
        return {
            "incident_id": incident_id,
            "is_replay": True,
            "display": {
                "emission": "1993 ± 521 kg CH4/hr (Carbon Mapper estimate)",
                "provenance": "Carbon Mapper · Tanager · 2026-08-13 19:04 UTC",
            },
        }

    async def get_asset_history(self, incident_id: str) -> dict:
        self.calls.append(("get_asset_history", {"incident_id": incident_id}))
        return {"incident_id": incident_id, "source": {}}

    async def get_escalation_policy(
        self, *, incident_id: str | None = None, asset_id: str | None = None
    ) -> dict:
        self.calls.append(
            ("get_escalation_policy", {"incident_id": incident_id, "asset_id": asset_id})
        )
        return {
            "policy": {"policy_id": "policy-default"},
            "fired_rule": {"rule_id": "critical-emission"},
            "notify_role": "site_manager",
        }

    async def generate_briefing(self, incident_id: str, kind: str = "sms") -> dict:
        self.calls.append(("generate_briefing", {"incident_id": incident_id, "kind": kind}))
        return {"text": "SMS stub for TX-184", "source": "TEMPLATE"}

    async def notify_operator(
        self, incident_id: str, channel: str = "SMS", *, actor: str = "FETCH_AGENT"
    ) -> dict:
        self.calls.append(
            (
                "notify_operator",
                {"incident_id": incident_id, "channel": channel, "actor": actor},
            )
        )
        if self.notify_error:
            raise self.notify_error
        return self.notify_result

    async def record_action(
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


def run(coro: Any) -> Any:
    return asyncio.run(coro)


class IntentTests(unittest.TestCase):
    def test_explain_before_handle(self) -> None:
        r = classify("walk me through what happens when you handle the top priority")
        self.assertEqual(r.intent, Intent.EXPLAIN)

    def test_handle(self) -> None:
        r = classify("Handle our highest-priority methane incident.")
        self.assertEqual(r.intent, Intent.HANDLE)

    def test_investigate_with_id(self) -> None:
        r = classify("Why is INC-0001 critical?")
        self.assertEqual(r.intent, Intent.INVESTIGATE)
        self.assertEqual(r.incident_id, "INC-0001")

    def test_status_ack(self) -> None:
        r = classify("Has the operator acknowledged it?")
        self.assertEqual(r.intent, Intent.STATUS)

    def test_list(self) -> None:
        r = classify("Do we have any unresolved methane incidents?")
        self.assertEqual(r.intent, Intent.LIST_OPEN)


class OrchestrateTests(unittest.TestCase):
    def test_summarize_quotes_display(self) -> None:
        text = summarize_open(
            [
                {
                    "incident_id": "INC-0001",
                    "asset_id": "TX-184",
                    "facility_type": "compressor_station",
                    "priority": "CRITICAL",
                    "status": "ANALYZED",
                    "is_replay": True,
                    "display": {
                        "headline": "CRITICAL — UNACKNOWLEDGED",
                        "asset": "Associated asset: TX-184 compressor_station (18 m from plume origin)",
                        "emission": "1993 ± 521 kg CH4/hr (Carbon Mapper estimate)",
                        "provenance": "Carbon Mapper · Tanager · 2026-08-13 19:04 UTC",
                    },
                }
            ]
        )
        self.assertIn("1993 ± 521 kg CH4/hr (Carbon Mapper estimate)", text)
        self.assertIn("Associated asset: TX-184", text)

    def test_unacknowledged_filter(self) -> None:
        rows = [
            {"incident_id": "a", "status": "INVESTIGATING"},
            {"incident_id": "b", "status": "ANALYZED"},
        ]
        waiting = unacknowledged(rows)
        self.assertEqual([w["incident_id"] for w in waiting], ["b"])

    def test_list_open(self) -> None:
        api = FakeApi()
        reply = run(handle_user_request(api, "Do we have any unresolved methane incidents?"))
        self.assertIn("INC-0001", reply)
        self.assertIn("1993 ± 521", reply)

    def test_handle_orchestrates_tools_not_one_shot(self) -> None:
        api = FakeApi()
        reply = run(
            handle_user_request(api, "Handle our highest-priority methane incident.")
        )
        names = [c[0] for c in api.calls]
        self.assertIn("get_open_incidents", names)
        self.assertIn("get_incident", names)
        self.assertIn("get_asset", names)
        self.assertIn("get_escalation_policy", names)
        self.assertIn("generate_briefing", names)
        self.assertIn("notify_operator", names)
        self.assertNotIn("handle_highest_priority", names)
        notify = next(c for c in api.calls if c[0] == "notify_operator")
        self.assertEqual(notify[1].get("actor"), "FETCH_AGENT")
        self.assertIn("Relay", reply)
        self.assertIn("DELIVERED", reply)
        self.assertIn("1993 ± 521", reply)

    def test_investigate_does_not_notify(self) -> None:
        api = FakeApi()
        reply = run(handle_user_request(api, "Why is INC-0001 critical?"))
        names = [c[0] for c in api.calls]
        self.assertIn("get_evidence", names)
        self.assertNotIn("notify_operator", names)
        self.assertIn("read-only", reply.lower())

    def test_status_unacked(self) -> None:
        api = FakeApi()

        async def alerted(incident_id: str) -> dict:
            data = await FakeApi.get_incident(api, incident_id)
            data["status"] = "ALERT_SENT"
            data["incident"]["status"] = "ALERT_SENT"
            return data

        api.get_incident = alerted  # type: ignore[method-assign]
        reply = run(handle_user_request(api, "Has the operator acknowledged INC-0001?"))
        self.assertIn("Not yet", reply)
        self.assertIn("awaiting operator acknowledgement", reply)

    def test_status_acked(self) -> None:
        api = FakeApi()

        async def investigating(incident_id: str) -> dict:
            data = await FakeApi.get_incident(api, incident_id)
            data["status"] = "INVESTIGATING"
            data["incident"]["status"] = "INVESTIGATING"
            return data

        api.get_incident = investigating  # type: ignore[method-assign]
        reply = run(handle_user_request(api, "Has the operator acknowledged it?"))
        self.assertIn("Yes", reply)
        self.assertIn("INVESTIGATING", reply)

    def test_handle_skips_acknowledged_open_rows(self) -> None:
        api = FakeApi()
        api._open = [
            {
                "incident_id": "INC-OLD",
                "asset_id": "TX-190",
                "priority": "HIGH",
                "status": "INVESTIGATING",
                "display": {"headline": "HIGH — INVESTIGATING", "asset": "TX-190"},
            },
            {
                "incident_id": "INC-0001",
                "asset_id": "TX-184",
                "priority": "CRITICAL",
                "status": "ANALYZED",
                "display": {
                    "headline": "CRITICAL — UNACKNOWLEDGED",
                    "asset": "Associated asset: TX-184",
                    "emission": "1993 ± 521 kg CH4/hr (Carbon Mapper estimate)",
                },
            },
        ]
        reply = run(handle_user_request(api, "Handle the highest priority one"))
        self.assertIn("INC-0001", reply)
        notify = next(c for c in api.calls if c[0] == "notify_operator")
        self.assertEqual(notify[1]["incident_id"], "INC-0001")

    def test_notify_failure_is_truthful(self) -> None:
        api = FakeApi()
        api.notify_error = CoreApiError("UPSTREAM_UNAVAILABLE", "Relay down")
        reply = run(handle_user_request(api, "Handle our highest-priority methane incident."))
        self.assertIn("did not succeed", reply)
        self.assertIn("UPSTREAM_UNAVAILABLE", reply)

    def test_explain_never_calls_api(self) -> None:
        api = FakeApi()
        reply = run(
            handle_user_request(
                api,
                "Can you walk me through what happens when you handle the top priority?",
            )
        )
        self.assertIn("Nothing is sent", reply)
        self.assertEqual(api.calls, [])

    def test_help(self) -> None:
        api = FakeApi()
        reply = run(handle_user_request(api, "hello"))
        self.assertIn("ASI:One", reply)


if __name__ == "__main__":
    unittest.main()
