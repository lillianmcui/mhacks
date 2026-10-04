"""
CH4SE Fetch.ai Response Agent — orchestration for ASI:One / Agentverse.

Speaks the official Agent Chat Protocol. Open the inspector link at startup,
then Connect -> Mailbox (once per seed) so ASI:One can reach it.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from uuid import uuid4

from dotenv import load_dotenv
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    StartSessionContent,
    TextContent,
    chat_protocol_spec,
)

from core_api_client import HttpCoreApi
from orchestrate import handle_user_request

load_dotenv()

SEED = os.environ.get("FETCH_AGENT_SEED", "ch4se-fetch-demo-seed")
PORT = int(os.environ.get("FETCH_AGENT_PORT", "8000"))
CORE_API_BASE = os.environ.get("CORE_API_BASE", "http://127.0.0.1:8787")
README = os.path.join(os.path.dirname(os.path.abspath(__file__)), "AGENTVERSE_README.md")

agent = Agent(
    name="ch4se-methane-response",
    seed=SEED,
    port=PORT,
    mailbox=True,
    description=(
        "Autonomous methane incident-response agent for energy operators. "
        "Finds unresolved methane events, investigates affected assets, checks "
        "escalation policies, and coordinates operator response through Relay."
    ),
    readme_path=README,
    publish_agent_details=True,
)

chat_protocol = Protocol(spec=chat_protocol_spec)


def chat_text(msg: ChatMessage) -> str:
    """Text parts only; StartSession / EndSession carry none."""
    return "".join(
        item.text for item in msg.content if isinstance(item, TextContent)
    ).strip()


def has_start_session(msg: ChatMessage) -> bool:
    return any(isinstance(item, StartSessionContent) for item in msg.content)


def has_end_session(msg: ChatMessage) -> bool:
    return any(isinstance(item, EndSessionContent) for item in msg.content)


def chat_reply(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text)],
    )


@agent.on_event("startup")
async def startup(ctx: Context) -> None:
    ctx.logger.info("agent_name=%s", agent.name)
    ctx.logger.info("agent_address=%s", agent.address)
    ctx.logger.info("core_api_base=%s", CORE_API_BASE)
    ctx.logger.info("mailbox=enabled Agentverse-compatible")
    ctx.logger.info("chat_protocol=Agent Chat Protocol (manifest published)")
    try:
        from uagents.setup import fund_agent_if_low

        fund_agent_if_low(agent.wallet.address())
    except Exception as e:  # noqa: BLE001 — optional for local/dev
        ctx.logger.warning("fund_agent_if_low skipped: %s", e)


@chat_protocol.on_message(ChatMessage)
async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
    await ctx.send(
        sender,
        ChatAcknowledgement(
            timestamp=datetime.now(timezone.utc),
            acknowledged_msg_id=msg.msg_id,
        ),
    )

    if has_end_session(msg) and not chat_text(msg):
        ctx.logger.info("end-session from %s", sender)
        return

    text = chat_text(msg)
    if not text:
        if has_start_session(msg):
            await ctx.send(
                sender,
                chat_reply(
                    "CH4SE online. Ask about unresolved methane incidents, "
                    "investigate one, handle the highest-priority response, "
                    "or check whether the operator acknowledged via Relay."
                ),
            )
        return

    ctx.logger.info("chat from %s: %s", sender, text)
    try:
        async with HttpCoreApi() as api:
            reply = await handle_user_request(api, text)
    except Exception as e:  # noqa: BLE001
        ctx.logger.exception("action failed")
        reply = f"Core API error: {e}"
    await ctx.send(sender, chat_reply(reply))


@chat_protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
    ctx.logger.debug("ack from %s for %s", sender, msg.acknowledged_msg_id)


agent.include(chat_protocol, publish_manifest=True)

if __name__ == "__main__":
    agent.run()
