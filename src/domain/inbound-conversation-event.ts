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
  /**
   * The selected row/button id from a WhatsApp interactive list or
   * quick-reply button message (`interactive.list_reply.id` /
   * `interactive.button_reply.id`). These ids are our own menu option
   * identifiers (e.g. "agendar_cita"), not citizen content.
   */
  readonly interactiveReplyId?: string;
  /** Meta's own timestamp (ISO-8601), for latency measurement. */
  readonly sentAt?: string;
  /**
   * Meta media handle for an image message (`message.image.id`) — SENSITIVE,
   * dereferences to citizen-submitted content. Pulled forward from Phase 6
   * (task 6.2) because Phase 5's `reclamo_awaiting_foto` state needs it to
   * detect a photo reply; the real downloader/encoder stay Phase 6/D21-gated
   * (D22/DNI-5: deliberately NOT added to InboundConversationEventLogView's
   * whitelist).
   */
  readonly mediaId?: string;
  /** Declared MIME type of the image (`message.image.mime_type`). */
  readonly mediaMimeType?: string;
  /**
   * Postgres conversation persistence (additive): populated for `location`
   * messages (`message.location.latitude`/`.longitude`). Undefined for every
   * other message type.
   */
  readonly latitude?: number;
  readonly longitude?: number;
  /** Full original payload, preserved verbatim for change 3 and replay. */
  readonly raw: unknown;
}

/**
 * Postgres conversation persistence (additive): one delivery-status update
 * for an outbound message we sent, correlated by `waMessageId` (Meta's own
 * `wamid`). Distinct from `InboundConversationEvent` — Meta sends these in
 * `value.statuses[]`, never mixed into `value.messages[]`.
 */
export interface InboundStatusEvent {
  readonly waMessageId: string;
  /** Meta's own status string (`sent`/`delivered`/`read`/`failed`) — kept as
   *  the raw string rather than a closed union, since Meta may add new
   *  values; the caller maps known ones and ignores the rest. */
  readonly status: string;
  readonly timestamp?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
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

// Meta nests every media message's payload under a key matching its own
// `type` (`message.image`, `message.audio`, `message.document`) — this
// returns the exact same value the original image-only lookup did, for
// `type: "image"`, now generalized to also cover audio/document.
const MEDIA_MESSAGE_TYPES = new Set(["image", "audio", "document"]);

function mediaContainer(message: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const type = asString(message?.type);
  if (type === undefined || !MEDIA_MESSAGE_TYPES.has(type)) return undefined;
  return asRecord(message?.[type]);
}

// Postgres conversation persistence (additive): `message.location` carries
// `{latitude, longitude, name?, address?}` as JSON numbers (not strings,
// unlike most of this payload) — only present for `type: "location"`.
function firstLocation(message: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return asRecord(message?.location);
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
  const interactive = asRecord(message?.interactive);
  const listReply = asRecord(interactive?.list_reply);
  const buttonReply = asRecord(interactive?.button_reply);
  const media = mediaContainer(message);
  const location = firstLocation(message);

  return {
    eventId: asString(message?.id) ?? crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    source: "whatsapp",
    waPhoneNumberId: asString(metadata?.phone_number_id),
    from: asString(message?.from),
    contactName: asString(profile?.name),
    messageType: asString(message?.type) ?? "unknown",
    text: asString(text?.body),
    interactiveReplyId: asString(listReply?.id) ?? asString(buttonReply?.id),
    sentAt: toIsoTimestamp(message?.timestamp),
    mediaId: asString(media?.id),
    mediaMimeType: asString(media?.mime_type),
    latitude: asNumber(location?.latitude),
    longitude: asNumber(location?.longitude),
    raw,
  };
}

// Postgres conversation persistence (additive): Meta sends delivery-status
// updates for OUR outbound messages in a completely separate `value.statuses[]`
// array, never mixed into `value.messages[]` — a single webhook POST carries
// one or the other in practice, but the shape technically allows both, so
// this is checked independently, not as an else-branch of the mapper above.
// Total and never throws, same discipline as toInboundConversationEvent.
export function toInboundStatusEvents(raw: unknown): readonly InboundStatusEvent[] {
  const value = firstChangeValue(raw);
  const statuses = value?.statuses;
  if (!Array.isArray(statuses)) return [];

  const events: InboundStatusEvent[] = [];
  for (const entry of statuses) {
    const record = asRecord(entry);
    const waMessageId = asString(record?.id);
    const status = asString(record?.status);
    if (waMessageId === undefined || status === undefined) continue;
    events.push({ waMessageId, status, timestamp: toIsoTimestamp(record?.timestamp) });
  }
  return events;
}
