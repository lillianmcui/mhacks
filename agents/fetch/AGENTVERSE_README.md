# CH4SE Methane Incident Response Agent

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

![tag:methane](https://img.shields.io/badge/methane-3D8BD3)
![tag:incident-response](https://img.shields.io/badge/incident--response-3D8BD3)

**ch4se-methane-response** turns trusted methane observations into an operator response you can drive from ASI:One.

## What it does

- Lists unresolved methane incidents (quotes provider `display` strings).
- Investigates evidence, asset, and escalation policy without notifying anyone.
- Handles the highest-priority unacknowledged incident by orchestrating Core API tools and requesting operator notification **through Relay**.
- Reports whether the field operator has acknowledged (status from CH4SE — Relay is the human channel).

Emission figures are provider estimates (e.g. Carbon Mapper). Demo detections may be real historical observations, replayed through CH4SE.

## Example queries

- `Do we have any unresolved methane incidents?`
- `Why is the highest-priority incident critical?`
- `Handle our highest-priority methane incident.`
- `Has the operator acknowledged it?`

## Channels

- **ASI:One** — manager / coordinator chat with this agent.
- **Relay** — field-operator messaging performed by the CH4SE Core API Relay adapter after `notify_operator`.

## Limitations

- Only the intents above are supported reliably.
- Handling an incident can send a real Relay message.
- This agent does not invent emission rates, assets, or acknowledgements.
