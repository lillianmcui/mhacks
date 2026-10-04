# Synthetic company (Track C)

Shapes must match backend `Asset`, `Contact`, and `EscalationPolicy` in `packages/contracts`
(see `services/core-api/sample-fixtures/company/` on the backend branch).

## Rules

- Operator name is fictional (`Basin Midstream Co.`). Never copy real OGIM operator names.
- Put assets on **real OGIM coordinates** after the CP0 density check; update lat/lon then.
- `contacts[].phone` must be **teammate numbers only** — replace `+1REPLACE_ME` before any Relay demo.
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

After OGIM density: if MAIN has exactly 1 facility within 250 m, keep one asset at that point (`MATCHED`). If more than one, either switch demo event or expect `AMBIGUOUS`.
