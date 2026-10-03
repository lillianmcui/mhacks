# Track A — Frontend: React + MapLibre dashboard

**Owner:** Frontend teammate
**Branch prefix:** `track/frontend/*`
**Source of truth for scope:** CH4SE Product Direction (rev. 2026-10-03). Do not change P0/P1/P2 without flagging it to the team.
**Contracts:** all table shapes, enums and action signatures are defined in [TRACK_BACKEND.md §3](./TRACK_BACKEND.md#3-shared-contracts-interim-canonical-others-link-here), later moved to `docs/SPEC.md`. Do not redefine them here or in code. Import them from `packages/contracts` and `packages/stdb-bindings`.

This track owns **everything the judges see on screen**. The dashboard is read-mostly. It **reads** state by subscribing directly to SpacetimeDB, and **writes** only by calling Core API actions. It never calls reducers directly and contains no business logic: no matching, no priority rules, no number formatting of its own.

---

## 1. What you own

### 1.1 Directories (only you edit these)

```
apps/web/            React app (Vite or Next: decide at kickoff), MapLibre, styles, assets
apps/web/public/     static assets, demo logo, cached plume_png copies if needed
```

### 1.2 What you consume but do not edit

| path | owner | use |
|---|---|---|
| `packages/stdb-bindings/` | Backend | SpacetimeDB subscription client + generated types |
| `packages/contracts/` | Backend | enums, action I/O types, `format.ts` display strings |
| `data/fixtures/` | Track C | read-only for local mocks before CP1 (`plume_png` paths, sample shapes) |
| Core API `POST /actions/*` | Backend | every write, and the fallback buttons |

If you need a contract change, ask the backend owner. Don't edit `packages/` yourself.

---

## 2. Screens and components

### 2.1 P0

1. **Replay banner.** Always visible while the demo event is shown: "Real historical observation, replayed through CH4SE." Drive it from `MethaneEvent.is_replay`. Never imply the plume is happening now.
2. **Event map (MapLibre).** Centered on the Permian Delaware Basin bbox `[-104.5, 31.0, -103.0, 32.5]`.
   * Plume origin marker at `plume_latitude, plume_longitude`. It appears live when the replay inserts the event.
   * Asset markers for the synthetic company. Highlight the associated asset.
   * A circle of radius R around the plume origin, so the matching rule is visible.
3. **Incident card.** Follows the template in Product Direction §7. Every value comes from subscribed rows or `format.ts` display strings; no value is hand-typed.
   * Title: priority + status label (§3).
   * "Associated asset: {asset_id} {facility_type} ({distance_m} m from plume origin)". The wording must be **"associated asset"** or **"nearest registered asset"**, never "source" or "caused by".
   * Provider line: "Carbon Mapper · Tanager · {scene_timestamp}".
   * Emissions: `emission_auto ± emission_uncertainty_auto kg CH4/hr (provider estimate)`.
   * History: "detected on {n} of {m} observation dates since {first_date}" (from `ProviderSource`).
   * Priority + `policy_rule_id`.
   * Attribution footer: "Data: Carbon Mapper" (license requirement).
4. **Live status + activity timeline.** Rows from `Action`, `Alert` and `Acknowledgement`, newest first, each with its actor (FETCH_AGENT / RELAY_AGENT / DASHBOARD / SYSTEM). This is how judges *see* the agents working.
5. **Fallback controls** (Product Direction §14). These are part of P0, because the demo must never depend on a live third party.
   * **"Handle highest priority"** button: calls `handle_highest_priority{ actor: DASHBOARD }`. This is the Fetch fallback.
   * **Operator view** (a separate route, e.g. `/operator`): a phone-sized page that shows the briefing from `generate_briefing` and has **Acknowledge** and **Mark investigating** buttons, which call `acknowledge_incident` / `set_incident_status`. This is the Relay fallback. It uses exactly the same actions Relay uses.
   * Hide these controls behind a keyboard toggle or a `?fallback=1` query flag, so they don't clutter the main demo.

### 2.2 P1 (only after all of P0 is green)

* HRRR wind on the card: `wind_speed_avg_auto m/s from wind_direction_avg_auto° (HRRR)`, shown only when present.
* Carbon Mapper `persistence` on the card, with attribution.
* `plume_png` overlay on the map, positioned with `plume_bounds`.
* AMBIGUOUS view: list the candidates with their distances and show the routed role. NO_REGISTERED_ASSET view: show the routed role.
* Multiple incidents list, ranked by priority.
* Briefing panel that shows whether the text came from GROK or TEMPLATE.

---

## 3. Status display mapping

This is a display-only rule. The underlying enum is in the backend contracts.

| `Incident.status` | Headline |
|---|---|
| DETECTED, ANALYZED, ALERT_SENT | `{priority} — UNACKNOWLEDGED` (red) |
| ACKNOWLEDGED | `ACKNOWLEDGED` (amber) |
| INVESTIGATING | `ACKNOWLEDGED — INVESTIGATION UNDERWAY` (amber/blue) |
| RESOLVED | `RESOLVED` (green) |

When the status is ALERT_SENT, show a secondary line: "Alert sent to {contact name} via {channel} at {sent_at}".

The flip from red to amber is the demo's climax. Make it obvious: color change, a timeline entry, and a short animation. It must happen **with no page refresh**, driven only by the subscription.

---

## 4. Real-time propagation (your half)

```
Relay / Fetch / your fallback button -> Core API -> SpacetimeDB reducer -> row update -> your subscription callback -> React state -> re-render
```

* Subscribe to: `MethaneEvent`, `ProviderSource`, `Asset`, `Contact`, `Incident`, `Alert`, `Acknowledgement`, `Action`.
* Never apply an optimistic update after a fallback button press. Wait for the subscription, so the dashboard proves the real path works.
* Show a connection indicator (connected / reconnecting) for SpacetimeDB. It helps a lot when debugging on demo day.

---

## 5. Working independently before the backend is ready

* **Before CP0:** build the layout, map and card against a local mock file shaped like the contracts. Use Track C's real fixture values where they exist.
* **From CP0:** switch to `packages/stdb-bindings` against the backend's local SpacetimeDB, with the stub Core API for button calls.
* Keep the mock behind one module (e.g. `apps/web/src/data/source.ts`) so switching is a one-line change.

---

## 6. Checkpoints

| CP | You deliver |
|---|---|
| **CP0** | App skeleton, map centered on the bbox, card layout from mock data, banner |
| **CP1** | Live subscription: the real replayed MAIN event + matched asset + incident appear when `replay` runs |
| **CP2** | Timeline, status flip on subscription, both fallback controls working end-to-end against the real Core API |
| **CP3** | Demo polish: projector-legible font sizes, fixed demo viewport, clean start state, P1 items as time allows |

## 7. Acceptance checks for this track

* With a clean DB, running backend `replay` makes the plume marker and the incident card appear **without a refresh**.
* Every number on the card can be traced to a subscribed field or a `format.ts` string. Grep `apps/web` for numeric literals in card components: there should be none.
* Acknowledging from any surface (Relay, operator view, Fetch) flips the headline live in under a few seconds. Measure the actual latency at rehearsal and write it down.
* The replay banner and the Carbon Mapper attribution are visible in every demo state.
* No real OGIM operator names appear anywhere in the UI.

## 8. Merge-conflict rules for this track

* Commit only inside `apps/web/`. If you need anything outside it, ask its owner.
* `apps/web` has its own `package.json` and lockfile.
* Put env vars the web app needs (SpacetimeDB URL, module name, Core API URL) in `apps/web/.env.example`, not the root file.

## 9. Open questions for this track

* Vite or Next? (Pick whichever the team can run fastest locally. The dashboard needs no server-side rendering.)
* Map tiles: which basemap works offline or with a cached style on the demo laptop?
* Will `plume_png` load from the Carbon Mapper URL, or should Track C copy it into the fixtures for offline use? (Recommend copying.)
