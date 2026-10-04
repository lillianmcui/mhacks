"""
CH4SE Fetch.ai Response Agent — orchestration only (Track C).

Prefer: python cli.py against mock_server.py for local work.
This file runs a uAgents agent that speaks the Agent Chat Protocol, so it can
be reached from Agentverse and ASI:One once its mailbox is connected (open the
inspector link it prints at startup, then Connect -> Mailbox).
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from uuid import uuid4

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

from core_api_client import HttpCoreApi
from orchestrate import handle_user_request

load_dotenv()

SEED = os.environ.get("FETCH_AGENT_SEED", "ch4se-fetch-demo-seed")
PORT = int(os.environ.get("FETCH_AGENT_PORT", "8000"))

agent = Agent(
    name="ch4se-response",
    seed=SEED,
    port=PORT,
    mailbox=True,
    description=(
        "CH4SE methane incident response agent. Ask whether there are unresolved "
        "methane incidents, or tell it to handle the highest priority one."
    ),
    publish_agent_details=True,
)
protocol = Protocol(spec=chat_protocol_spec)


def chat_text(msg: ChatMessage) -> str:
    """The text parts of a chat message; session markers carry none."""
    return "".join(item.text for item in msg.content if isinstance(item, TextContent)).strip()


def chat_reply(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text), EndSessionContent(type="end-session")],
    )


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


@protocol.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id),
    )
    text = chat_text(msg)
    if not text:
        return
    try:
        # The Core API client is blocking; keep the agent's event loop free.
        reply = await asyncio.to_thread(handle_user_request, HttpCoreApi(), text)
    except Exception as e:  # noqa: BLE001
        ctx.logger.exception("action failed")
        reply = f"Core API error: {e}"
    await ctx.send(sender, chat_reply(reply))


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
    ctx.logger.debug("ack from %s for %s", sender, msg.acknowledged_msg_id)


agent.include(protocol, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
