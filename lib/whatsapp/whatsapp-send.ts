import { graphMessagesPath } from "@/lib/whatsapp/graph-api";
import { graphClient, graphNetworkError } from "@/lib/whatsapp/graph-client";
import { GraphResultStatus } from "@/lib/enums/graph-result-status";
import type { GraphResult, GraphSendMessageResponse } from "@/lib/types/graph-api.types";
import { ACTOR_SISTEMA_BOT } from "@/lib/db/actor";
import { recordOutboundMessage } from "@/lib/inbox/repository";
import type { SendEffect } from "@/lib/fsm/core/types";
import { SendType } from "@/lib/enums/send-type";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { LIST_OPEN_BUTTON_TEXT } from "@/lib/constants/textos/comunes";
import { findLimitViolations } from "@/lib/whatsapp/message-limits";
import { toNumberedTextEffect } from "@/lib/whatsapp/message-fallback";
import { isRecord } from "@/lib/utils/type-guards";
import { readNumber, readString } from "@/lib/utils/record-readers";
import { HTTP_BAD_REQUEST } from "@/lib/constants/http-status";
import { whatsappListRows } from "@/lib/utils/whatsapp-list-rows";

function buildGraphBody(waId: string, effect: SendEffect): Record<string, unknown> {
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

function withinLimits(waId: string, effect: SendEffect): SendEffect {
  const violations = findLimitViolations(effect);
  if (violations.length === 0) return effect;
  logger.warn("outbound.limit_violation", { waId: tail(waId), kind: effect.kind, violations });
  return toNumberedTextEffect(effect);
}

type GraphSendResult = GraphResult<GraphSendMessageResponse>;
type GraphSendFailure = Extract<GraphSendResult, { status: GraphResultStatus.ERROR }>;

function postEffect(waId: string, effect: SendEffect): Promise<GraphSendResult> {
  return graphClient.post<GraphSendMessageResponse>(graphMessagesPath(), buildGraphBody(waId, effect));
}

export async function sendWhatsAppEffect(waId: string, effect: SendEffect): Promise<GraphSendResult> {
  return postEffect(waId, withinLimits(waId, effect));
}

function logFailure(waId: string, effect: SendEffect, failure: GraphSendFailure): void {
  const networkError = graphNetworkError(failure);
  if (networkError) {
    logger.error("whatsapp.send_failed", { operation: "send_effect", waId: tail(waId), error: networkError });
    return;
  }
  const error = isRecord(failure.error) && isRecord(failure.error.error) ? failure.error.error : {};
  logger.error("outbound.rejected", {
    waId: tail(waId),
    kind: effect.kind,
    status: failure.httpStatus,
    errorCodeNumber: readNumber(error, "code"),
    errorMessage: readString(error, "message"),
  });
}

async function recordDelivered(conversationId: string | null, text: string, response: GraphSendMessageResponse): Promise<string | null> {
  const waMessageId = response.messages?.[0]?.id ?? null;
  if (conversationId !== null) await recordOutboundMessage(conversationId, text, waMessageId, ACTOR_SISTEMA_BOT);
  return waMessageId;
}

export async function sendCtaUrlMessage(
  waId: string,
  params: { bodyText: string; buttonText: string; url: string },
): Promise<GraphSendResult> {
  return graphClient.post<GraphSendMessageResponse>(graphMessagesPath(), {
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
  });
}

export async function sendTypingIndicator(inboundMessageId: string): Promise<void> {
  const result = await graphClient.post(graphMessagesPath(), {
    messaging_product: "whatsapp",
    status: "read",
    message_id: inboundMessageId,
    typing_indicator: { type: "text" },
  });
  const error = graphNetworkError(result);
  if (error) logger.warn("whatsapp.typing_failed", { error });
}

export async function sendAndRecordEffect(conversationId: string | null, waId: string, effect: SendEffect): Promise<string | null> {
  const outbound = withinLimits(waId, effect);
  const result = await postEffect(waId, outbound);
  if (result.status === GraphResultStatus.DATA) return recordDelivered(conversationId, outbound.text, result.data);

  logFailure(waId, outbound, result);
  if (outbound.kind === SendType.TEXT || result.httpStatus !== HTTP_BAD_REQUEST) return null;

  const fallback = toNumberedTextEffect(outbound);
  const retry = await postEffect(waId, fallback);
  if (retry.status === GraphResultStatus.DATA) return recordDelivered(conversationId, fallback.text, retry.data);
  logFailure(waId, fallback, retry);
  return null;
}

export async function sendAndRecordCtaUrl(
  conversationId: string | null,
  waId: string,
  params: { bodyText: string; buttonText: string; url: string },
): Promise<void> {
  const result = await sendCtaUrlMessage(waId, params);
  if (result.status === GraphResultStatus.ERROR) {
    const error = graphNetworkError(result);
    logger.error(
      "whatsapp.send_failed",
      error
        ? { operation: "send_cta_url", waId: tail(waId), error }
        : { operation: "send_cta_url", waId: tail(waId), status: result.httpStatus, response: JSON.stringify(result.error) },
    );
    return;
  }

  if (conversationId === null) return;
  await recordOutboundMessage(conversationId, params.bodyText, result.data.messages?.[0]?.id ?? null, ACTOR_SISTEMA_BOT);
}
