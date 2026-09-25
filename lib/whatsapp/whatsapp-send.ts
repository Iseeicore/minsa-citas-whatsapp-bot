import { prisma } from "@/lib/db/prisma";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import type { SendEffect } from "@/lib/fsm/core/types";

function graphApiUrl(): string {
  const version = process.env.META_GRAPH_API_VERSION ?? "v21.0";
  return `https://graph.facebook.com/${version}/${process.env.META_PHONE_NUMBER_ID}/messages`;
}

// This WABA uses Meta's Business-Scoped User ID (BSUID) scheme — recipients
// are addressed via `recipient`, not `to` (see app/api/messages/send/route.ts
// for the same pattern used by the human-operator send path).
function buildGraphBody(waId: string, effect: SendEffect): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    recipient: waId,
  };

  switch (effect.kind) {
    case "send_text":
      return { ...base, type: "text", text: { body: effect.text } };

    case "send_buttons":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: effect.text },
          action: {
            buttons: effect.buttons.map((button) => ({
              type: "reply",
              reply: { id: button.id, title: button.title },
            })),
          },
        },
      };

    case "send_interactive_list":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: effect.text },
          action: {
            button: "Ver opciones",
            sections: [
              {
                rows: effect.rows.map((row) => ({
                  id: row.id,
                  title: row.title,
                  ...(row.description ? { description: row.description } : {}),
                })),
              },
            ],
          },
        },
      };

    case "send_cta_url":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: effect.text },
          action: {
            name: "cta_url",
            parameters: { display_text: effect.buttonText, url: effect.url },
          },
        },
      };
  }
}

export async function sendWhatsAppEffect(waId: string, effect: SendEffect): Promise<Response> {
  return fetch(graphApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildGraphBody(waId, effect)),
  });
}

// WhatsApp's cta_url is a distinct interactive subtype from "button" — a
// single tappable link button that opens an external URL. It's not part of
// the FSM's SendEffect union (no state produces one), it's only used for
// the one-off welcome message, so it's kept as its own small helper rather
// than folding it into buildGraphBody/sendWhatsAppEffect above.
export async function sendCtaUrlMessage(
  waId: string,
  params: { bodyText: string; buttonText: string; url: string },
): Promise<Response> {
  return fetch(graphApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      recipient: waId,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: params.bodyText },
        action: {
          name: "cta_url",
          parameters: { display_text: params.buttonText, url: params.url },
        },
      },
    }),
  });
}

// WhatsApp's typing indicator rides the same "mark as read" call as a read
// receipt — it shows "escribiendo…" in the citizen's real app and
// auto-dismisses the moment we send the next message (or after ~25s,
// whichever comes first). Meta's docs don't say whether the same inbound
// message_id can be reused across several calls in one turn, but marking an
// already-read message as read again is normally harmless, so this is
// called before every effect send in a multi-message turn — worst case it
// silently no-ops and the message still goes out. Never throws, same
// contract as the send helpers below.
export async function sendTypingIndicator(inboundMessageId: string): Promise<void> {
  try {
    await fetch(graphApiUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: inboundMessageId,
        typing_indicator: { type: "text" },
      }),
    });
  } catch (err) {
    console.error("sendTypingIndicator: network error", err);
  }
}

async function recordOutboundMessage(
  conversationId: string,
  text: string,
  waMessageId: string | undefined,
): Promise<void> {
  const now = new Date();

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: text,
        waMessageId: waMessageId ?? null,
        status: MessageStatus.SENT,
        timestamp: now,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now },
    }),
  ]);
}

// Sends a real WhatsApp message for a bot-driven effect and records it as an
// outbound Message, same as the human-operator send path — so the Chat real
// UI shows everything the bot said. Never throws: a failed automated send
// must not crash the webhook handler, which still owes Meta its fast 200.
export async function sendAndRecordEffect(
  conversationId: string,
  waId: string,
  effect: SendEffect,
): Promise<void> {
  let response: Response;
  try {
    response = await sendWhatsAppEffect(waId, effect);
  } catch (err) {
    console.error("sendAndRecordEffect: network error sending to Graph API", err);
    return;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("sendAndRecordEffect: Graph API returned an error", response.status, body);
    return;
  }

  const graphBody = await response.json().catch(() => ({}));
  const waMessageId = graphBody?.messages?.[0]?.id as string | undefined;
  await recordOutboundMessage(conversationId, effect.text, waMessageId);
}

// Same send-then-record contract as sendAndRecordEffect, for the one-off
// cta_url welcome message.
export async function sendAndRecordCtaUrl(
  conversationId: string,
  waId: string,
  params: { bodyText: string; buttonText: string; url: string },
): Promise<void> {
  let response: Response;
  try {
    response = await sendCtaUrlMessage(waId, params);
  } catch (err) {
    console.error("sendAndRecordCtaUrl: network error sending to Graph API", err);
    return;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("sendAndRecordCtaUrl: Graph API returned an error", response.status, body);
    return;
  }

  const graphBody = await response.json().catch(() => ({}));
  const waMessageId = graphBody?.messages?.[0]?.id as string | undefined;
  await recordOutboundMessage(conversationId, params.bodyText, waMessageId);
}
