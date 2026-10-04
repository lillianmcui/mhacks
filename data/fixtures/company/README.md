# Synthetic company (Track C)

Shapes must match backend `Asset`, `Contact`, and `EscalationPolicy` in `packages/contracts`
(see `services/core-api/sample-fixtures/company/` on the backend branch).

## Rules

- Operator name is fictional (`Basin Midstream Co.`). Never copy real OGIM operator names.
- **Asset locations are synthetic.** The OGIM step has not been run, so no asset sits on a real OGIM facility:
  - `TX-184` is placed at the location Carbon Mapper records for the MAIN plume's source (`point` in `carbon_mapper/main/source.json`), so it is the one asset within 250 m of the MAIN plume origin (`MATCHED`).
  - `TX-185` to `TX-190` are invented positions 0.6 to 3 km from the plume, for map context only. None is within 250 m of the plume or of each other.
  - If OGIM coordinates become available, replace these and re-check the match.
- `contacts[].phone` must be **teammate numbers only** (E.164). Demo number: `+17348825725`.
- Policy `thresholds` were written as kickoff placeholders **before** reading MAIN `emission_auto`. Do not retune after looking at the plume.
- Condition keys are `min_emission` / `min_detections` / `match_results` / `facility_types` (threshold **names**, not raw numbers).
- **Last rule must be an unconditional catch-all** (`"conditions": {}`); seed rejects otherwise.
- Roles used for routing (`ambiguous_route_role`, `no_asset_route_role`, `notify_role`) must match a contact `role` in the same area when possible.

## Current thresholds (kickoff)

| Name | Value |
|------|------:|
| `EMISSION_CRITICAL_KGH` | 500 |
| `EMISSION_HIGH_KGH` | 150 |
| `RECURRENCE_MIN_DETECTIONS` | 3 |

Keep exactly one asset within 250 m of the MAIN plume origin for a `MATCHED` demo. A second one inside that radius makes the incident `AMBIGUOUS`.
