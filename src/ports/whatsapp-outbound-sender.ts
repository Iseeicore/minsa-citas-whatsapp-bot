// Driven port for outbound WhatsApp messages (D11-style: mirrors
// SessionStore/ConversationEventDao's own discipline — a hexagonal driven
// port with one Meta Cloud API implementation owned by infrastructure).
//
// D17: `to` is a PARAMETER on every method, sourced by the caller from the
// in-flight InboundConversationEvent.from. This port does not derive, store,
// or persist the recipient MSISDN — it only ever forwards what it is given.

/** One selectable row inside an interactive list section. */
export interface ListRow {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
}

/** One titled group of rows inside an interactive list message. */
export interface ListSection {
  readonly title?: string;
  readonly rows: readonly ListRow[];
}

/** Content for an interactive list message (WhatsApp's "list" interactive type). */
export interface InteractiveList {
  readonly body: string;
  readonly header?: string;
  readonly footer?: string;
  readonly buttonLabel: string;
  readonly sections: readonly ListSection[];
}

/** One quick-reply button inside an interactive button message. */
export interface ReplyButton {
  readonly id: string;
  readonly title: string;
}

/** Content for an interactive reply-button message (WhatsApp's "button" interactive type). */
export interface ButtonMessage {
  readonly body: string;
  readonly buttons: readonly ReplyButton[];
}

export interface WhatsappOutboundSender {
  /** Sends a plain text message to `to` (an MSISDN). */
  sendText(to: string, body: string): Promise<void>;

  /** Sends an interactive list message to `to` (an MSISDN). */
  sendInteractiveList(to: string, list: InteractiveList): Promise<void>;

  /** Sends an interactive reply-button message to `to` (an MSISDN). */
  sendButtons(to: string, buttons: ButtonMessage): Promise<void>;
}
