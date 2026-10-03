# Track B — Backend: SpacetimeDB + Core API

**Owner:** Backend teammate
**Branch prefix:** `track/backend/*`
**Source of truth for scope:** CH4SE Product Direction (rev. 2026-10-03). Do not change P0/P1/P2 without flagging it to the team.

This track owns **all operational state** and **the one implementation of every shared action**. The frontend reads state from you; the agents (Fetch, Relay) change state only through you. This file is also the interim home of the **shared contracts** (§3). When `docs/SPEC.md` is written, move §3 there verbatim and replace it here with a link. Until then, the other two track files link here instead of restating anything.

---

## 1. What you own

### 1.1 Directories (only you edit these)

```
spacetime/module/            SpacetimeDB TypeScript module: tables + reducers
packages/contracts/          Shared TS types, enums, action I/O types, display formatters
packages/stdb-bindings/      Generated SpacetimeDB client bindings (generated, committed)
packages/rules/priority.ts   Deterministic priority + escalation evaluation (+ tests)
services/core-api/           HTTP service, EXCEPT the two adapter folders owned by Track C (below)
services/seed/               Seed loader: fixtures -> reducers; "replay event" command
```

### 1.2 Root files (you own; others request changes in a PR comment or chat)

```
README.md  .gitignore  .env.example  PROJECT.md  docs/SPEC.md (when created)
```

### 1.3 Folders inside your service that you do **not** edit

Track C owns these. You call them through the interfaces in §3.6 and never change their insides.

```
services/core-api/src/adapters/grok/       Grok client + number-check validator
services/core-api/src/adapters/relay/      Outbound SMS/call via Relay
services/core-api/src/briefing/            Deterministic template briefing
```

You also consume, but do not edit, `packages/rules/match.ts` (Track C: asset matching) and `data/` (Track C: fixtures).

---

## 2. Responsibilities

1. SpacetimeDB module: the tables and reducers in §3.2–§3.3.
2. State machine enforcement (§3.4). Reducers reject illegal transitions.
3. Priority/escalation rules (§3.5) as a pure, deterministic, unit-tested function. No LLM is involved.
4. Core API: every action in §3.6, over HTTP, with the response envelope and error codes in §3.7.
5. Seed loader. It loads the synthetic company (assets, contacts, policies) at startup. Separately, a **replay** command inserts the MAIN Carbon Mapper event and runs: match (Track C's function), then priority (yours), then `create_incident`.
6. Display formatters in `packages/contracts/format.ts`. They produce the preformatted strings that agents must quote verbatim and the dashboard shows, e.g. `"{emission_auto} ± {emission_uncertainty_auto} kg CH4/hr (Carbon Mapper estimate)"`. This is the one place numbers are turned into text.
7. A **stub Core API** by Checkpoint 0 (see §5). Every action returns canned, correctly-shaped data, so Tracks A and C are never blocked on you.
8. Local SpacetimeDB setup (the fallback for SpacetimeDB cloud).

Not yours: Grok prompts, Relay webhooks, Fetch agent logic, fixtures, map UI.

---

## 3. Shared contracts (interim canonical; others link here)

Field category labels, from Product Direction §10.1:
`[OBS]` observed provider data (Carbon Mapper) · `[DER]` derived CH4SE data · `[SYN]` synthetic demo data · `[LLM]` LLM- or template-generated content.

Provider field names follow Product Direction §5.3 **exactly**. Do not rename them.

### 3.1 Enums

```
IncidentStatus  = DETECTED | ANALYZED | ALERT_SENT | ACKNOWLEDGED | INVESTIGATING | RESOLVED
MatchResult     = MATCHED | AMBIGUOUS | NO_REGISTERED_ASSET
Priority        = CRITICAL | HIGH | MEDIUM | LOW            (exact set: confirm at kickoff)
Actor           = FETCH_AGENT | RELAY_AGENT | DASHBOARD | SYSTEM
AlertChannel    = SMS | CALL | DASHBOARD
BriefingSource  = GROK | TEMPLATE
```

### 3.2 SpacetimeDB tables

The table list comes from Product Direction §8.2. `ProviderSource` is an **addition (flagged)**: it holds the source record, so history isn't copied into every event row.

**MethaneEvent**: one Carbon Mapper plume
| field | cat | notes |
|---|---|---|
| event_id | DER | internal primary key. **Never** use `source_name` as a key (§5.5 gotcha) |
| plume_id | OBS | e.g. `tan20260813t190401c96s4001-B` |
| scene_id | OBS | |
| scene_timestamp | OBS | from source JSON (`datetime` in CSV; the seed loader normalizes to this one field) |
| plume_latitude, plume_longitude | OBS | |
| instrument | OBS | `tan`, `emi`, `av3`, `ang`, GAO |
| ipcc_sector | OBS | |
| emission_auto, emission_uncertainty_auto | OBS | kg CH4/hr; uncertainty may be null (94% coverage) |
| wind_speed_avg_auto, wind_direction_avg_auto, wind_source_auto | OBS | nullable |
| plume_quality | OBS | |
| plume_png | OBS | URL or fixture path |
| source_name | OBS | reference only, not a key |
| provider | DER | constant `"Carbon Mapper"` for P0 |
| is_replay | DER | always `true` in the demo |
| ingested_at | DER | when CH4SE received it (the replay time, **not** the observation time) |

**ProviderSource**: snapshot of `/catalog/source/{source_name}`
| field | cat |
|---|---|
| source_name | OBS |
| persistence, emission_auto, emission_uncertainty_auto | OBS |
| observation_dates[], detection_dates[] | OBS |
| explanation | OBS |

**Asset**
| field | cat | notes |
|---|---|---|
| asset_id | SYN | e.g. `TX-184` |
| facility_type | SYN | taken from the OGIM table name |
| latitude, longitude | SYN | real OGIM v3.0 location; ownership is synthetic |
| operator_name | SYN | the fictional company. **Never** the OGIM operator |
| site_manager_contact_id | SYN | |
| area_id | SYN | used for AMBIGUOUS routing |
| policy_id | SYN | |

**Contact**: `contact_id, name, role, phone, area_id`. All fields are SYN. Phones belong to teammates only.

**EscalationPolicy**: `policy_id, rules[]` (all SYN). Each rule has `rule_id`, conditions (§3.5), resulting `priority`, `notify_role`. Each policy also has `ambiguous_route_role` and `no_asset_route_role`.

**Incident**
| field | cat |
|---|---|
| incident_id | DER |
| event_id | DER |
| match_result | DER |
| asset_id (nullable) | DER |
| distance_m (nullable) | DER |
| candidates[] `{asset_id, distance_m}` | DER |
| priority, policy_rule_id | DER |
| status | DER |
| assigned_contact_id | DER |
| created_at, updated_at | DER |

**Alert**: `alert_id, incident_id, contact_id, channel, sent_at, delivery_status` (DER), plus `message_text` (LLM) and `briefing_source` (DER).

**Acknowledgement**: `incident_id, contact_id, channel, at` (DER).

**Action**: audit log. `action_id, incident_id, actor, action_name, detail, at` (DER).

### 3.3 Reducers

All mutations go through reducers. No other write path exists.

| reducer | effect |
|---|---|
| `insert_event` | adds a MethaneEvent (and its ProviderSource if new). Used by the replay command. **Addition (flagged)** |
| `seed_*` | seeds Asset, Contact, EscalationPolicy. **Addition (flagged)**. Startup only |
| `create_incident` | adds an Incident with status `ANALYZED` (match + priority already computed) |
| `set_incident_status` | validated transition (§3.4) |
| `acknowledge_incident` | writes an Acknowledgement row and sets status `ACKNOWLEDGED` |
| `record_alert` | writes an Alert. On a successful send it sets status `ALERT_SENT` if the current status is `ANALYZED` |
| `record_action` | appends to Action |

### 3.4 Incident state machine

```
DETECTED -> ANALYZED -> ALERT_SENT -> ACKNOWLEDGED -> INVESTIGATING -> RESOLVED
                 \________________________^
            (ack allowed from ANALYZED, e.g. via the dashboard before any alert)
```

* Any other transition returns `INVALID_TRANSITION`.
* "Acknowledge and mark us investigating" is **two calls**: `acknowledge_incident`, then `set_incident_status(INVESTIGATING)`. The Core API also accepts `acknowledge_incident{ then_status: "INVESTIGATING" }` as a convenience, which runs both reducers in order.
* Every transition also writes an `Action` row with the actor.

### 3.5 Priority rules (deterministic)

* Inputs: `emission_auto`, `len(detection_dates)`, `match_result`, `facility_type`.
* Thresholds are **named placeholders** set in the synthetic policy fixture: `EMISSION_CRITICAL_KGH`, `EMISSION_HIGH_KGH`, `RECURRENCE_MIN_DETECTIONS`. Write the values into the policy **at kickoff, before looking at the MAIN event's numbers** (Product Direction §15).
* Output: `{ priority, policy_rule_id, notify_role }`. Rules are evaluated in order and the first match wins. Unit-test every rule.
* `AMBIGUOUS` routes to `ambiguous_route_role`. `NO_REGISTERED_ASSET` routes to `no_asset_route_role`.

### 3.6 Core API actions

* **Transport:** `POST /actions/{action_name}`, JSON body.
* **Auth:** shared bearer token from `.env`.
* **Formatted numbers:** every number an agent might speak is returned twice, as a raw value and as a `display` string from `packages/contracts/format.ts`.

| action | input | output | errors |
|---|---|---|---|
| `get_open_incidents` | `{ limit? }` | `IncidentSummary[]` sorted by priority, then `created_at` | — |
| `get_incident` | `{ incident_id }` | `IncidentDetail` (incident + event + asset match + assigned contact + status) | NOT_FOUND |
| `get_asset` | `{ asset_id }` | Asset + owning Contact | NOT_FOUND |
| `get_evidence` | `{ incident_id }` | provider fields + display strings + provenance `"Carbon Mapper · {instrument} · {scene_timestamp}"` + `is_replay` | NOT_FOUND |
| `get_escalation_policy` | `{ asset_id \| incident_id }` | the policy + the rule that fired | NOT_FOUND |
| `get_asset_history` | `{ incident_id }` | ProviderSource (detection/observation dates, persistence) + previous CH4SE incidents, with display strings like `"detected on {n} of {m} observation dates since {first_date}"` | NOT_FOUND |
| `acknowledge_incident` | `{ incident_id, contact_id, channel, then_status? }` | updated IncidentSummary | NOT_FOUND, INVALID_TRANSITION |
| `set_incident_status` | `{ incident_id, status, actor, note? }` | updated IncidentSummary | NOT_FOUND, INVALID_TRANSITION |
| `generate_briefing` | `{ incident_id, kind: "operator" \| "sms" \| "summary" }` | `{ text, source: GROK \| TEMPLATE }` | NOT_FOUND |
| `notify_operator` | `{ incident_id, channel: SMS \| CALL }` | `{ alert_id, delivery_status }` | NOT_FOUND, UPSTREAM_UNAVAILABLE |
| `record_action` | `{ incident_id, actor, action_name, detail }` | `{ action_id }` | NOT_FOUND |
| `handle_highest_priority` | `{ actor }` | the orchestration result. **Addition (flagged)**: the same sequence as the Fetch agent, so the dashboard fallback button (Product Direction §14) and Fetch share one implementation | NO_OPEN_INCIDENTS |

`generate_briefing` tries Grok first and falls back to the template. You only wire this together; Track C implements both adapters (§3.8).
`notify_operator` calls Track C's Relay adapter, then `record_alert`.

### 3.7 Response envelope and errors

```
{ "ok": true,  "data": ... }
{ "ok": false, "error": { "code": "<CODE>", "message": "..." } }
CODES: NOT_FOUND | INVALID_TRANSITION | VALIDATION_ERROR | UPSTREAM_UNAVAILABLE | NO_OPEN_INCIDENTS | UNAUTHORIZED
```

### 3.8 In-process interfaces you call (Track C implements them)

Freeze these at kickoff, and put the signatures in `packages/contracts/adapters.ts`:

* `matchAsset(plumeLatLon, assets[], radius_m) -> { match_result, asset_id?, distance_m?, candidates[] }`. Lives in `packages/rules/match.ts`.
* `renderTemplateBriefing(BriefingInput, kind) -> string`
* `grokBriefing(BriefingInput, kind) -> { text } | throws`. The number-check validation happens inside the adapter. If it fails, the adapter throws.
* `relaySend({ to_phone, channel, text }) -> { delivery_status, provider_ref }`

`BriefingInput` is a JSON object holding the provider fields, display strings, asset match, policy rule and history. You define it in contracts.

---

## 4. Real-time propagation (your half)

```
caller (Fetch | Relay | dashboard fallback) -> Core API action -> SpacetimeDB reducer -> table row changes -> subscribers (dashboard) update
```

The Core API never pushes to the dashboard. The dashboard subscribes to SpacetimeDB directly, using `packages/stdb-bindings`.

---

## 5. Checkpoints

| CP | You deliver | Unblocks |
|---|---|---|
| **CP0** (first hour) | `packages/contracts` with enums and types from §3; stub Core API returning canned data for every action; SpacetimeDB module skeleton with tables; generated bindings committed | A can subscribe; C can call every action |
| **CP1** | Seed loader reads Track C's fixtures; `replay` inserts the MAIN event; incident created as `ANALYZED` with real match + priority | A shows the real event and incident |
| **CP2** | All actions real; state machine enforced; `handle_highest_priority` works with template briefing + Relay adapter | End-to-end demo via dashboard fallback |
| **CP3** | Grok path wired with fallback; local SpacetimeDB rehearsal from a clean start | Demo rehearsal |

## 6. Acceptance checks for this track

* Running `seed` then `replay` from a clean DB produces exactly one Incident whose numbers match the fixture byte-for-byte. No hand-typed values.
* An illegal transition returns `INVALID_TRANSITION`, and the row is unchanged.
* Every successful mutation writes an `Action` row.
* With Grok disabled, `generate_briefing` returns `source: TEMPLATE`.
* With Relay disabled, `notify_operator` returns `UPSTREAM_UNAVAILABLE`. The incident stays `ANALYZED`, and the dashboard fallback still works.
* No secrets are committed. `.env.example` lists every variable.

## 7. Merge-conflict rules for this track

* After CP0, any change to `packages/contracts` gets a heads-up in team chat **before** the push. Make additive changes only (new optional fields); never rename.
* Regenerate `packages/stdb-bindings` only in its own commit, with the message `chore(bindings): regenerate`.
* Use separate `package.json` and lockfile per package/service. No shared root lockfile.

## 8. Open questions for this track

* Will the SpacetimeDB TS module's reducer API and the TS client SDK version both be pinned and compatible? Pin them at CP0.
* How do the Core API and the Fetch agent on Agentverse reach each other? Public tunnel URL, or Fetch runs locally? (Track C decides; you expose the port and the token.)
* Is the exact `Priority` enum, and which priority the dashboard labels "CRITICAL", confirmed?
