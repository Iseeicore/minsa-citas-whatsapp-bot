import crypto from "node:crypto";

// D6: the full parsed inbound WhatsApp webhook event, distinct from the raw
// untyped payload. Every field except eventId/receivedAt/source/messageType/
// raw is optional so the total mapper below never has to fabricate data it
// does not have.
export interface InboundConversationEvent {
  /** wamid from Meta, or a synthesized uuid when the payload carries none. */
  readonly eventId: string;
  /** ISO-8601, ours — the moment we parsed the payload, not Meta's. */
  readonly receivedAt: string;
  readonly source: "whatsapp";
  /** OUR business WhatsApp number id — not citizen data. */
  readonly waPhoneNumberId?: string;
  /** Citizen MSISDN — SENSITIVE. Never log this field directly. */
  readonly from?: string;
  /** WhatsApp profile name — SENSITIVE. Never log this field directly. */
  readonly contactName?: string;
  readonly messageType: string;
  /** Message body — SENSITIVE. Never log this field directly. */
  readonly text?: string;
  /** Meta's own timestamp (ISO-8601), for latency measurement. */
  readonly sentAt?: string;
  /** Full original payload, preserved verbatim for change 3 and replay. */
  readonly raw: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function firstChangeValue(raw: unknown): Record<string, unknown> | undefined {
  const entry = asRecord(raw)?.entry;
  const firstEntry = Array.isArray(entry) ? asRecord(entry[0]) : undefined;
  const changes = firstEntry?.changes;
  const firstChange = Array.isArray(changes) ? asRecord(changes[0]) : undefined;
  return asRecord(firstChange?.value);
}

function firstMessage(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const messages = value?.messages;
  return Array.isArray(messages) ? asRecord(messages[0]) : undefined;
}

function firstContactProfile(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const contacts = value?.contacts;
  const firstContact = Array.isArray(contacts) ? asRecord(contacts[0]) : undefined;
  return asRecord(firstContact?.profile);
}

function toIsoTimestamp(unixSeconds: unknown): string | undefined {
  const parsed = typeof unixSeconds === "string" ? Number(unixSeconds) : undefined;
  if (parsed === undefined || Number.isNaN(parsed)) return undefined;
  return new Date(parsed * 1000).toISOString();
}

// D6: total and NEVER throws. Meta legitimately posts delivery statuses,
// reactions, system events, and future shapes we have not modelled. A
// throwing mapper would turn a valid-but-new Meta payload into a 5xx and an
// infinite retry loop. Every unrecognized shape yields messageType:
// "unknown" with `raw` preserved intact — zero fidelity loss.
export function toInboundConversationEvent(raw: unknown): InboundConversationEvent {
  const value = firstChangeValue(raw);
  const message = firstMessage(value);
  const profile = firstContactProfile(value);
  const metadata = asRecord(value?.metadata);
  const text = asRecord(message?.text);

  return {
    eventId: asString(message?.id) ?? crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    source: "whatsapp",
    waPhoneNumberId: asString(metadata?.phone_number_id),
    from: asString(message?.from),
    contactName: asString(profile?.name),
    messageType: asString(message?.type) ?? "unknown",
    text: asString(text?.body),
    sentAt: toIsoTimestamp(message?.timestamp),
    raw,
  };
}
