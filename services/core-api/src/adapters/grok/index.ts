import type { BriefingInput, BriefingKind } from "../../briefing/types.ts";
import { assertNumbersGroundedInInput } from "./numberCheck.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
// A non-reasoning model: briefings only restate given strings, and a reasoning
// model (grok-4.7 was tried) does not answer inside the timeout.
const DEFAULT_MODEL = "grok-4.20-0309-non-reasoning";

const PLAIN_TEXT_RULES = [
  "Output plain text only: no markdown, no asterisks, no #, no backticks, no bold or italics.",
  "Never write JSON keys or field paths (such as display.emission, match_result, notify_role); write the values in plain words.",
].join(" ");

export interface GrokBriefingResult {
  text: string;
}

/**
 * §3.8 grokBriefing. Throws on missing key, timeout, empty content, or number-check failure.
 * Core API catches and falls back to template.
 */
export async function grokBriefing(
  input: BriefingInput,
  kind: BriefingKind,
  options?: { timeoutMs?: number },
): Promise<GrokBriefingResult> {
  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    throw new Error("GROK_API_KEY is not set");
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const system =
    kind === "sms"
      ? [
          "You write a SHORT mobile methane alert for field operators (Relay / SMS).",
          "Hard limit: at most 12 short lines. Prefer line breaks over paragraphs.",
          "Structure exactly:",
          "1) One-line header: CH4SE {priority} alert · {incident_id}",
          "2) Replay · paste display.scene_timestamp verbatim",
          "3) Release: paste display.emission verbatim",
          "4) Paste display.asset verbatim (one line)",
          "5) If display.distance is non-null, one Distance line with that string",
          "6) You: assigned contact name or policy notify_role",
          "7) Blank line, then 'Do now:' and 3 numbered next actions (no new numbers; no invented sites)",
          "8) Closing: reply ACK to acknowledge, or ask how bad / what evidence",
          "Use ONLY facts from the JSON. Quote display.* strings verbatim for any quantity/date.",
          'Never say "caused by". Say associated/nearest registered asset wording from display.asset.',
          "If match_result is not MATCHED, the Do-now steps must say the match is uncertain.",
          "Do not dump wind, IPCC, persistence, history, or provenance unless kind is not sms.",
          PLAIN_TEXT_RULES,
        ].join(" ")
      : kind === "operator"
        ? [
            "You write a short operator briefing for a methane incident, shown on a phone screen.",
            "Use ONLY facts from the JSON. Copy the display strings verbatim for every quantity, date and distance; never compute, round or reword numbers or dates.",
            "Output exactly these lines, one fact per line, under 70 words total:",
            "line 1: '{priority} priority · {incident_id}'",
            "line 2: the replay notice string",
            "blank line",
            "the asset string, as given",
            "'Release: ' + the emission string",
            "'Seen: ' + the provenance string",
            "'Wind: ' + the wind string, only if it is not null",
            "'History: ' + the history string",
            "'Routed to: ' + assigned contact name and role, or the notify role",
            "'Caution: ' + one short sentence, only if the match is not MATCHED",
            "blank line",
            "'Next:' then two or three lines starting with '- ', each under 10 words, no digits.",
            'Say "associated asset" or "nearest registered asset", never "caused by".',
            PLAIN_TEXT_RULES,
          ].join(" ")
        : [
            "You write operator briefings for methane incident response.",
            "Use ONLY facts from the JSON input.",
            "Quote every emission, uncertainty, timestamp, persistence, count, and distance using the exact display strings provided under display.*.",
            "Never rewrite dates in prose (do not turn 2026-08-13 into August 13). Copy display.scene_timestamp and display.provenance verbatim.",
            "Never compute or infer new numbers.",
            'Say "associated asset" or "nearest registered asset", never "caused by".',
            "When display.replay_notice is present, include that this is a replayed historical observation.",
            "If incident.match_result is not MATCHED, state uncertainty explicitly.",
            "Keep summary briefings under ~120 words.",
            PLAIN_TEXT_RULES,
          ].join(" ");

  const user = JSON.stringify({ kind, briefing: input }, null, 2);

  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROK_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Grok HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Grok returned empty content");
    }

    // Number-check against the full BriefingInput JSON (includes rounded display strings).
    assertNumbersGroundedInInput(text, { kind, briefing: input });
    return { text };
  } catch (err) {
    const aborted =
      controller.signal.aborted ||
      (err instanceof Error && err.name === "AbortError");
    if (aborted) {
      throw new Error(`Grok request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export { assertNumbersGroundedInInput, extractNumbers } from "./numberCheck.ts";
