"""Unit tests for Fetch intent + orchestration (no network, no uAgents)."""

from __future__ import annotations

import asyncio
import unittest
from typing import Any

from intent import Intent, classify
from orchestrate import (
    CoreApiError,
    handle_user_request,
    pick_handle_candidate,
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
        self._detail_status = "ANALYZED"
        self.notify_result = {
            "alert_id": "a1",
            "delivery_status": "DELIVERED",
            "message_text": "SMS stub for TX-184",
            "briefing_source": "TEMPLATE",
        }
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
                "status": self._detail_status,
                "match_result": "MATCHED",
            },
            "status": self._detail_status,
            "asset": {"asset_id": "TX-184", "facility_type": "compressor_station"},
            "assigned_contact": {"contact_id": "contact-ops-lead", "name": "Ops Lead"},
            "display": self._open[0].get("display")
            or {
                "headline": f"{self._detail_status}",
                "asset": "Associated asset: TX-184",
                "emission": "1993 ± 521 kg CH4/hr (Carbon Mapper estimate)",
            },
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
        return {
            "incident_id": incident_id,
            "source": {},
            "previous_incidents": [],
            "display": {
                "history": "provider source linked to TX-184",
                "persistence": "persistence 0.75 (Carbon Mapper)",
                "previous_incidents": "no previous CH4SE incidents",
            },
        }

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
        self,
        incident_id: str,
        channel: str = "SMS",
        *,
        actor: str = "FETCH_AGENT",
        briefing: dict[str, Any] | None = None,
    ) -> dict:
        self.calls.append(
            (
                "notify_operator",
                {
                    "incident_id": incident_id,
                    "channel": channel,
                    "actor": actor,
                    "briefing": briefing,
                },
            )
        )
        if self.notify_error:
            raise self.notify_error
        out = dict(self.notify_result)
        if briefing and briefing.get("text"):
            out["message_text"] = briefing["text"]
        return out

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

    def test_handle_imperative(self) -> None:
        r = classify("Handle our highest-priority methane incident.")
        self.assertEqual(r.intent, Intent.HANDLE)

    def test_handle_questions_are_not_notify(self) -> None:
        cases = [
            "Has INC-0001 been handled yet?",
            "Who handles this incident?",
            "Don't handle it yet, just tell me the status",
        ]
        for msg in cases:
            with self.subTest(msg=msg):
                self.assertEqual(classify(msg).intent, Intent.STATUS)

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

    def test_asset_question_is_list(self) -> None:
        r = classify("Which asset is associated with the most urgent incident?")
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

    def test_pick_prefers_analyzed_over_alert_sent(self) -> None:
        picked = pick_handle_candidate(
            [
                {"incident_id": "alerted", "status": "ALERT_SENT", "priority": "CRITICAL"},
                {"incident_id": "fresh", "status": "ANALYZED", "priority": "HIGH"},
            ]
        )
        assert picked is not None
        self.assertEqual(picked["incident_id"], "fresh")

    def test_list_open(self) -> None:
        api = FakeApi()
        reply = run(handle_user_request(api, "Do we have any unresolved methane incidents?"))
        self.assertIn("INC-0001", reply)
        self.assertIn("1993 ± 521", reply)

    def test_asset_question_lists_incident(self) -> None:
        api = FakeApi()
        reply = run(
            handle_user_request(
                api, "Which asset is associated with the most urgent incident?"
            )
        )
        self.assertIn("TX-184", reply)
        self.assertNotIn("Try:", reply)

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
        self.assertEqual(
            notify[1].get("briefing"),
            {"text": "SMS stub for TX-184", "source": "TEMPLATE"},
        )
        # Timeline records steps, but not a duplicate notify_operator action.
        recorded = [c[1]["action_name"] for c in api.calls if c[0] == "record_action"]
        self.assertIn("get_incident", recorded)
        self.assertIn("get_asset", recorded)
        self.assertIn("get_escalation_policy", recorded)
        self.assertIn("generate_briefing", recorded)
        self.assertNotIn("notify_operator", recorded)
        self.assertIn("Relay", reply)
        self.assertIn("Briefing sent through Relay:", reply)
        self.assertIn("SMS stub for TX-184", reply)

    def test_repeat_handle_skips_second_send(self) -> None:
        api = FakeApi()
        api._open[0]["status"] = "ALERT_SENT"
        api._detail_status = "ALERT_SENT"
        reply = run(
            handle_user_request(api, "Handle our highest-priority methane incident.")
        )
        names = [c[0] for c in api.calls]
        self.assertNotIn("notify_operator", names)
        self.assertNotIn("generate_briefing", names)
        self.assertIn("already alerted", reply.lower())
        self.assertIn("awaiting operator acknowledgement", reply.lower())
        recorded = [c[1] for c in api.calls if c[0] == "record_action"]
        self.assertTrue(
            any(
                r["action_name"] == "notify_operator"
                and "not sent again" in r["detail"]
                for r in recorded
            )
        )

    def test_investigate_does_not_notify_and_uses_history(self) -> None:
        api = FakeApi()
        reply = run(handle_user_request(api, "Why is INC-0001 critical?"))
        names = [c[0] for c in api.calls]
        self.assertIn("get_evidence", names)
        self.assertIn("get_asset_history", names)
        self.assertNotIn("notify_operator", names)
        self.assertIn("persistence 0.75", reply)
        self.assertIn("no previous CH4SE incidents", reply)
        self.assertIn("read-only", reply.lower())

    def test_status_phrases_with_handle_do_not_notify(self) -> None:
        api = FakeApi()
        for msg in (
            "Has INC-0001 been handled yet?",
            "Who handles this incident?",
            "Don't handle it yet, just tell me the status",
        ):
            api.calls.clear()
            reply = run(handle_user_request(api, msg))
            names = [c[0] for c in api.calls]
            self.assertNotIn("notify_operator", names, msg)
            self.assertIn("Status:", reply)

    def test_status_unacked(self) -> None:
        api = FakeApi()
        api._detail_status = "ALERT_SENT"
        reply = run(handle_user_request(api, "Has the operator acknowledged INC-0001?"))
        self.assertIn("Not yet", reply)
        self.assertIn("awaiting acknowledgement", reply)

    def test_status_acked_does_not_claim_relay_only(self) -> None:
        api = FakeApi()
        api._detail_status = "INVESTIGATING"
        reply = run(handle_user_request(api, "Has the operator acknowledged it?"))
        self.assertIn("Yes", reply)
        self.assertIn("INVESTIGATING", reply)
        self.assertIn("Relay or the dashboard", reply)

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
        self.assertIn("not confirmed sent", reply.lower())

    def test_explain_never_calls_api(self) -> None:
        api = FakeApi()
        reply = run(
            handle_user_request(
                api,
                "Can you walk me through what happens when you handle the top priority?",
            )
        )
        self.assertIn("Nothing is sent", reply)
        self.assertIn("ALERT_SENT", reply)
        self.assertEqual(api.calls, [])

    def test_help(self) -> None:
        api = FakeApi()
        reply = run(handle_user_request(api, "hello"))
        self.assertIn("ASI:One", reply)


if __name__ == "__main__":
    unittest.main()
