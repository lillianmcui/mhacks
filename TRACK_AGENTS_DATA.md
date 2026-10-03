# Track C — Fetch agent + Grok + Data + Relay

**Owner:** Agents/Data teammate
**Branch prefix:** `track/agents/*`
**Source of truth for scope:** CH4SE Product Direction (rev. 2026-10-03). Do not change P0/P1/P2 without flagging it to the team.
**Contracts:** all table shapes, enums, action signatures, error codes and adapter interfaces are defined in [TRACK_BACKEND.md §3](./TRACK_BACKEND.md#3-shared-contracts-interim-canonical-others-link-here), later moved to `docs/SPEC.md`. Do not redefine them. Agents call **only** Core API actions (§3.6 there) and contain **no business logic** of their own.

This track covers four things: the **real data** everything runs on, the **asset-matching rule**, the **words** (Grok + template), and the **two conversational surfaces** (Fetch and Relay). It's the widest track. Work in the order in §6: data comes first, because it blocks everyone at CP1.

---

## 1. What you own

### 1.1 Directories (only you edit these)

```
data/scripts/                         Python spike/snapshot scripts (Carbon Mapper, OGIM clip)
data/fixtures/carbon_mapper/          frozen source record, plume row, scenes, plume_png
data/fixtures/ogim/                   pre-clipped OGIM v3.0 GeoJSON around the demo points
data/fixtures/company/                synthetic company: assets, contacts, escalation policies
packages/rules/match.ts               deterministic asset-matching rule (+ tests)
services/core-api/src/adapters/grok/  Grok client + number-check validator
services/core-api/src/adapters/relay/ outbound SMS / call via Relay
services/core-api/src/briefing/       deterministic template briefing
agents/fetch/                         Python uAgents Response Agent (Agentverse / ASI:One)
agents/relay/                         Relay agent config, prompts, tool definitions, webhook handler
```

The three folders under `services/core-api/src/` are yours even though the backend owns the rest of that service. You implement the frozen interfaces in TRACK_BACKEND §3.8; the backend wires them in. Neither of you edits the other's files.

### 1.2 What you consume but do not edit

`packages/contracts/` (including `format.ts` display strings), `packages/rules/priority.ts`, and Core API routes. All are owned by the backend.

---

## 2. Data (P0, needed first)

### 2.1 Carbon Mapper snapshot (MAIN event)

Use the endpoints and field names from Product Direction §5.2–§5.3 **only**.

1. Look up `source_name` for `tan20260813t190401c96s4001-B` via `GET /catalog/source/plume/name/{plume_name}`.
2. Save the source record (`GET /catalog/source/{source_name}`) to `data/fixtures/carbon_mapper/main/source.json`. If it 404s (the known gotcha), build an equivalent from `GET /catalog/source-plumes-csv/{source_name}` and note this in a `README` next to it.
3. Save the plume row (from `/catalog/plume-csv` or `source.plumes[]`) to `plume.json`.
4. Save scenes (`/catalog/download/scenes.geojson`, bbox/intersects) to `scenes.geojson`. Join plume to scene via `scene_id` and use the scene `timestamp` field.
5. Download `plume_png` into the fixture folder, so the demo works offline.
6. Check `plume_quality`, and the uncalibrated-Tanager warning.
7. Snapshot the two backup events the same way (`backup_1/`, `backup_2/`) if time allows.
8. The API token stays in your local `.env` only. It is never committed and never written into a fixture.

### 2.2 OGIM clip and density check

* Download OGIM v3.0 (Zenodo, GeoPackage). Clip each relevant infrastructure table to a small box around the MAIN point and write it to `data/fixtures/ogim/clip.geojson`, keeping the table name as `facility_type`.
* **Answer the first-hour question:** how many OGIM facilities are within R (default 250 m) of the MAIN plume origin, and what types are they? Post the answer in team chat.
  * Exactly 1: proceed.
  * More than 1: the main demo shows AMBIGUOUS. Tell the team immediately, because it changes the demo script. Alternatively, switch to a backup event that has exactly 1.
  * 0: try the backups.
* Optionally, find an event with 2 or more assets nearby for the P1 AMBIGUOUS path.
* Strip real OGIM operator names before the data goes into `company/`.

### 2.3 Synthetic company

`data/fixtures/company/{assets,contacts,policies}.json`, shaped exactly like the backend's `Asset`, `Contact` and `EscalationPolicy` contracts.

* Fictional operator name (e.g. "Basin Midstream Co."). Asset IDs like `TX-184` are placed on real OGIM locations.
* Contacts: **teammates' phone numbers only**.
* Policy thresholds (`EMISSION_CRITICAL_KGH`, `EMISSION_HIGH_KGH`, `RECURRENCE_MIN_DETECTIONS`) are written down at kickoff, **before** you look at the MAIN event's emission value. Don't tune them afterwards.

### 2.4 Asset-matching rule (`packages/rules/match.ts`)

Implements Product Direction §6.2 deterministically, using haversine distance from (`plume_latitude`, `plume_longitude`):

| assets within R | `match_result` |
|---|---|
| exactly 1 | `MATCHED`, with `asset_id`, `distance_m` |
| more than 1 | `AMBIGUOUS`, with all `candidates[]` and their distances, sorted |
| 0 | `NO_REGISTERED_ASSET` |

Write unit tests for all three cases, plus the boundary case (distance exactly R). R is a parameter that defaults to 250 m.

---

## 3. Words: briefing template + Grok

### 3.1 Template briefing (P0)

`services/core-api/src/briefing/` implements `renderTemplateBriefing(BriefingInput, kind)` for `operator`, `sms` and `summary`.

* Uses **only** the `display` strings from `BriefingInput`. It never formats numbers itself.
* Says "associated asset" or "nearest registered asset" and "replayed historical observation".
* If `match_result` isn't MATCHED, or the relative uncertainty is wide, the text says so explicitly.

### 3.2 Grok (P1)

`services/core-api/src/adapters/grok/` implements `grokBriefing(BriefingInput, kind)`.

* The prompt sends structured JSON only. It tells Grok to quote the display strings verbatim and never compute anything.
* **Number-check (required before returning):** extract every number from the output. Every one must appear in the input JSON. If any doesn't, throw. The backend then falls back to the template.
* Add a timeout. On timeout, throw.
* The `GROK_API_KEY` env var is read only inside the Core API process.

---

## 4. Fetch.ai Response Agent (`agents/fetch/`)

**Role: autonomous orchestration.** It takes actions; it doesn't only answer questions.

* Python uAgents, registered on Agentverse and discoverable via ASI:One (ASI:One chat is P1).
* "Do we have any unresolved methane incidents?" calls `get_open_incidents` and replies with a count and the top item, using the display strings. For example: "Two unresolved. Highest priority is associated with {asset_id} {facility_type}."
* "Handle the highest priority one" calls the Core API sequence below. Call `record_action{ actor: FETCH_AGENT }` after each step so the dashboard timeline shows the agent working:
  1. `get_open_incidents`
  2. `get_incident`
  3. `get_asset`
  4. `get_escalation_policy`
  5. `generate_briefing{ kind: "sms" }`
  6. `notify_operator`
  7. report status back to the user
* The agent holds no state and no business logic. If the backend adds `handle_highest_priority`, the agent may call that single action instead. The dashboard fallback button uses that same action, so both paths stay identical.
* **First-hour question:** can a hosted Agentverse agent reach our Core API over HTTP? If so, it needs a public tunnel URL plus the bearer token. If not, run the agent locally with a mailbox. Decide and tell the backend.
* Fallback: the dashboard "Handle highest priority" button (Product Direction §14; built by Frontend).

## 5. Relay agent (`agents/relay/` + `services/core-api/src/adapters/relay/`)

**Role: human conversation and real-world reach.**

### 5.1 Time-box (Product Direction §9.2)

Spend **45–90 minutes** of focused work getting a Relay agent to (a) retrieve one incident, (b) explain it, and (c) update its state through the Core API.

* **Pass:** the acceptance criteria in §5.3 are P0.
* **Fail:** stop. The Frontend operator view becomes the P0 Relay replacement, the §5.3 criteria move to P1, and you move on to Fetch and polish. Tell the team the moment you decide.

In the first hour, also verify Relay's real capabilities: inbound vs. outbound, SMS vs. voice, webhooks, trial limits. Write them in `agents/relay/README.md`, and don't assume anything that isn't verified.

### 5.2 Architecture

```
Outbound: Fetch / dashboard -> Core API notify_operator -> relay adapter -> Relay -> teammate phone
Inbound:  teammate SMS/call -> Relay agent -> tool calls -> Core API actions -> SpacetimeDB -> dashboard
```

* Relay tools map 1:1 to Core API actions: `get_incident`, `get_evidence`, `get_asset_history`, `get_escalation_policy`, `generate_briefing`, `acknowledge_incident`, `set_incident_status`.
* There is **no Relay-specific write path**. Every state change goes through a Core API action, which calls a reducer.

### 5.3 P0 acceptance criteria (only if the time-box passes)

These restate Product Direction §9.2. When `docs/MVP.md` exists, they move there and this section becomes a link.

* A teammate can communicate with the CH4SE agent through Relay.
* The agent retrieves the real-fixture incident from the Core API.
* The agent explains it from structured data. In P0, the deterministic briefing text is enough.
* "Acknowledge it and mark my team as investigating" calls `acknowledge_incident{ then_status: INVESTIGATING }`, or the two separate calls.
* The change is persisted via the Core API, and the dashboard flips live.

### 5.4 Grounding rules (put these in the Relay agent instructions)

* Quote Core API display strings **verbatim** for any emission, uncertainty, timestamp, persistence, or count.
* Never invent observations, numbers, timestamps or asset identities.
* Say "associated asset", never "caused by". Say "replayed historical observation", never imply the event is happening now.
* When the evidence is uncertain (AMBIGUOUS match, wide uncertainty), say so.
* Scripted demo questions to test against the live agent before the demo: "Why was I alerted?", "What evidence do we have?", "How bad is this?", "Has this happened before?", "Who owns this site?", "What does our policy require?", "Acknowledge it and mark my team as investigating." Free-form Q&A beyond these is P1. Voice calls are P1.

---

## 6. Build order and checkpoints

| CP | You deliver | Unblocks |
|---|---|---|
| **CP0** (first hour) | OGIM density answer; Relay capability check started; agree on `BriefingInput` and adapter signatures with the backend | Demo event choice locked |
| **CP1** | All fixtures committed (`carbon_mapper/main`, `ogim/clip`, `company/*`); `match.ts` + tests; template briefing | Backend seed/replay; Frontend shows real data |
| **CP2** | Relay time-box result (pass or fail); Relay outbound adapter; Fetch agent running the full sequence against the real Core API | End-to-end demo |
| **CP3** | Grok adapter + number-check (P1); every scripted Relay question tested live; backup video of the Relay call recorded | Rehearsal |

If you fall behind, hand the Grok adapter (P1) to the backend owner first. Fixtures, matching, the template, the time-box and Fetch must not slip.

## 7. Acceptance checks for this track

* Fixtures reproduce the incident card's values with no hand-typed numbers. The backend's replay uses them unmodified.
* `match.ts` tests pass for MATCHED, AMBIGUOUS, NO_REGISTERED_ASSET and the boundary case.
* Grok output containing a number that isn't in its input is rejected, and the template text is used instead.
* The Fetch "handle highest priority" run produces an `Action` row for each step, and a teammate receives the alert, or the failure is recorded.
* No secrets (Carbon Mapper token, Grok key, Relay key) appear in git: `git log -p | grep` for each key prefix.
* No real OGIM operator names appear in `company/` fixtures.

## 8. Merge-conflict rules for this track

* Commit only inside your directories (§1.1).
* `agents/fetch` has its own `requirements.txt` or `pyproject.toml`. `data/scripts` has its own too.
* Fixture changes after CP1 need a heads-up in team chat, because the backend seed and the frontend both read them.
* Put env vars in `agents/fetch/.env.example` and `agents/relay/.env.example`. Ask the backend to add the Core API–side keys (`GROK_API_KEY`, `RELAY_API_KEY`) to the root `.env.example`.

## 9. Open questions for this track

* OGIM: how many assets are within 250 m of the MAIN point, and of what type?
* Do the MAIN event's `emission_auto` / wind values in the snapshot match the spike? Record them only in the fixture, not in docs.
* Relay: inbound SMS? Outbound calls? Webhooks? Trial limits? Who receives the demo call?
* Agentverse: hosted agent calling a tunnel URL, or a local agent with a mailbox?
* Carbon Mapper license: non-commercial use, with attribution shown in the UI. Confirm the frontend has it.
