# Relay agent (CH4SE)

**Time-box:** 45–90 minutes to pass P0 criteria (§5.3 in TRACK_AGENTS_DATA.md). If not, stop and let the dashboard be the P0 operator surface.

## Env

- Webhook process: `agents/relay/.env` — `CORE_API_BASE` + `CORE_API_TOKEN`.
- Outbound Relay/Grok keys: **repo-root** `.env` only (`RELAY_API_KEY`, `RELAY_API_BASE`, …). `services/core-api/.env` is not loaded.

## Capability checklist (verify in first hour — do not assume)

| Question | Verified? | Notes |
|----------|-----------|-------|
| Inbound SMS to agent? | ☐ | |
| Outbound SMS from API? | ☐ | via `services/core-api/src/adapters/relay/` |
| Voice calls? | ☐ | P1 for demo |
| Webhooks for inbound? | ☐ | |
| Trial / rate limits? | ☐ | |
| Demo recipient phone | ☐ | teammate number only |

## Architecture

```
Outbound: Fetch / dashboard -> Core API notify_operator -> relay adapter -> Relay -> phone
Inbound:  SMS/call -> Relay agent -> tools -> Core API -> SpacetimeDB -> dashboard
```

Tools map 1:1 to Core API actions (no Relay-specific writes).

## Grounding (put in Relay system prompt)

See `prompts/system.md`.

## Local webhook stub

```bash
pip install fastapi uvicorn httpx python-dotenv
uvicorn webhook:app --reload --port 8790
```

Point Relay inbound webhook at your tunnel URL + `/relay/inbound`.
