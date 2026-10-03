# CH4SE

Methane incident response: a Carbon Mapper plume is replayed, matched to a
registered asset, prioritized by policy, and driven to acknowledgement by
agents and a live dashboard.

Three tracks, three owners:

| Track | Doc | Owns |
|---|---|---|
| A — Frontend | [TRACK_FRONTEND.md](TRACK_FRONTEND.md) | `apps/web/` |
| B — Backend | [TRACK_BACKEND.md](TRACK_BACKEND.md) | `spacetime/module/`, `packages/`, `services/` |
| C — Agents + data | [TRACK_AGENTS_DATA.md](TRACK_AGENTS_DATA.md) | `data/`, `agents/`, adapters inside `services/core-api/src/` |

Shared contracts live in [TRACK_BACKEND.md §3](TRACK_BACKEND.md#3-shared-contracts-interim-canonical-others-link-here).

## Track C (agents / data / Grok / Relay)

```bash
# Asset matching
cd packages/rules && npm install && npm test

# Briefing + Grok number-check (node --test; needs Node 22+)
node --experimental-strip-types --test \
  services/core-api/src/briefing/template.test.ts \
  services/core-api/src/adapters/grok/numberCheck.test.ts

# Fetch orchestration against local mock (no backend required)
cd agents/fetch
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# terminal 1: CORE_API_BEARER=dev-bearer python mock_server.py
# terminal 2: CORE_API_BEARER=dev-bearer python cli.py "Handle the highest priority one"

# Real fixtures (local tokens only — never commit)
export CARBON_MAPPER_TOKEN=...
python data/scripts/carbon_mapper_snapshot.py --plume tan20260813t190401c96s4001-B --out main
```

Put `GROK_API_KEY`, `RELAY_API_KEY`, and `RELAY_API_BASE` in `services/core-api/.env` (see `.env.example`). Agent folders use their own `.env` for `CORE_API_BASE` / `CORE_API_BEARER` only.

## Backend

See `track/backend/core` for stub Core API (`make stub`), SpacetimeDB, seed/replay. Until that is merged, use `agents/fetch/mock_server.py` for agent work.
