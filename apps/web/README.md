# apps/web — CH4SE dashboard (Track A)

Vite + React + TypeScript + MapLibre. Read-mostly: subscribes to SpacetimeDB, writes only via Core API actions.

```bash
make install           # at the repo root: the dashboard uses the backend's packages from source
cd apps/web
cp .env.example .env   # defaults to full mock mode
npm install
npm run dev            # http://localhost:5173
```

- `/` dashboard. `/operator` phone-sized Relay fallback.
- Fallback controls: press **Shift+F** or open `/?fallback=1`.
- `npm run check:card-literals` enforces "no numeric literals in card components" (TRACK_FRONTEND §7).

## Data modes

| `VITE_DATA_SOURCE` | `VITE_CORE_API` | use |
|---|---|---|
| `mock` | `mock` | no backend needed: in-browser fake backend, auto-replays one event after ~2.5 s |
| `live` | `http` | SpacetimeDB subscription + Core API (`make db`, `make publish`, seed and replay, `make api`) |

The switch lives in `src/data/source.ts`. In mock mode, tabs share state over `BroadcastChannel`, so `/operator` in a second window drives the dashboard. The mock panel also has Replay, Simulate Relay ack, and Reset. Mock values in `src/data/mock/fixtures.ts` are placeholders; replace them with Track C fixtures at CP1.

## Contracts and bindings

`@ch4se/contracts` and `@ch4se/stdb-bindings` resolve to the backend's `packages/contracts` and `packages/stdb-bindings` sources (aliases in **both** `vite.config.ts` and `tsconfig.json`). Every number on the card goes through the contracts formatters, so the card and the briefings show the same strings. In live mode `VITE_STDB_MODULE` is the database name and `VITE_CORE_API_TOKEN` must equal the Core API's `CORE_API_TOKEN`.

## Layout

```
src/
  data/             store (table mirror), source switch, live SpacetimeDB adapter, mock backend, selectors
  display/          status -> headline mapping (TRACK_FRONTEND §3), timeline clock
  map/              MapLibre map, basemap style, radius circle geometry
  components/       banner, card/, timeline, fallback controls, incident list
  routes/           Dashboard, Operator
```
