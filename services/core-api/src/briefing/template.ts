import type { BriefingInput, BriefingKind } from "./types.js";

function caveatsBlock(input: BriefingInput): string {
  const lines: string[] = [];
  if (input.match_result !== "MATCHED") {
    if (input.match_result === "AMBIGUOUS") {
      lines.push(
        input.display.candidates ??
          "Multiple registered assets are near this plume origin; match is ambiguous.",
      );
    } else {
      lines.push("No registered asset is within the matching radius of this plume origin.");
    }
  }
  for (const c of input.evidence_caveats ?? []) {
    lines.push(c);
  }
  return lines.length ? `\n\nNote: ${lines.join(" ")}` : "";
}

function replayPrefix(input: BriefingInput): string {
  return input.is_replay
    ? "This is a replayed historical observation from Carbon Mapper, not a live event."
    : "";
}

export function renderTemplateBriefing(
  input: BriefingInput,
  kind: BriefingKind,
): string {
  const replay = replayPrefix(input);
  const emission =
    input.display.emission_with_uncertainty ?? input.display.emission ?? "emission unavailable";
  const when = input.display.scene_timestamp ?? "observation time unavailable";
  const assetPhrase =
    input.match_result === "MATCHED" && input.asset_id
      ? `associated asset ${input.asset_id}${input.facility_type ? ` (${input.facility_type})` : ""}`
      : "nearest registered asset (match not confirmed)";

  const caveats = caveatsBlock(input);

  if (kind === "sms") {
    const parts = [
      replay,
      `CH4SE alert: ${emission} at ${when}.`,
      `Review ${assetPhrase}.`,
      input.display.priority ? `Priority: ${input.display.priority}.` : "",
      input.display.policy_action ?? "",
    ].filter(Boolean);
    return parts.join(" ").slice(0, 320) + caveats;
  }

  if (kind === "summary") {
    return [
      replay,
      `Observation ${when}: ${emission}.`,
      `Facility context: ${assetPhrase}${input.operator_name ? `, operator ${input.operator_name}` : ""}.`,
      input.display.persistence ? `Persistence: ${input.display.persistence}.` : "",
      input.display.history ?? "",
      input.display.policy_action ?? "",
    ]
      .filter(Boolean)
      .join("\n") + caveats;
  }

  // operator
  return [
    replay,
    `You are being contacted about a methane plume observation recorded on ${when}.`,
    `Estimated release: ${emission}.`,
    `This plume origin is linked to the ${assetPhrase}.`,
    input.display.wind ? `Wind: ${input.display.wind}.` : "",
    input.display.plume_quality ? `Plume quality: ${input.display.plume_quality}.` : "",
    input.display.persistence ? `Source persistence (provider): ${input.display.persistence}.` : "",
    input.display.history ?? "",
    input.display.policy_action
      ? `Escalation policy: ${input.display.policy_action}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n") + caveats;
}
