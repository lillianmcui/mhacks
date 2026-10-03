"""
CH4SE Fetch.ai Response Agent — orchestration only (Track C).

Registers on Agentverse; calls Core API actions. Prefer handle_highest_priority when backend exposes it.
"""

from __future__ import annotations

import os
import re

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents.setup import fund_agent_if_low

import core_api_client as api

load_dotenv()

SEED = os.environ.get("FETCH_AGENT_SEED", "ch4se-fetch-demo-seed")
MAILBOX = os.environ.get("AGENTVERSE_MAILBOX_KEY")

agent = Agent(name="ch4se-response", seed=SEED, mailbox=MAILBOX or True)
protocol = Protocol(name="ch4se", version="0.1.0")


def _summarize_open(incidents: list[dict]) -> str:
    if not incidents:
        return "No unresolved methane incidents in CH4SE right now."
    count = len(incidents)
    top = incidents[0]
    asset = top.get("asset_id") or "unmatched site"
    ftype = top.get("facility_type") or "facility"
    priority = (top.get("priority_display") or top.get("priority") or "").strip()
    head = f"{count} unresolved. Highest priority is associated with {asset} {ftype}."
    return f"{head} {priority}".strip()


async def _run_handle_sequence(ctx: Context, incident_id: str) -> str:
    steps = [
        ("get_incident", lambda: api.get_incident(incident_id)),
        ("get_asset", None),
        ("get_escalation_policy", None),
        ("generate_briefing", lambda: api.generate_briefing(incident_id, "sms")),
        ("notify_operator", lambda: api.notify_operator(incident_id, "SMS")),
    ]

    detail = api.get_incident(incident_id)
    api.record_action(incident_id, "get_incident", "Fetch agent sequence")

    asset_id = detail.get("asset_id")
    if asset_id:
        api.get_asset(asset_id)
        api.record_action(incident_id, "get_asset", asset_id)
        api.get_escalation_policy(incident_id=incident_id)
    else:
        api.get_escalation_policy(incident_id=incident_id)
    api.record_action(incident_id, "get_escalation_policy", "")

    briefing = api.generate_briefing(incident_id, "sms")
    api.record_action(incident_id, "generate_briefing", briefing.get("source", ""))

    alert = api.notify_operator(incident_id, "SMS")
    api.record_action(incident_id, "notify_operator", alert.get("delivery_status", ""))

    return briefing.get("text") or "Operator notification attempted."


@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info(f"CH4SE Fetch agent ready. Core API: {os.environ.get('CORE_API_BASE')}")
    fund_agent_if_low(agent.wallet.address())


@protocol.on_message(model=str)
async def handle_chat(ctx: Context, sender: str, msg: str):
    text = (msg or "").strip().lower()
    try:
        if "unresolved" in text or "open incident" in text or "any incidents" in text:
            incidents = api.get_open_incidents()
            if incidents:
                api.record_action(
                    incidents[0]["incident_id"],
                    "get_open_incidents",
                    f"count={len(incidents)}",
                )
            await ctx.send(sender, _summarize_open(incidents))
            return

        if "handle" in text and "priority" in text:
            try:
                result = api.handle_highest_priority()
                await ctx.send(sender, result.get("summary") or str(result))
                return
            except api.CoreApiError as e:
                if e.code != "NOT_FOUND":
                    raise

            incidents = api.get_open_incidents(limit=1)
            if not incidents:
                await ctx.send(sender, "No open incidents to handle.")
                return
            incident_id = incidents[0]["incident_id"]
            summary = await _run_handle_sequence(ctx, incident_id)
            await ctx.send(sender, f"Handled {incident_id}. SMS briefing:\n{summary}")
            return

        await ctx.send(
            sender,
            "Ask: 'Do we have any unresolved methane incidents?' or 'Handle the highest priority one.'",
        )
    except Exception as e:
        ctx.logger.exception("action failed")
        await ctx.send(sender, f"Core API error: {e}")


agent.include(protocol)

if __name__ == "__main__":
    agent.run()
