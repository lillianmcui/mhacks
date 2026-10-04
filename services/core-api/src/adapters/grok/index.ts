import type { BriefingInput, BriefingKind } from "../../briefing/types.ts";
import { assertNumbersGroundedInInput } from "./numberCheck.ts";

const DEFAULT_TIMEOUT_MS = 15_000;

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

  const system = [
    "You write operator briefings for methane incident response.",
    "Use ONLY facts from the JSON input.",
    "Quote every emission, uncertainty, timestamp, persistence, count, and distance using the exact display strings provided under display.*.",
    "Never rewrite dates in prose (do not turn 2026-08-13 into August 13). Copy display.scene_timestamp and display.provenance verbatim.",
    "Never compute or infer new numbers.",
    'Say "associated asset" or "nearest registered asset", never "caused by".',
    "When display.replay_notice is present, include that this is a replayed historical observation.",
    "If incident.match_result is not MATCHED, state uncertainty explicitly.",
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
        model: process.env.GROK_MODEL ?? "grok-3",
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
