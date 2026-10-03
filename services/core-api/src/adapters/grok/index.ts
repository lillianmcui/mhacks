import type { BriefingInput, BriefingKind } from "../../briefing/types.js";
import { assertNumbersGroundedInInput } from "./numberCheck.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface GrokBriefingResult {
  text: string;
}

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
    "Quote every emission, uncertainty, timestamp, persistence, count, and distance using the exact display strings provided.",
    "Never compute or infer new numbers.",
    'Say "associated asset" or "nearest registered asset", never "caused by".',
    'Say "replayed historical observation" when is_replay is true.',
    "If match_result is not MATCHED or evidence_caveats is non-empty, state uncertainty explicitly.",
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
        model: process.env.GROK_MODEL ?? "grok-2-latest",
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

    assertNumbersGroundedInInput(text, { kind, briefing: input });
    return { text };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Grok request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export { assertNumbersGroundedInInput, extractNumbers } from "./numberCheck.js";
