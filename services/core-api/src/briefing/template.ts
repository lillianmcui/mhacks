import type { BriefingInput, BriefingKind } from "./types.ts";

/**
 * Deterministic template. Uses ONLY `display` strings for numbers/dates/counts.
 * Never formats provider numbers itself.
 */
export function renderTemplateBriefing(
  input: BriefingInput,
  kind: BriefingKind,
): string {
  const { display, incident, policy_rule, asset } = input;
  const uncertain =
    incident.match_result !== "MATCHED"
      ? "The asset match is uncertain; verify on site before acting."
      : null;

  if (kind === "sms") {
    const parts = [
      `CH4SE ${incident.priority} methane incident ${incident.incident_id}.`,
      display.asset,
      `Emission estimate: ${display.emission}.`,
      display.provenance,
      display.replay_notice,
      uncertain,
    ].filter(Boolean);
    return parts.join(" ");
  }

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
    uncertain,
    display.attribution,
  ].filter((line): line is string => line !== null);

  return lines.join(kind === "summary" ? " " : "\n");
}
