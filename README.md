# CH4SE (MHacks F2026)

Methane leakage management and response coordination — Carbon Mapper data, Core API, Fetch orchestration, Relay operator reach, Grok briefings (P1).

| Track | Doc |
|-------|-----|
| Frontend | [TRACK_FRONTEND.md](./TRACK_FRONTEND.md) |
| Backend | [TRACK_BACKEND.md](./TRACK_BACKEND.md) |
| Agents / data / Grok / Relay | [TRACK_AGENTS_DATA.md](./TRACK_AGENTS_DATA.md) |

## Track C quick start (agents/data owner)

```bash
# Asset matching tests
cd packages/rules && npm install && npm test

# Data snapshots (tokens local only)
pip install -r data/scripts/requirements.txt
export CARBON_MAPPER_TOKEN=...
python data/scripts/carbon_mapper_snapshot.py --plume tan20260813t190401c96s4001-B --out main

# Fetch agent (after backend stub Core API is up)
cd agents/fetch && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env && python agent.py
```

Backend must expose stub/real Core API before Fetch or Relay can run end-to-end.
