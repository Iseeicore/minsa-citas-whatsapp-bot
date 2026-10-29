import { graphAuthHeaders, graphMessagesUrl } from "@/lib/whatsapp/graph-api";
import { ACTOR_SISTEMA_BOT } from "@/lib/db/actor";
import { recordOutboundMessage } from "@/lib/inbox/repository";
import type { ChannelSendEffect, SendEffect } from "@/lib/fsm/core/types";
import { SendType } from "@/lib/enums/send-type";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { LIST_OPEN_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import { toNumberedTextEffect } from "@/lib/whatsapp/message-fallback";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { isRecord } from "@/lib/utils/type-guards";
import { readNumber, readString } from "@/lib/utils/record-readers";
import { HTTP_BAD_REQUEST } from "@/lib/constants/http-status";
import { whatsappListRows } from "@/lib/utils/whatsapp-list-rows";
import { toWhatsAppEffects } from "@/lib/whatsapp/terminos-effects";

function buildGraphBody(waId: string, effect: ChannelSendEffect): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    recipient: waId,
  };

  switch (effect.kind) {
    case SendType.TEXT:
      return { ...base, type: "text", text: { body: effect.text } };

    case SendType.BUTTONS:
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

    case SendType.INTERACTIVE_LIST:
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: effect.text },
          action: {
            button: LIST_OPEN_BUTTON_TEXT,
            sections: [
              {
                rows: whatsappListRows(effect).map((row) => ({
                  id: row.id,
                  title: row.title,
                  ...(row.description ? { description: row.description } : {}),
                })),
              },
            ],
          },
        },
      };

    case SendType.CTA_URL:
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

function withinLimits(waId: string, effect: ChannelSendEffect): ChannelSendEffect {
  const violations = findLimitViolations(effect);
  if (violations.length === 0) return effect;
  logger.warn("outbound.limit_violation", { waId: tail(waId), kind: effect.kind, violations });
  return toNumberedTextEffect(effect);
}

function postEffect(waId: string, effect: ChannelSendEffect): Promise<Response> {
  return fetch(graphMessagesUrl(), {
    method: "POST",
    headers: { ...graphAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(buildGraphBody(waId, effect)),
  });
}

export async function sendWhatsAppEffect(waId: string, effect: ChannelSendEffect): Promise<Response> {
  return postEffect(waId, withinLimits(waId, effect));
}

async function trySend(waId: string, effect: ChannelSendEffect): Promise<Response | undefined> {
  try {
    return await postEffect(waId, effect);
  } catch (err) {
    logger.error("whatsapp.send_failed", { operation: "send_effect", waId: tail(waId), error: err });
    return undefined;
  }
}

async function logRejection(waId: string, effect: ChannelSendEffect, response: Response): Promise<void> {
  const body = parseJsonOr(await response.text().catch(() => ""), {});
  const error = isRecord(body) && isRecord(body.error) ? body.error : {};
  logger.error("outbound.rejected", {
    waId: tail(waId),
    kind: effect.kind,
    status: response.status,
    errorCodeNumber: readNumber(error, "code"),
    errorMessage: readString(error, "message"),
  });
}

async function recordDelivered(conversationId: string | null, text: string, response: Response): Promise<string | null> {
  const graphBody = await response.json().catch(() => ({}));
  const waMessageId = (graphBody?.messages?.[0]?.id as string | undefined) ?? null;
  if (conversationId !== null) await recordOutboundMessage(conversationId, text, waMessageId, ACTOR_SISTEMA_BOT);
  return waMessageId;
}

export async function sendCtaUrlMessage(waId: string, params: { bodyText: string; buttonText: string; url: string }): Promise<Response> {
  return fetch(graphMessagesUrl(), {
    method: "POST",
    headers: { ...graphAuthHeaders(), "Content-Type": "application/json" },
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
    await fetch(graphMessagesUrl(), {
      method: "POST",
      headers: { ...graphAuthHeaders(), "Content-Type": "application/json" },
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

async function sendAndRecordMessage(conversationId: string | null, waId: string, effect: ChannelSendEffect): Promise<string | null> {
  const outbound = withinLimits(waId, effect);
  const response = await trySend(waId, outbound);
  if (!response) return null;
  if (response.ok) return recordDelivered(conversationId, outbound.text, response);

  await logRejection(waId, outbound, response);
  if (outbound.kind === SendType.TEXT || response.status !== HTTP_BAD_REQUEST) return null;

  const fallback = toNumberedTextEffect(outbound);
  const retry = await trySend(waId, fallback);
  if (!retry) return null;
  if (!retry.ok) {
    await logRejection(waId, fallback, retry);
    return null;
  }
  return recordDelivered(conversationId, fallback.text, retry);
}

export async function sendAndRecordEffect(conversationId: string | null, waId: string, effect: SendEffect): Promise<string | null> {
  let sentId: string | null = null;
  for (const message of toWhatsAppEffects(effect)) sentId = await sendAndRecordMessage(conversationId, waId, message);
  return sentId;
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
  await recordOutboundMessage(conversationId, params.bodyText, waMessageId ?? null, ACTOR_SISTEMA_BOT);
}
