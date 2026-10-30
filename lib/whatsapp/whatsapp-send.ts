import { findGraphMessagesTarget } from "@/lib/whatsapp/graph-api";
import { GraphTargetStatus } from "@/lib/enums/graph-target-status";
import { GraphPostStatus } from "@/lib/enums/graph-post-status";
import { WhatsAppSendOperation } from "@/lib/enums/whatsapp-send-operation";
import { ACTOR_SISTEMA_BOT } from "@/lib/db/actor";
import { recordOutboundMessage } from "@/lib/inbox/repository";
import type { ChannelSendEffect, SendEffect, SendOutcome } from "@/lib/fsm/core/types";
import { SendType } from "@/lib/enums/send-type";
import { SendOutcomeKind } from "@/lib/enums/send-outcome-kind";
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
import { toWhatsAppEffects } from "@/lib/whatsapp/consent-effects";

export type GraphPost = { status: GraphPostStatus.ANSWERED; response: Response } | { status: GraphPostStatus.NOT_CONFIGURED };

const FAILED: SendOutcome = { kind: SendOutcomeKind.FAILED };

function toRejectedOutcome(response: Response): SendOutcome {
  return { kind: SendOutcomeKind.REJECTED, status: response.status };
}

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

async function postGraphMessage(body: Record<string, unknown>): Promise<GraphPost> {
  const target = findGraphMessagesTarget();
  if (target.status === GraphTargetStatus.MISSING_VARIABLE) return { status: GraphPostStatus.NOT_CONFIGURED };
  const response = await fetch(target.url, {
    method: "POST",
    headers: { ...target.headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: GraphPostStatus.ANSWERED, response };
}

export async function sendWhatsAppEffect(waId: string, effect: ChannelSendEffect): Promise<GraphPost> {
  return postGraphMessage(buildGraphBody(waId, withinLimits(waId, effect)));
}

async function trySend(waId: string, effect: ChannelSendEffect): Promise<Response | undefined> {
  try {
    const post = await postGraphMessage(buildGraphBody(waId, effect));
    return post.status === GraphPostStatus.ANSWERED ? post.response : undefined;
  } catch (err) {
    logger.error("whatsapp.send_failed", { operation: WhatsAppSendOperation.SEND_EFFECT, waId: tail(waId), error: err });
    return undefined;
  }
}

async function readGraphError(response: Response): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await response.text();
  } catch (error) {
    return { status: response.status, bodyError: error };
  }
  const body = parseJsonOr(raw, undefined);
  const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
  if (error === undefined) return { status: response.status };
  return { status: response.status, errorCodeNumber: readNumber(error, "code"), errorMessage: readString(error, "message") };
}

async function logRejection(waId: string, effect: ChannelSendEffect, response: Response): Promise<void> {
  logger.error("outbound.rejected", { waId: tail(waId), kind: effect.kind, ...(await readGraphError(response)) });
}

export async function logSendFailure(operation: WhatsAppSendOperation, waId: string, response: Response): Promise<void> {
  logger.error("whatsapp.send_failed", { operation, waId: tail(waId), ...(await readGraphError(response)) });
}

async function readSentMessageId(response: Response): Promise<string | undefined> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    logger.warn("whatsapp.sent_without_id", { reason: "unreadable_body", error });
    return undefined;
  }
  const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
  const first: unknown = messages[0];
  const messageId = isRecord(first) ? readString(first, "id") : undefined;
  if (messageId === undefined) logger.warn("whatsapp.sent_without_id", { reason: "missing_id" });
  return messageId;
}

async function recordDelivered(conversationId: string | undefined, text: string, response: Response): Promise<SendOutcome> {
  const messageId = await readSentMessageId(response);
  if (conversationId !== undefined) await recordOutboundMessage(conversationId, text, messageId ?? null, ACTOR_SISTEMA_BOT);
  return messageId === undefined ? { kind: SendOutcomeKind.SENT_NO_ID } : { kind: SendOutcomeKind.SENT, messageId };
}

function sendCtaUrlMessage(waId: string, params: { bodyText: string; buttonText: string; url: string }): Promise<GraphPost> {
  return postGraphMessage({
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
  let post: GraphPost;
  try {
    post = await postGraphMessage({
      messaging_product: "whatsapp",
      status: "read",
      message_id: inboundMessageId,
      typing_indicator: { type: "text" },
    });
  } catch (error) {
    logger.warn("whatsapp.typing_failed", { error });
    return;
  }
  if (post.status === GraphPostStatus.ANSWERED && !post.response.ok)
    logger.warn("whatsapp.typing_failed", await readGraphError(post.response));
}

async function sendAndRecordMessage(conversationId: string | undefined, waId: string, effect: ChannelSendEffect): Promise<SendOutcome> {
  const outbound = withinLimits(waId, effect);
  const response = await trySend(waId, outbound);
  if (!response) return FAILED;
  if (response.ok) return recordDelivered(conversationId, outbound.text, response);

  await logRejection(waId, outbound, response);
  if (outbound.kind === SendType.TEXT || response.status !== HTTP_BAD_REQUEST) return toRejectedOutcome(response);

  const fallback = toNumberedTextEffect(outbound);
  const retry = await trySend(waId, fallback);
  if (!retry) return FAILED;
  if (!retry.ok) {
    await logRejection(waId, fallback, retry);
    return toRejectedOutcome(retry);
  }
  return recordDelivered(conversationId, fallback.text, retry);
}

export async function sendAndRecordEffect(conversationId: string | undefined, waId: string, effect: SendEffect): Promise<SendOutcome> {
  const messages = toWhatsAppEffects(effect);
  for (const leading of messages.slice(0, -1)) await sendAndRecordMessage(conversationId, waId, leading);
  return sendAndRecordMessage(conversationId, waId, messages[messages.length - 1]);
}

export async function sendAndRecordCtaUrl(
  conversationId: string | undefined,
  waId: string,
  params: { bodyText: string; buttonText: string; url: string },
): Promise<SendOutcome> {
  let post: GraphPost;
  try {
    post = await sendCtaUrlMessage(waId, params);
  } catch (err) {
    logger.error("whatsapp.send_failed", { operation: WhatsAppSendOperation.SEND_CTA_URL, waId: tail(waId), error: err });
    return FAILED;
  }
  if (post.status === GraphPostStatus.NOT_CONFIGURED) return FAILED;

  const { response } = post;
  if (!response.ok) {
    await logSendFailure(WhatsAppSendOperation.SEND_CTA_URL, waId, response);
    return toRejectedOutcome(response);
  }

  return recordDelivered(conversationId, params.bodyText, response);
}

export async function sendOperatorText(waId: string, text: string): Promise<SendOutcome> {
  const effect: ChannelSendEffect = { kind: SendType.TEXT, text };
  const response = await trySend(waId, effect);
  if (!response) return FAILED;
  if (!response.ok) {
    await logRejection(waId, effect, response);
    return toRejectedOutcome(response);
  }
  return recordDelivered(undefined, text, response);
}
