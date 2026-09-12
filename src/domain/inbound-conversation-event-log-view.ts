import crypto from "node:crypto";
import type { InboundConversationEvent } from "./inbound-conversation-event.js";

// D7: pseudonymous metadata goes to the log stream; identifying content
// lives only in the queue/DB behind access control. `from`, `text`,
// `contactName`, and `raw` are deliberately NOT fields on this type — not
// omitted-when-undefined, genuinely absent from the shape.
export interface InboundConversationEventLogView {
  readonly eventId: string;
  readonly receivedAt: string;
  readonly source: "whatsapp";
  readonly messageType: string;
  readonly waPhoneNumberId?: string;
  /** Keyed HMAC of `from`, truncated to 12 hex chars. Non-reversible, stable per MSISDN. */
  readonly fromFingerprint?: string;
  /** Length only — never the message content. */
  readonly textLength?: number;
  readonly sentAt?: string;
}

export interface ToLogViewDeps {
  logHashSecret: string;
}

// Keyed HMAC, not masking (last-four digits are still semi-identifying) and
// not plain SHA-256 (the MSISDN space is small enough to brute-force
// exhaustively, so an unkeyed digest is not a redaction).
function fingerprint(from: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(from).digest("hex").slice(0, 12);
}

export function toLogView(event: InboundConversationEvent, deps: ToLogViewDeps): InboundConversationEventLogView {
  return {
    eventId: event.eventId,
    receivedAt: event.receivedAt,
    source: event.source,
    messageType: event.messageType,
    waPhoneNumberId: event.waPhoneNumberId,
    fromFingerprint: event.from !== undefined ? fingerprint(event.from, deps.logHashSecret) : undefined,
    textLength: event.text !== undefined ? event.text.length : undefined,
    sentAt: event.sentAt,
  };
}
