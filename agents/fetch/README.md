# Fetch.ai Response Agent (CH4SE)

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

**Agent name:** `ch4se-methane-response`

Autonomous methane incident-response orchestration for energy operators.  
**ASI:One** is the manager / user chat interface. **Relay** is how CH4SE contacts the field operator. This agent never sends SMS itself — it calls Core API `notify_operator`, and the backend Relay adapter delivers the message.

## Purpose

From ASI:One, a manager can:

1. List unresolved methane incidents  
2. Investigate evidence / asset / policy (read-only)  
3. Handle the highest-priority (or named) incident — multi-step tool orchestration ending in Relay notify  
4. Ask whether the operator has acknowledged (status from Core API / SpacetimeDB)

## Prerequisites

- Python 3.11+
- CH4SE Core API reachable (`make db`, `make publish-clean && make seed && make replay`, `make api`) **or** local `mock_server.py`
- For live Relay notify: repo-root `.env` with `RELAY_API_KEY` (and optional `RELAY_NOTIFY_HANDLE`)
- For Agentverse / ASI:One: `pip install -r requirements-agent.txt` and a stable `FETCH_AGENT_SEED`

## Environment

`agents/fetch/.env`:

| Variable | Purpose |
|---|---|
| `CORE_API_BASE` | Default `http://127.0.0.1:8787` |
| `CORE_API_TOKEN` | Same bearer as root `CORE_API_TOKEN` |
| `FETCH_AGENT_SEED` | Stable Agentverse identity (keep private) |
| `FETCH_AGENT_PORT` | Local uAgents port (default `8000`) |

Grok / Relay secrets stay in the **repo-root** `.env` for the Core API process only.

## Local CLI (no Agentverse)

```bash
cd agents/fetch
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # CORE_API_TOKEN=dev-bearer for mock

# terminal 1 — mock Core API
CORE_API_TOKEN=dev-bearer python mock_server.py

# terminal 2
CORE_API_TOKEN=dev-bearer python cli.py "Do we have any unresolved methane incidents?"
CORE_API_TOKEN=dev-bearer python cli.py "Why is the highest-priority incident critical?"
CORE_API_TOKEN=dev-bearer python cli.py "Handle our highest-priority methane incident."
CORE_API_TOKEN=dev-bearer python cli.py "Has the operator acknowledged it?"
```

Against the real API: point `CORE_API_BASE` / `CORE_API_TOKEN` at your running Core API (same token as root `.env`).

```bash
python -m unittest test_orchestrate.py
```

## Agentverse + ASI:One

```bash
cd agents/fetch
pip install -r requirements-agent.txt
cp .env.example .env   # set FETCH_AGENT_SEED + CORE_API_*
python agent.py
```

Startup logs show: agent name, agent address, Core API URL, mailbox mode, Chat Protocol initialized.

1. Open the inspector / Agentverse link printed at startup while logged into Agentverse.  
2. Choose **Connect → Mailbox** (once per seed).  
3. Leave `python agent.py` running.  
4. In **ASI:One**, discover **ch4se-methane-response** and chat.

Agent address is derived from `FETCH_AGENT_SEED` — keep the seed stable so the address does not change between demos.

Public Agentverse copy lives in `AGENTVERSE_README.md` (published with the agent profile).

## Demo prompts (use these)

1. `Do we have any unresolved methane incidents?`  
2. `Why is the highest-priority incident critical?`  
3. `Handle our highest-priority methane incident.`  
4. `Has the operator acknowledged it?`

### Expected handle workflow (visible tool steps)

```
get_open_incidents → pick unacknowledged highest priority
→ get_incident → get_asset → get_escalation_policy → get_evidence
→ generate_briefing → notify_operator (Relay) → record_action → get status
```

The agent reports ✓ / ✗ per step. It only claims Relay success when `delivery_status` is `SENT` or `DELIVERED`.

**Side-effect safety:** investigate / list / status never call `notify_operator`. Only explicit handle / notify / start-response intents do.

## Architecture

```
ASI:One user
  → Fetch CH4SE agent (Agent Chat Protocol)
    → Core API tools
      → SpacetimeDB
      → Relay adapter (outbound to field operator)

Field operator (Relay)
  → Relay inbound / webhook
    → Core API acknowledge
      → SpacetimeDB status
        → Fetch status query in ASI:One
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Agent not in ASI:One | Mailbox connected? Process still running? Same `FETCH_AGENT_SEED`? |
| `UNAUTHORIZED` | `CORE_API_TOKEN` matches Core API root `.env` |
| `UPSTREAM_UNAVAILABLE` on notify | Root `.env` `RELAY_API_KEY` / Relay adapter; CALL channel unsupported |
| `NO_OPEN_INCIDENTS` / nothing to handle | Seed+replay; incident already acknowledged — list open vs unacked |
| Invented numbers | Bug — agent must quote `display.*` strings only |

## Out of scope (intentionally)

Payment Protocol, second Fetch agent, ASI Interactive Cards, frontend changes.
