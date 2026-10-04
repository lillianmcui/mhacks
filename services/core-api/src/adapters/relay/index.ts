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

interface RelayMe {
  handle: string;
  owner_people?: { handle: string }[];
}

/**
 * Outbound alert via Relay messenger API (https://docs.relayapp.im).
 *
 * Relay is not a PSTN SMS gateway. `to_phone` from Core API is mapped to a
 * Relay handle via env (see below). We create/reuse a chat with an initial
 * message: POST /v1/chats { from, to[], message.parts }.
 *
 * Repo-root `.env` only:
 *   RELAY_API_KEY, RELAY_API_BASE
 *   RELAY_NOTIFY_HANDLE — recipient handle (default: agent owner from GET /v1/me)
 *   RELAY_FROM_HANDLE — optional; default agent handle from GET /v1/me
 */
export async function relaySend(input: RelaySendInput): Promise<RelaySendResult> {
  const apiKey = process.env.RELAY_API_KEY;
  const base = (process.env.RELAY_API_BASE ?? "https://api.relayapp.im").replace(/\/$/, "");
  if (!apiKey) {
    throw new Error("RELAY_API_KEY is not configured");
  }

  if (input.channel === "CALL") {
    throw new Error("Relay CALL channel is P1; use SMS/chat alerts for the demo");
  }

  const me = await relayGetMe(base, apiKey);
  const from = process.env.RELAY_FROM_HANDLE?.trim() || me.handle;
  const toHandle =
    process.env.RELAY_NOTIFY_HANDLE?.trim() ||
    me.owner_people?.[0]?.handle ||
    mapPhoneToHandle(input.to_phone);

  if (!toHandle) {
    throw new Error(
      "No Relay recipient handle: set RELAY_NOTIFY_HANDLE or ensure GET /v1/me returns owner_people",
    );
  }

  const idempotencyKey = `ch4se-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const res = await fetch(`${base}/v1/chats`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [toHandle],
      message: {
        parts: [{ type: "text", value: input.text }],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Relay HTTP ${res.status}: ${body.slice(0, 800)}`);
  }

  const data = (await res.json()) as {
    chat?: { id?: string; message?: { id?: string; delivery_status?: string } };
  };
  const status = (data.chat?.message?.delivery_status ?? "sent").toUpperCase();
  return {
    delivery_status: status === "FAILED" ? "FAILED" : status === "DELIVERED" ? "DELIVERED" : "SENT",
    provider_ref: data.chat?.message?.id ?? data.chat?.id ?? idempotencyKey,
  };
}

async function relayGetMe(base: string, apiKey: string): Promise<RelayMe> {
  const res = await fetch(`${base}/v1/me`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Relay GET /v1/me HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as RelayMe;
}

/** Optional JSON map in env: {"+17348825725":"bennett"} */
function mapPhoneToHandle(phone: string): string | undefined {
  const raw = process.env.RELAY_PHONE_HANDLE_MAP;
  if (!raw) return undefined;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[phone] ?? map[phone.replace(/\s+/g, "")];
  } catch {
    return undefined;
  }
}
