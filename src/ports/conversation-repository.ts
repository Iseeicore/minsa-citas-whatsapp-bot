// Driven port for the Postgres-backed conversation/message inbox (D11-style,
// same discipline as SessionStore/ConversationEventDao/WhatsappOutboundSender:
// a hexagonal driven port with one Prisma implementation owned by
// infrastructure). ADDITIVE — this is a separate concern from the existing
// Redis-backed bot pipeline (ConversationEventDao/BullMQ) and from the
// webhook-channel viewer's own capped Redis buffer; neither is touched by
// anything that implements this port.

export type MessageType = "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT" | "LOCATION";
export type MessageStatus = "SENT" | "DELIVERED" | "READ" | "FAILED";

export interface InboundMessageRecord {
  readonly waId: string;
  readonly contactName?: string;
  readonly waMessageId: string;
  readonly type: MessageType;
  readonly text?: string;
  readonly mediaId?: string;
  readonly mediaMimeType?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  /** Meta's own message timestamp, not our insert time. */
  readonly timestamp: Date;
}

export interface OutboundMessageRecord {
  readonly waId: string;
  /** The wamid the Graph API returned for the send — undefined only if the
   *  caller could not correlate one (should not happen for a successful send). */
  readonly waMessageId?: string;
  readonly text: string;
  readonly timestamp: Date;
}

export interface ConversationSummary {
  readonly id: string;
  readonly waId: string;
  readonly displayName?: string;
  readonly lastMessageAt: Date;
}

export interface MessageSummary {
  readonly id: string;
  readonly direction: "INBOUND" | "OUTBOUND";
  readonly type: MessageType;
  readonly text?: string;
  readonly mediaId?: string;
  readonly mediaMimeType?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly status: MessageStatus;
  readonly timestamp: Date;
}

export interface ConversationRepository {
  /**
   * Finds or creates the conversation by waId, records the message, and
   * bumps lastMessageAt + lastInboundAt. MUST be idempotent by waMessageId —
   * Meta can redeliver the same webhook (its own retry policy), and this
   * must be a no-op the second time, not a duplicate row or a thrown error.
   */
  recordInboundMessage(input: InboundMessageRecord): Promise<void>;

  /**
   * Finds or creates the conversation by waId, records the message, and
   * bumps lastMessageAt only — an outbound message never resets the 24h
   * window, which is anchored to the customer's own last inbound message.
   */
  recordOutboundMessage(input: OutboundMessageRecord): Promise<{ conversationId: string; messageId: string }>;

  /**
   * Applies a delivery-status update from Meta's `statuses` webhook event to
   * the outbound message with that waMessageId. A no-op (not an error) if no
   * message with that waMessageId is on record.
   */
  updateMessageStatusByWaMessageId(waMessageId: string, status: MessageStatus): Promise<void>;

  /**
   * True when the conversation's lastInboundAt is within the last 24 hours
   * — false (never throws) for a waId with no conversation on record at all.
   */
  isWithin24HourWindow(waId: string): Promise<boolean>;

  listConversations(): Promise<readonly ConversationSummary[]>;

  listMessages(conversationId: string): Promise<readonly MessageSummary[]>;

  close(): Promise<void>;
}
