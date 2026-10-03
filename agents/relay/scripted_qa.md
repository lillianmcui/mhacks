# Scripted Relay demo questions → Core API tools

Use with `prompts/system.md`. Free-form beyond this list is P1.

| Operator says | Tool(s) | Notes |
|---------------|---------|--------|
| Why was I alerted? | `get_incident`, `get_escalation_policy`, optionally `generate_briefing` kind=`operator` | Quote priority + policy display strings |
| What evidence do we have? | `get_evidence` | Quote provenance + emission display; say replayed historical observation |
| How bad is this? | `get_evidence` / incident priority display | No invented magnitudes |
| Has this happened before? | `get_asset_history` | Quote persistence / detection counts verbatim |
| Who owns this site? | `get_asset` | Synthetic operator name only |
| What does our policy require? | `get_escalation_policy` | Quote notify_role / rule |
| Acknowledge it and mark my team as investigating | `acknowledge_incident` with `then_status=INVESTIGATING` (or ack + `set_incident_status`) | Actor `RELAY_AGENT` |
