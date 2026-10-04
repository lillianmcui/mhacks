# CH4SE Methane Incident Response Agent

![tag:methane](https://img.shields.io/badge/methane-3D8BD3)
![tag:incident-response](https://img.shields.io/badge/incident--response-3D8BD3)
![tag:oil-and-gas](https://img.shields.io/badge/oil--and--gas-3D8BD3)

CH4SE turns satellite methane detections into incidents an operations team can act on. This agent is the chat front door: it reports which methane incidents are still unresolved and can handle the highest-priority one end to end.

## What it does

- **Reports unresolved incidents.** Tells you how many methane incidents are open and which registered asset the most urgent one is associated with.
- **Handles the highest-priority incident.** Looks up the incident, the associated asset and the escalation policy, generates a briefing, and notifies the assigned operator. It reports each step, including any that failed.

Emission figures are Carbon Mapper estimates. Detections shown in the demo are real historical observations, replayed through CH4SE.

## Example queries

- `Do we have any unresolved methane incidents?`
- `Are there any open incidents?`
- `Handle the highest priority one.`

## Limitations

- It understands the two requests above; other messages get a short help reply.
- "Handle the highest priority one" sends a real notification to the assigned operator.
- It does not acknowledge or resolve incidents; operators do that from the alert or the CH4SE dashboard.
