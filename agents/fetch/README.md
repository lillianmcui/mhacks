# Fetch.ai Response Agent (CH4SE)

Autonomous orchestration for methane incident response. **No business logic** — only Core API actions.

## Local work (no backend yet)

```bash
cd agents/fetch
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # CORE_API_BEARER=dev-bearer

# terminal 1
python mock_server.py

# terminal 2
python test_orchestrate.py
python cli.py "Do we have any unresolved methane incidents?"
python cli.py "Handle the highest priority one"
```

For Agentverse (`agent.py`): `pip install -r requirements-agent.txt`.

`mock_server.py` is a **Track C stub** with synthetic canned data. Replace `CORE_API_BASE` with the real backend stub when it lands.

## Agentverse

1. Backend Core API on a public tunnel, or run this agent locally with mailbox.
2. `python agent.py` after `.env` is set.
3. Tell backend which option you chose.

## Demo phrases

- "Do we have any unresolved methane incidents?"
- "Handle the highest priority one."

Each step should appear on the dashboard timeline via `record_action` with `actor: FETCH_AGENT`.
