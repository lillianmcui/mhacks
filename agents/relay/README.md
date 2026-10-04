# Relay agent (CH4SE)

## Do we need Grok for inbound?

**No for P0.** Inbound replies are deterministic:

operator text → intent → Core API action(s) → quote `display.*` strings → Relay reply

Grok stays on **outbound** `generate_briefing` (with template fallback). Optional freer inbound wording is P1 and must still pass the number-check if used.

## Run inbound (WebSocket — preferred)

```bash
# terminal A: make db && make api  (repo root, with .env keys)
# terminal B:
cd agents/relay
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set CORE_API_TOKEN to match root .env
python inbound_ws.py
```

Then in the Relay app, text the agent e.g.:

- How bad is this?
- What evidence do we have?
- What should I do?
- Acknowledge and mark investigating

## HTTP stub (tunnel / unit demos)

```bash
uvicorn webhook:app --reload --port 8790
curl -s localhost:8790/relay/inbound -H 'content-type: application/json' \
  -d '{"text":"How bad is this?","incident_id":"INC-0001"}'
```

## Architecture

```
Outbound: Core API notify_operator → relaySend → POST /v1/chats → your phone chat
Inbound:  you text agent → WebSocket message.received → respond.py → Core API → POST /v1/chats/{id}/messages
```

State changes only through Core API (`acknowledge_incident`, etc.). Actor: `RELAY_AGENT`.

## Files

| File | Role |
|------|------|
| `intent.py` | Keyword → intent |
| `respond.py` | Intent → Core API → grounded reply |
| `inbound_ws.py` | Relay WebSocket consumer |
| `relay_client.py` | mark read + reply |
| `core_api.py` | HTTP to Core API |
| `response_playbook.json` | Demo resources for "what should I do?" |
