export type RelayChannel = "SMS" | "CALL";

export interface RelaySendInput {
  to_phone: string;
  channel: RelayChannel;
  text: string;
}

export interface RelaySendResult {
  delivery_status: "sent" | "failed" | "queued";
  provider_ref?: string;
}

/**
 * Outbound SMS/voice via Relay sponsor API.
 * Set RELAY_API_KEY and RELAY_API_BASE in Core API env (never commit keys).
 */
export async function relaySend(input: RelaySendInput): Promise<RelaySendResult> {
  const apiKey = process.env.RELAY_API_KEY;
  const base = process.env.RELAY_API_BASE?.replace(/\/$/, "");
  if (!apiKey || !base) {
    throw new Error("RELAY_API_KEY or RELAY_API_BASE is not configured");
  }

  const path =
    input.channel === "SMS"
      ? process.env.RELAY_SMS_PATH ?? "/v1/messages"
      : process.env.RELAY_CALL_PATH ?? "/v1/calls";

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.to_phone,
      body: input.text,
      channel: input.channel.toLowerCase(),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Relay HTTP ${res.status}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as { id?: string; status?: string };
  return {
    delivery_status: data.status === "failed" ? "failed" : "sent",
    provider_ref: data.id,
  };
}
