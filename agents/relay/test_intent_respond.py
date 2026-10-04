"""Unit tests for Relay intent routing (no network)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from intent import Intent, classify
from respond import handle_operator_text


class IntentTests(unittest.TestCase):
    def test_ack(self) -> None:
        self.assertEqual(classify("Acknowledge it and mark my team as investigating"), Intent.ACKNOWLEDGE)

    def test_how_bad(self) -> None:
        self.assertEqual(classify("How bad is this?"), Intent.HOW_BAD)

    def test_evidence(self) -> None:
        self.assertEqual(classify("What evidence do we have?"), Intent.EVIDENCE)

    def test_what_to_do(self) -> None:
        self.assertEqual(classify("What should I do next?"), Intent.WHAT_TO_DO)


class RespondTests(unittest.TestCase):
    @patch("respond.core_api")
    def test_how_bad_quotes_display(self, api) -> None:
        api.get_incident.return_value = {
            "incident_id": "INC-1",
            "priority": "HIGH",
            "display": {"headline": "HIGH — UNACKNOWLEDGED"},
        }
        api.get_evidence.return_value = {
            "is_replay": True,
            "display": {
                "emission": "432 ± 99 kg CH4/hr (Carbon Mapper estimate)",
                "asset": "No registered asset within range of the plume origin",
            },
        }
        api.record_action.return_value = {"action_id": "a"}
        text = handle_operator_text("How bad is this?", incident_id="INC-1")
        self.assertIn("432 ± 99", text)
        self.assertIn("HIGH", text)
        api.get_evidence.assert_called_once()

    @patch("respond.core_api")
    def test_ack_calls_acknowledge(self, api) -> None:
        api.get_incident.return_value = {
            "incident_id": "INC-1",
            "assigned_contact_id": "contact-env",
        }
        api.acknowledge_incident.return_value = {"status": "INVESTIGATING"}
        api.record_action.return_value = {"action_id": "a"}
        text = handle_operator_text("ack and mark investigating", incident_id="INC-1")
        self.assertIn("INVESTIGATING", text)
        api.acknowledge_incident.assert_called_once()


if __name__ == "__main__":
    unittest.main()
