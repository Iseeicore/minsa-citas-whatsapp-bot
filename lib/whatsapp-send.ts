import { prisma } from "@/lib/prisma";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import type { SendEffect } from "@/lib/fsm/types";

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
  const now = new Date();

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        direction: MessageDirection.OUTBOUND,
        type: MessageType.TEXT,
        content: effect.text,
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
