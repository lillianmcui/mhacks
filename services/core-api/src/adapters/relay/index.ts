/** DeliveryStatus from packages/contracts (SENT | DELIVERED | FAILED). */
export type DeliveryStatus = "SENT" | "DELIVERED" | "FAILED";

export type RelayChannel = "SMS" | "CALL";

export interface RelaySendInput {
  to_phone: string;
  channel: RelayChannel;
  text: string;
}

export interface RelaySendResult {
  delivery_status: DeliveryStatus;
  provider_ref: string;
}

function mapDeliveryStatus(raw: string | undefined): DeliveryStatus {
  const s = (raw ?? "").toUpperCase();
  if (s === "FAILED" || s === "FAIL") return "FAILED";
  if (s === "DELIVERED") return "DELIVERED";
  return "SENT";
}

/**
 * Outbound SMS/voice via Relay. Throws when misconfigured or upstream errors
 * (Core API maps throws → UPSTREAM_UNAVAILABLE).
 *
 * Env (repo-root `.env` only): RELAY_API_KEY, RELAY_API_BASE,
 * optional RELAY_SMS_PATH / RELAY_CALL_PATH.
 */
export async function relaySend(input: RelaySendInput): Promise<RelaySendResult> {
  const apiKey = process.env.RELAY_API_KEY;
  const base = process.env.RELAY_API_BASE?.replace(/\/$/, "");
  if (!apiKey || !base) {
    throw new Error("RELAY_API_KEY or RELAY_API_BASE is not configured");
  }

  const path =
    input.channel === "SMS"
      ? (process.env.RELAY_SMS_PATH ?? "/v1/messages")
      : (process.env.RELAY_CALL_PATH ?? "/v1/calls");

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
    delivery_status: mapDeliveryStatus(data.status),
    provider_ref: data.id ?? `relay-${Date.now()}`,
  };
}
