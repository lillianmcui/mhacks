# Synthetic company (Track C)

Shapes match TRACK_BACKEND `Asset`, `Contact`, `EscalationPolicy`.

## Rules

- Operator name is fictional (`Basin Midstream Co.`). Never copy real OGIM operator names.
- Put assets on **real OGIM coordinates** after the CP0 density check; update lat/lon then.
- `contacts[].phone` must be **teammate numbers only** — replace `+1REPLACE_ME` before any Relay demo.
- Policy `thresholds` were written as kickoff placeholders **before** reading MAIN `emission_auto`. Do not retune after looking at the plume.

## Current thresholds (kickoff)

| Name | Value |
|------|------:|
| `EMISSION_CRITICAL_KGH` | 500 |
| `EMISSION_HIGH_KGH` | 150 |
| `RECURRENCE_MIN_DETECTIONS` | 3 |

After OGIM density: if MAIN has exactly 1 facility within 250 m, keep one asset at that point (`MATCHED`). If more than one, either switch demo event or expect `AMBIGUOUS`.
