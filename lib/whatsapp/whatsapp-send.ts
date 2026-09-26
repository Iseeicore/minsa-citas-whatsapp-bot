import { graphApiVersion } from "@/lib/whatsapp/graph-api";
import { prisma } from "@/lib/db/prisma";
import { MessageDirection, MessageStatus, MessageType } from "@prisma/client";
import type { SendEffect } from "@/lib/fsm/core/types";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";

function graphApiUrl(): string {
  const version = graphApiVersion();
  return `https://graph.facebook.com/${version}/${process.env.META_PHONE_NUMBER_ID}/messages`;
}

/** Esta cuenta usa BSUID: el destinatario va en `recipient`; con `to` Graph API acepta la petición pero no entrega el mensaje. */
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
  } catch (error) {
    logger.warn("whatsapp.typing_failed", { error });
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

export async function sendAndRecordEffect(
  conversationId: string | null,
  waId: string,
  effect: SendEffect,
): Promise<void> {
  let response: Response;
  try {
    response = await sendWhatsAppEffect(waId, effect);
  } catch (err) {
    logger.error("whatsapp.send_failed", { operation: "send_effect", waId: tail(waId), error: err });
    return;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("whatsapp.send_failed", { operation: "send_effect", waId: tail(waId), status: response.status, response: body });
    return;
  }

  const graphBody = await response.json().catch(() => ({}));
  const waMessageId = graphBody?.messages?.[0]?.id as string | undefined;
  if (conversationId === null) return;
  await recordOutboundMessage(conversationId, effect.text, waMessageId);
}

export async function sendAndRecordCtaUrl(
  conversationId: string | null,
  waId: string,
  params: { bodyText: string; buttonText: string; url: string },
): Promise<void> {
  let response: Response;
  try {
    response = await sendCtaUrlMessage(waId, params);
  } catch (err) {
    logger.error("whatsapp.send_failed", { operation: "send_cta_url", waId: tail(waId), error: err });
    return;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("whatsapp.send_failed", { operation: "send_cta_url", waId: tail(waId), status: response.status, response: body });
    return;
  }

  const graphBody = await response.json().catch(() => ({}));
  const waMessageId = graphBody?.messages?.[0]?.id as string | undefined;
  if (conversationId === null) return;
  await recordOutboundMessage(conversationId, params.bodyText, waMessageId);
}
