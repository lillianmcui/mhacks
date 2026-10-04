#!/usr/bin/env python3
"""Run Fetch agent phrases against Core API without uAgents (local mock or real)."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from dotenv import load_dotenv

from core_api_client import HttpCoreApi
from orchestrate import handle_user_request

load_dotenv()


async def _run(message: str) -> str:
    async with HttpCoreApi() as api:
        return await handle_user_request(api, message)


def main() -> None:
    parser = argparse.ArgumentParser(description="CH4SE Fetch CLI (Core API only)")
    parser.add_argument(
        "message",
        nargs="?",
        default="Do we have any unresolved methane incidents?",
        help="Manager / ASI:One-style phrase",
    )
    args = parser.parse_args()

    if not (os.environ.get("CORE_API_TOKEN") or os.environ.get("CORE_API_BEARER")):
        print(
            "Set CORE_API_TOKEN or CORE_API_BEARER (and CORE_API_BASE). See .env.example",
            file=sys.stderr,
        )
        sys.exit(1)

    print(asyncio.run(_run(args.message)))


if __name__ == "__main__":
    main()
