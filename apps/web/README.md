# apps/web — CH4SE dashboard (Track A)

Vite + React + TypeScript + MapLibre. Read-mostly: subscribes to SpacetimeDB, writes only via Core API actions.

```bash
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
| `mock` | `mock` | before CP0: in-browser fake backend, auto-replays one event after ~2.5 s |
| `live` | `http` | from CP0: SpacetimeDB subscription + real/stub Core API |

The switch lives in `src/data/source.ts`. In mock mode, tabs share state over `BroadcastChannel`, so `/operator` in a second window drives the dashboard. The mock panel also has Replay, Simulate Relay ack, and Reset. Mock values in `src/data/mock/fixtures.ts` are placeholders; replace them with Track C fixtures at CP1.

## Switching to the real contracts (CP0)

`@ch4se/contracts`, `@ch4se/contracts/format` and `@ch4se/stdb-bindings` currently resolve to `src/contracts-shim/`. When Backend lands `packages/contracts` and `packages/stdb-bindings`, repoint the aliases in **both** `vite.config.ts` and `tsconfig.json`, then delete `src/contracts-shim/`. Before going live, check the table/accessor names and the field-casing notes at the top of `src/data/live.ts`.

## Layout

```
src/
  contracts-shim/   temporary stand-ins for packages/contracts + stdb-bindings
  data/             store (table mirror), source switch, live SpacetimeDB adapter, mock backend, selectors
  display/status.ts status -> headline mapping (TRACK_FRONTEND §3)
  map/              MapLibre map, basemap style, radius circle geometry
  components/       banner, card/, timeline, fallback controls, incident list
  routes/           Dashboard, Operator
```
