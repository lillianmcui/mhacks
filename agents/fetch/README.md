# Fetch.ai Response Agent (CH4SE)

Autonomous orchestration for methane incident response. **No business logic** — only Core API actions.

## Env

- Agent process: `agents/fetch/.env` — `CORE_API_BASE` + `CORE_API_TOKEN` (same value as root `CORE_API_TOKEN`).
- Grok / Relay keys live in the **repo-root** `.env` for the Core API process only. Do not put them under `services/core-api/.env` (ignored).

## Local work (mock Core API)

```bash
cd agents/fetch
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # CORE_API_TOKEN=dev-bearer

# terminal 1
CORE_API_TOKEN=dev-bearer python mock_server.py

# terminal 2
CORE_API_TOKEN=dev-bearer python cli.py "Do we have any unresolved methane incidents?"
CORE_API_TOKEN=dev-bearer python cli.py "Handle the highest priority one"
```

For Agentverse / ASI:One (`agent.py`): `pip install -r requirements-agent.txt`, then `python agent.py`.
The agent speaks the Agent Chat Protocol. On first run, open the inspector link it prints while
logged in to Agentverse and choose Connect -> Mailbox. It is reachable only while the process runs,
and its identity comes from `FETCH_AGENT_SEED`, so keep that value stable and private.

Against the real backend, prefer `handle_highest_priority` (same path as the dashboard fallback). Behaviours to expect:

- Repeat handle on an already-alerted incident → no second SMS (“already alerted”).
- `delivery_status: FAILED` → that step is marked failed; run can still return `ok: true`.
- `notify_operator` after acknowledge → `INVALID_TRANSITION`.

## Demo phrases

- "Do we have any unresolved methane incidents?"
- "Handle the highest priority one."
