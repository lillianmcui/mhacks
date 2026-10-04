import type { BriefingInput, BriefingKind } from "./types.ts";

/**
 * Deterministic template. Uses ONLY `display` strings for numbers/dates/counts.
 * Never formats provider numbers itself.
 */
export function renderTemplateBriefing(
  input: BriefingInput,
  kind: BriefingKind,
): string {
  const { display, incident, policy_rule, asset, assigned_contact } = input;

  if (kind === "sms") {
    return renderSms(input);
  }

  const uncertain =
    incident.match_result !== "MATCHED"
      ? "The asset match is uncertain; verify on site before acting."
      : null;

  const lines = [
    `CH4SE ${incident.priority} methane incident ${incident.incident_id}.`,
    display.replay_notice,
    display.asset,
    `Emission estimate: ${display.emission}.`,
    display.provenance,
    display.distance ? `Distance: ${display.distance}.` : null,
    display.wind ? `Wind: ${display.wind}.` : null,
    display.persistence ? `Persistence: ${display.persistence}.` : null,
    `Observation history: ${display.history}; ${display.previous_incidents}.`,
    `Policy rule ${policy_rule.rule_id} routes this to ${policy_rule.notify_role}.`,
    asset
      ? `Operator context: ${asset.operator_name} (${asset.facility_type}).`
      : null,
    assigned_contact
      ? `Assigned: ${assigned_contact.name} (${assigned_contact.role}).`
      : null,
    uncertain,
    display.attribution,
  ].filter((line): line is string => line !== null);

  return lines.join(kind === "summary" ? " " : "\n");
}

/** Short mobile / Relay alert — scannable, no walls of text. */
function renderSms(input: BriefingInput): string {
  const { display, incident, policy_rule, assigned_contact } = input;
  const who = assigned_contact?.name ?? policy_rule.notify_role;
  const lines = [
    `CH4SE ${incident.priority} alert · ${incident.incident_id}`,
    `Replay · ${display.scene_timestamp}`,
    `Release: ${display.emission}`,
    display.asset,
    display.distance ? `Distance: ${display.distance}` : null,
    `You: ${who}`,
    "",
    "Do now:",
    ...nextSteps(input).map((s, i) => `${i + 1}. ${s}`),
    "",
    'Reply ACK to acknowledge, or ask "how bad?" / "what evidence?"',
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function nextSteps(input: BriefingInput): string[] {
  const { incident, asset } = input;
  if (incident.match_result === "MATCHED" && asset) {
    return [
      `Acknowledge in CH4SE, then check ${asset.asset_id} (${asset.facility_type}).`,
      "Treat as associated asset (not proven cause). Isolate safely if trained.",
      "Update status to INVESTIGATING once your team is on it.",
    ];
  }
  if (incident.match_result === "AMBIGUOUS") {
    return [
      "Acknowledge — match is ambiguous; do not assume a single site.",
      "Verify nearest candidates before mobilizing isolation.",
      "Escalate to area lead if you cannot discriminate sites quickly.",
    ];
  }
  return [
    "Acknowledge — no registered asset in range; widen the search.",
    "Coordinate with environmental lead before field isolation.",
    "Log findings; mark INVESTIGATING when a team is assigned.",
  ];
}
