# Relay agent (CH4SE)

**Time-box:** 45–90 minutes to pass P0 criteria (§5.3 in TRACK_AGENTS_DATA.md). If not, stop and let the dashboard be the P0 operator surface.

## Env

- Webhook / inbound process: `agents/relay/.env` — `CORE_API_BASE` + `CORE_API_TOKEN`.
- Outbound Relay/Grok keys: **repo-root** `.env` only (`RELAY_API_KEY`, `RELAY_API_BASE`, …).

## What Relay actually is (verified)

Relay is a **messenger for agents**, not Twilio-style PSTN SMS to arbitrary numbers.

| Direction | How |
|-----------|-----|
| **Outbound alert** | Core API `notify_operator` → `relaySend` → `POST /v1/chats` to a Relay **handle** (demo: agent owner `bennett`) |
| **Inbound operator reply** | Operator texts the agent in the Relay app → your process gets `message.received` over **WebSocket** (`/v1/websocket`) or a signed **webhook** → you call Core API tools → reply with `POST /v1/chats/{chatId}/messages` |

So yes: the agent **can** answer follow-ups (“how bad?”, “acknowledge”) if we run an inbound loop. That is separate from the one-shot alert.

## Demo inbound loop (P1 path)

1. Keep Core API live (`make api`).
2. Run an inbound worker that:
   - connects with the agent token,
   - on `message.received`, maps text → Core API actions (`get_evidence`, `acknowledge_incident`, …),
   - replies in the same `chat_id` with a short grounded answer (quote `display.*` strings).
3. Scripted questions stay in `prompts/system.md` / `scripted_qa.md`.

Outbound alerts already work. Inbound conversational orchestration is the next Relay slice.

## Response playbook (synthetic)

`data/fixtures/company/response_playbook.json` lists demo crews/equipment and match-result scripts. SMS “Do now” steps are deterministic in the template today; wiring playbook resources into Core API actions is a follow-up.

## Capability checklist

| Question | Verified? | Notes |
|----------|-----------|-------|
| Outbound alert to Relay chat? | ✅ | CreateChat + `text.value` parts; `DELIVERED` |
| Inbound operator messages? | ☐ | Need websocket/webhook worker |
| Voice calls? | ☐ | P1 (`calls_enabled` on agent) |
| Demo recipient | ✅ | Agent owner handle (not E.164) |

## Local webhook stub

```bash
pip install -r requirements.txt
uvicorn webhook:app --reload --port 8790
```

For production-shaped inbound, prefer Relay WebSocket per https://docs.relayapp.im/llms.txt.
