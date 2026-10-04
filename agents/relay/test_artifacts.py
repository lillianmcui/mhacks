#!/usr/bin/env python3
"""Offline checks for Relay grounding prompt + tool map (no network)."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent


class RelayArtifactTests(unittest.TestCase):
    def test_tools_map_to_core_actions(self) -> None:
        tools = json.loads((HERE / "tools.json").read_text())["tools"]
        names = {t["name"] for t in tools}
        expected = {
            "get_incident",
            "get_evidence",
            "get_asset_history",
            "get_escalation_policy",
            "generate_briefing",
            "acknowledge_incident",
            "set_incident_status",
        }
        self.assertEqual(names, expected)
        for t in tools:
            self.assertEqual(t["name"], t["core_action"])

    def test_system_prompt_grounding_phrases(self) -> None:
        text = (HERE / "prompts" / "system.md").read_text().lower()
        self.assertIn("verbatim", text)
        self.assertIn("associated asset", text)
        self.assertIn("replayed historical observation", text)
        self.assertIn("caused by", text)
        self.assertIn("acknowledge", text)


if __name__ == "__main__":
    unittest.main()
