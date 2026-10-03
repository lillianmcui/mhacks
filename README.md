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

The shared contracts (tables, enums, actions, errors, adapter interfaces) are
specified in [TRACK_BACKEND.md §3](TRACK_BACKEND.md#3-shared-contracts-interim-canonical-others-link-here)
and implemented in [`packages/contracts`](packages/contracts/src).

## Backend layout

```
packages/contracts/      enums, table + action types, adapter interfaces, format.ts (display strings)
packages/rules/          priority.ts (backend) · match.ts (Track C)
packages/stdb-bindings/  generated SpacetimeDB client + connect() + row<->contract mappers
spacetime/module/        SpacetimeDB TypeScript module: 9 tables, the reducers, the state machine
services/core-api/       POST /actions/{name}: the one implementation of every action
services/seed/           seed + replay CLI
```

```
Fetch | Relay | dashboard fallback -> Core API action -> reducer -> row change -> dashboard subscription
```

## Run it

Needs Node 24+ and the [SpacetimeDB CLI](https://spacetimedb.com/install) 2.10.x.

```bash
make install
cp .env.example .env        # then set CORE_API_TOKEN
```

**No database, right now** — the stub Core API serves every action from memory
with invented sample data and sends nothing:

```bash
make stub
```

**The real thing, locally** (three terminals):

```bash
make db                     # 1: SpacetimeDB on 127.0.0.1:3000
make publish-clean          # 2: publish the module to database "ch4se"
make seed && make replay    #    load data/fixtures, replay the MAIN event
make api                    # 3: Core API on 127.0.0.1:8787
```

Until Track C's fixtures are in `data/fixtures/`, use `make seed-sample` and
`make replay-sample`: the same path with the invented data in
[`services/core-api/sample-fixtures`](services/core-api/sample-fixtures).

```bash
curl -s localhost:8787/actions/get_open_incidents \
  -H "authorization: Bearer $CORE_API_TOKEN" -H 'content-type: application/json' -d '{}'
```

`GET /health` (no token) shows the mode and which Track C adapters are wired.

## Calling the API

`POST /actions/{action_name}` with a JSON body and `Authorization: Bearer <CORE_API_TOKEN>`.
Responses are `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message" } }`.
Inputs and outputs for all twelve actions: [`packages/contracts/src/actions.ts`](packages/contracts/src/actions.ts).

Any number an agent might say comes back twice: the raw value and a `display`
string. Quote the display string; never format a number yourself.

## For the other tracks

**Frontend.** Depend on `@ch4se/stdb-bindings` and `@ch4se/contracts` with
`file:` paths. `connect({ uri, databaseName })` resolves once every table is
subscribed; `toIncident(row)`, `toMethaneEvent(row)` and friends turn subscribed
rows into the shapes `format.ts` takes. Add `resolve.dedupe: ['spacetimedb']` to
the Vite config so the app and the bindings share one SDK copy.

**Agents + data.** The Core API picks up your code when these exist, with no
backend change (signatures in [`adapters.ts`](packages/contracts/src/adapters.ts)):

| file | export | until it exists |
|---|---|---|
| `packages/rules/match.ts` | `matchAsset` | backend stand-in (haversine, inclusive radius) |
| `services/core-api/src/briefing/index.ts` | `renderTemplateBriefing` | backend stand-in template |
| `services/core-api/src/adapters/grok/index.ts` | `grokBriefing` | briefings are `TEMPLATE` |
| `services/core-api/src/adapters/relay/index.ts` | `relaySend` | `notify_operator` is `UPSTREAM_UNAVAILABLE` |

Fixture file shapes are the ones in `services/core-api/sample-fixtures/`.

## Tests

```bash
make test        # contracts, priority rules, Core API (in-memory store)
make e2e         # the same lifecycle against a real module; needs `make db`
```

## Changing the schema

Edit `spacetime/module/src/index.ts`, then `make publish` and `make generate`.
Commit the regenerated bindings alone as `chore(bindings): regenerate`. After
CP0, changes to `packages/contracts` are additive only and announced first.

Data: Carbon Mapper. Events shown are real historical observations, replayed.
