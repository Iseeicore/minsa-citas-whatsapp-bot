import { msisdnFingerprint } from "./msisdn-fingerprint.js";
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

export function toLogView(event: InboundConversationEvent, deps: ToLogViewDeps): InboundConversationEventLogView {
  return {
    eventId: event.eventId,
    receivedAt: event.receivedAt,
    source: event.source,
    messageType: event.messageType,
    waPhoneNumberId: event.waPhoneNumberId,
    fromFingerprint: event.from !== undefined ? msisdnFingerprint(event.from, deps.logHashSecret) : undefined,
    textLength: event.text !== undefined ? event.text.length : undefined,
    sentAt: event.sentAt,
  };
}
