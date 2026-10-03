"""
CH4SE Fetch.ai Response Agent — orchestration only (Track C).

Prefer: python cli.py against mock_server.py for local work.
This file registers a uAgents agent when Agentverse/mailbox is available.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from uagents import Agent, Context, Model, Protocol

from core_api_client import HttpCoreApi
from orchestrate import handle_user_request

load_dotenv()

SEED = os.environ.get("FETCH_AGENT_SEED", "ch4se-fetch-demo-seed")
MAILBOX = os.environ.get("AGENTVERSE_MAILBOX_KEY")

agent = Agent(
    name="ch4se-response",
    seed=SEED,
    mailbox=MAILBOX if MAILBOX else True,
)
protocol = Protocol(name="ch4se", version="0.1.0")


class ChatMessage(Model):
    text: str


class ChatReply(Model):
    text: str


@agent.on_event("startup")
async def startup(ctx: Context) -> None:
    ctx.logger.info(
        "CH4SE Fetch agent ready. Core API: %s",
        os.environ.get("CORE_API_BASE", "http://127.0.0.1:8787"),
    )
    try:
        from uagents.setup import fund_agent_if_low

        fund_agent_if_low(agent.wallet.address())
    except Exception as e:  # noqa: BLE001 — optional for local/dev
        ctx.logger.warning("fund_agent_if_low skipped: %s", e)


@protocol.on_message(model=ChatMessage, replies={ChatReply})
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
    api = HttpCoreApi()
    try:
        reply = handle_user_request(api, msg.text)
    except Exception as e:  # noqa: BLE001
        ctx.logger.exception("action failed")
        reply = f"Core API error: {e}"
    await ctx.send(sender, ChatReply(text=reply))


agent.include(protocol)

if __name__ == "__main__":
    agent.run()
