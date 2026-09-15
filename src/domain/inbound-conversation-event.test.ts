import { describe, expect, it } from "vitest";
import { toInboundConversationEvent } from "./inbound-conversation-event.js";

const TEXT_MESSAGE_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry-1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "51999000111", phone_number_id: "1234567890" },
            contacts: [{ profile: { name: "Juan Perez" }, wa_id: "51999999999" }],
            messages: [
              {
                from: "51999999999",
                id: "wamid.HBgLNTE5OTk5OTk5OTk=",
                timestamp: "1700000000",
                type: "text",
                text: { body: "Hola, quiero una cita" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const LIST_REPLY_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry-3",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "1234567890" },
            contacts: [{ profile: { name: "Juan Perez" }, wa_id: "51999999999" }],
            messages: [
              {
                from: "51999999999",
                id: "wamid.list-reply-1",
                timestamp: "1700000200",
                type: "interactive",
                interactive: {
                  type: "list_reply",
                  list_reply: { id: "agendar_cita", title: "Agendar cita" },
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

const BUTTON_REPLY_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry-4",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "1234567890" },
            contacts: [{ profile: { name: "Juan Perez" }, wa_id: "51999999999" }],
            messages: [
              {
                from: "51999999999",
                id: "wamid.button-reply-1",
                timestamp: "1700000300",
                type: "interactive",
                interactive: {
                  type: "button_reply",
                  button_reply: { id: "registrar_reclamo", title: "Registrar un reclamo" },
                },
              },
            ],
          },
        },
      ],
    },
  ],
};

// Task 6.2 (pulled forward into PR5 — see inbound-conversation-event.ts):
// a real WhatsApp image message carries message.image.{id,mime_type}, a
// distinct shape from text/interactive messages.
const IMAGE_MESSAGE_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry-5",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "1234567890" },
            contacts: [{ profile: { name: "Juan Perez" }, wa_id: "51999999999" }],
            messages: [
              {
                from: "51999999999",
                id: "wamid.image-1",
                timestamp: "1700000400",
                type: "image",
                image: { id: "media-handle-123", mime_type: "image/jpeg", sha256: "abc" },
              },
            ],
          },
        },
      ],
    },
  ],
};

const STATUS_CALLBACK_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "entry-2",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "1234567890" },
            statuses: [{ id: "wamid.status1", status: "delivered", timestamp: "1700000100" }],
          },
        },
      ],
    },
  ],
};

// D6: the mapper is total — it must NEVER throw. Meta legitimately posts
// delivery statuses, reactions, system events, and shapes we have not
// modelled yet. A throwing mapper would turn a valid-but-new Meta payload
// into a 5xx and an infinite Meta retry loop.
describe("toInboundConversationEvent", () => {
  it("maps a real text message payload, carrying sender, message, and metadata unmodified", () => {
    const event = toInboundConversationEvent(TEXT_MESSAGE_PAYLOAD);

    expect(event.eventId).toBe("wamid.HBgLNTE5OTk5OTk5OTk=");
    expect(event.source).toBe("whatsapp");
    expect(event.messageType).toBe("text");
    expect(event.from).toBe("51999999999");
    expect(event.contactName).toBe("Juan Perez");
    expect(event.text).toBe("Hola, quiero una cita");
    expect(event.waPhoneNumberId).toBe("1234567890");
    expect(event.sentAt).toBe(new Date(1700000000 * 1000).toISOString());
    expect(event.receivedAt).toEqual(expect.any(String));
    expect(event.raw).toBe(TEXT_MESSAGE_PAYLOAD);
    // Regression guard (task 6.8): a plain text message never populates the
    // interactive-reply field.
    expect(event.interactiveReplyId).toBeUndefined();
  });

  // Task 6.8: real WhatsApp interactive-list replies arrive as
  // message.interactive.list_reply.id, not message.text.body — without this,
  // the FSM (conversation-fsm.ts) can never see a matched menu selection from
  // real WhatsApp traffic.
  it("maps a list_reply interactive message, populating interactiveReplyId from list_reply.id", () => {
    const event = toInboundConversationEvent(LIST_REPLY_PAYLOAD);

    expect(event.messageType).toBe("interactive");
    expect(event.from).toBe("51999999999");
    expect(event.interactiveReplyId).toBe("agendar_cita");
    expect(event.text).toBeUndefined();
    expect(event.raw).toBe(LIST_REPLY_PAYLOAD);
  });

  // Task 6.8: WhatsApp quick-reply buttons arrive as
  // message.interactive.button_reply.id — a distinct shape from list replies.
  it("maps a button_reply interactive message, populating interactiveReplyId from button_reply.id", () => {
    const event = toInboundConversationEvent(BUTTON_REPLY_PAYLOAD);

    expect(event.messageType).toBe("interactive");
    expect(event.from).toBe("51999999999");
    expect(event.interactiveReplyId).toBe("registrar_reclamo");
    expect(event.text).toBeUndefined();
    expect(event.raw).toBe(BUTTON_REPLY_PAYLOAD);
  });

  it("maps an image message, populating mediaId and mediaMimeType from message.image", () => {
    const event = toInboundConversationEvent(IMAGE_MESSAGE_PAYLOAD);

    expect(event.messageType).toBe("image");
    expect(event.mediaId).toBe("media-handle-123");
    expect(event.mediaMimeType).toBe("image/jpeg");
  });

  it("leaves mediaId and mediaMimeType undefined on a text message — never fabricates media fields", () => {
    const event = toInboundConversationEvent(TEXT_MESSAGE_PAYLOAD);

    expect(event.mediaId).toBeUndefined();
    expect(event.mediaMimeType).toBeUndefined();
  });

  it("never throws and yields undefined media fields on a malformed image object", () => {
    const raw = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: { messages: [{ from: "519999", id: "wamid.bad-image", type: "image", image: "not-an-object" }] },
            },
          ],
        },
      ],
    };

    expect(() => toInboundConversationEvent(raw)).not.toThrow();
    const event = toInboundConversationEvent(raw);
    expect(event.mediaId).toBeUndefined();
    expect(event.mediaMimeType).toBeUndefined();
  });

  it("maps a status-callback payload (no top-level message) to messageType 'unknown', preserving raw", () => {
    const event = toInboundConversationEvent(STATUS_CALLBACK_PAYLOAD);

    expect(event.messageType).toBe("unknown");
    expect(event.from).toBeUndefined();
    expect(event.text).toBeUndefined();
    expect(event.raw).toBe(STATUS_CALLBACK_PAYLOAD);
    expect(event.eventId).toEqual(expect.any(String));
  });

  it("never throws on an empty object — yields messageType 'unknown' with raw intact", () => {
    const raw = {};
    expect(() => toInboundConversationEvent(raw)).not.toThrow();

    const event = toInboundConversationEvent(raw);
    expect(event.messageType).toBe("unknown");
    expect(event.raw).toBe(raw);
  });

  it("never throws on null — yields messageType 'unknown' with raw intact", () => {
    expect(() => toInboundConversationEvent(null)).not.toThrow();

    const event = toInboundConversationEvent(null);
    expect(event.messageType).toBe("unknown");
    expect(event.raw).toBeNull();
  });

  it("never throws on a payload shaped around a future/unrecognized field — yields messageType 'unknown'", () => {
    const raw = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "some_future_field", value: { something: "we've never seen" } }] }],
    };
    expect(() => toInboundConversationEvent(raw)).not.toThrow();

    const event = toInboundConversationEvent(raw);
    expect(event.messageType).toBe("unknown");
    expect(event.raw).toBe(raw);
  });

  it("synthesizes a distinct eventId for two different unrecognized payloads — proves it is not a hardcoded constant", () => {
    const eventA = toInboundConversationEvent({});
    const eventB = toInboundConversationEvent({});

    expect(eventA.eventId).not.toBe(eventB.eventId);
  });
});
