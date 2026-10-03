/** Every numeric token in model output must appear in the serialized input JSON. */

const NUMBER_RE = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi;

export function extractNumbers(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map(normalizeNumberToken);
}

function normalizeNumberToken(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(n);
}

export function assertNumbersGroundedInInput(outputText: string, inputJson: unknown): void {
  const inputBlob = JSON.stringify(inputJson);
  const inputNumbers = new Set(extractNumbers(inputBlob));
  const outputNumbers = extractNumbers(outputText);
  const hallucinated = outputNumbers.filter((n) => !inputNumbers.has(n));
  if (hallucinated.length > 0) {
    throw new Error(
      `Grok number-check failed: output contains numbers not in input: ${hallucinated.join(", ")}`,
    );
  }
}
