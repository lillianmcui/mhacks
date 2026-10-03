# Fetch.ai Response Agent (CH4SE)

Autonomous orchestration for methane incident response. **No business logic** — only Core API actions.

## CP0 decision (first hour)

Can a hosted Agentverse agent reach your Core API?

1. Run Core API locally (backend) on port `8787`.
2. Expose with a tunnel, e.g. `ngrok http 8787`, and set `CORE_API_BASE` to the public URL.
3. Set the same bearer token as the API in `CORE_API_BEARER`.

If Agentverse cannot call arbitrary HTTPS URLs, run this agent **locally** with `mailbox=True` and ASI:One (P1).

## Setup

```bash
cd agents/fetch
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env
python agent.py
```

## Demo phrases

- "Do we have any unresolved methane incidents?"
- "Handle the highest priority one."

Each step should appear on the dashboard timeline via `record_action` with `actor: FETCH_AGENT`.
