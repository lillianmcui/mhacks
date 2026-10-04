"""Tests for free-form Grok inbound grounding."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from intent import Intent, classify
from number_check import assert_numbers_grounded, extract_numbers
from respond import handle_operator_text


class NumberCheckTests(unittest.TestCase):
    def test_rejects_new_number(self) -> None:
        with self.assertRaises(ValueError):
            assert_numbers_grounded("About 999 kg", {"display": {"emission": "120 ± 40"}})

    def test_allows_grounded(self) -> None:
        assert_numbers_grounded(
            "Release 120 ± 40 kg",
            {"display": {"emission": "120 ± 40 kg CH4/hr"}},
        )
        self.assertIn("120", extract_numbers("120 ± 40"))

    def test_allows_operator_stated_number(self) -> None:
        assert_numbers_grounded(
            "Got it — your truck is 40 min out. Widen search meanwhile.",
            {
                "operator_question": "vac truck is 40 minutes out",
                "ch4se_context": {"display": {"emission": "120 ± 40"}},
            },
        )


class NormalizeTests(unittest.TestCase):
    def test_unwraps_json_reply(self) -> None:
        from grok_inbound import _normalize_reply

        out = _normalize_reply('{"reply": "Widen search. Match uncertain."}')
        self.assertEqual(out, "Widen search. Match uncertain.")


class FreeFormTests(unittest.TestCase):
    @patch("respond.answer_with_grok")
    @patch("respond.build_context_pack")
    @patch("respond.grok_enabled", return_value=True)
    @patch("respond.core_api")
    def test_free_form_uses_grok(self, api, _enabled, build_ctx, grok) -> None:
        api.get_open_incidents.return_value = [{"incident_id": "INC-1"}]
        api.record_action.return_value = {"action_id": "a"}
        build_ctx.return_value = {"incident_id": "INC-1"}
        grok.return_value = "Priority HIGH. Release: 120 ± 40 kg CH4/hr (Carbon Mapper estimate)."
        out = handle_operator_text("can you summarize risk for my crew?")
        self.assertIn("120 ± 40", out)
        grok.assert_called_once()
        self.assertEqual(grok.call_args[0][0], "can you summarize risk for my crew?")

    @patch("respond.grok_enabled", return_value=False)
    @patch("respond.core_api")
    def test_fallback_without_grok(self, api, _enabled) -> None:
        api.get_incident.return_value = {
            "incident_id": "INC-1",
            "priority": "HIGH",
            "display": {},
        }
        api.get_evidence.return_value = {
            "display": {"emission": "120 ± 40 kg CH4/hr (Carbon Mapper estimate)"}
        }
        api.record_action.return_value = {"action_id": "a"}
        out = handle_operator_text("How bad is this?", incident_id="INC-1")
        self.assertIn("120 ± 40", out)

    def test_ack_still_classified(self) -> None:
        self.assertEqual(classify("please acknowledge"), Intent.ACKNOWLEDGE)


if __name__ == "__main__":
    unittest.main()
