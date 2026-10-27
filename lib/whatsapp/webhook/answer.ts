import { runTurnUnlocked } from "@/lib/fsm/core/executor";
import { failureNoticeThrottle } from "@/lib/fsm/core/failure-notice";
import { TurnLockTimeoutError } from "@/lib/errors/turn-lock-timeout-error";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { routeLexicalAction } from "@/lib/fsm/routing/lexical-guard-routing";
import { isQueryEffect, withNote } from "@/lib/fsm/core/handlers-shared";
import { SendType } from "@/lib/enums/send-type";
import { traceTurn } from "@/lib/observability/tracer";
import { findSession, saveSession } from "@/lib/fsm/session/session-store";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { sendAndRecordEffect, sendTypingIndicator, sendWhatsAppEffect } from "@/lib/whatsapp/whatsapp-send";
import { graphNetworkError } from "@/lib/whatsapp/graph-client";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { textoDeLaPersona } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { isEmergency } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import type { InteractiveTracking, SendEffect } from "@/lib/fsm/core/types";
import { type WhatsAppMessage, toInboundEvent } from "@/lib/whatsapp/webhook/payload";
import { SessionState } from "@/lib/enums/session-state";
import type { LatencyMarks } from "@/lib/observability/inbound-latency";
import { TURN_FAILURE_TEXT } from "@/lib/constants/textos/fallas";
import { trackSent, withInteractiveTracking } from "@/lib/fsm/core/interactive-reply";

const TYPING_DELAY_MS = 1000;

function firstSendMarker(marks: LatencyMarks | undefined) {
  let marked = false;
  return {
    beforeSend() {
      if (!marked) marks?.mark("turn");
    },
    afterSend() {
      if (!marked) marks?.mark("first_send");
      marked = true;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deliverTo(message: WhatsAppMessage, conversationId: string | null, marks: LatencyMarks | undefined) {
  const first = firstSendMarker(marks);
  return async (effect: SendEffect): Promise<string | null> => {
    first.beforeSend();
    await sendTypingIndicator(message.id);
    const sentId = await sendAndRecordEffect(conversationId, message.from_user_id, effect);
    first.afterSend();
    return sentId;
  };
}

async function answerFirstContact(message: WhatsAppMessage, conversationId: string | null, marks?: LatencyMarks): Promise<void> {
  const waId = message.from_user_id;
  const firstContactText = message.type === "text" ? message.text?.body : undefined;
  const fresh = { state: SessionState.MAIN_MENU, slots: {}, counters: {}, channel: "whatsapp" as const };

  const written = firstContactText ? textoDeLaPersona(firstContactText) : undefined;
  const verdict = written && !isEmergency(written) ? evaluateLexicalGuard(written) : undefined;
  const first =
    verdict && verdict.action !== "ALLOW"
      ? withNote(routeLexicalAction(fresh, verdict.action, firstContactText), {
          kind: "lexical_guard",
          level: "warn",
          detail: { action: verdict.action, state: "first_contact" },
        })
      : handleFirstContact(firstContactText, "whatsapp");

  if (first.effects.some(isQueryEffect)) {
    const deliver = deliverTo(message, conversationId, marks);
    let delivered = 0;
    const { sent } = await runTurnUnlocked(
      waId,
      { from: waId, type: "text", text: firstContactText, messageId: message.id, channel: "whatsapp" },
      {
        onSend: async (effect) => {
          delivered += 1;
          return deliver(effect);
        },
        onWaitingForQuery: () => sendTypingIndicator(message.id),
      },
      first,
    );
    for (const effect of sent.slice(delivered)) await deliver(effect);
    return;
  }

  await traceTurn(waId, { type: message.type, text: firstContactText, messageId: message.id }, fresh, async (trace) => {
    for (const note of first.notes ?? []) trace.note(note);

    const toSend = first.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
    const deliver = deliverTo(message, conversationId, marks);
    let tracking: InteractiveTracking = { consumed: false };
    for (const effect of toSend) tracking = trackSent(tracking, effect, await deliver(effect));

    const session = withInteractiveTracking(first.session, tracking);
    await saveSession(waId, session);
    trace.complete({ session, sentCount: toSend.length });
  });
}

export async function answerMessage(message: WhatsAppMessage, conversationId: string | null, marks?: LatencyMarks): Promise<void> {
  const waId = message.from_user_id;
  const existingSession = await findSession(waId);

  if (!existingSession) {
    await answerFirstContact(message, conversationId, marks);
    return;
  }

  const inboundEvent = await toInboundEvent(waId, message, existingSession.state);
  if (!inboundEvent) return;

  const first = firstSendMarker(marks);
  const deliver = async (effect: SendEffect): Promise<string | null> => {
    first.beforeSend();
    await sendTypingIndicator(message.id);
    await sleep(TYPING_DELAY_MS);
    const sentId = await sendAndRecordEffect(conversationId, waId, effect);
    first.afterSend();
    return sentId;
  };

  let delivered = 0;
  const { sent } = await runTurnUnlocked(
    waId,
    { ...inboundEvent, messageId: message.id, channel: "whatsapp" },
    {
      onSend: async (effect) => {
        delivered += 1;
        return deliver(effect);
      },
      onWaitingForQuery: () => sendTypingIndicator(message.id),
      onAccepted: () => sendTypingIndicator(message.id),
    },
  );

  for (const effect of sent.slice(delivered)) await deliver(effect);
}

export async function sendFixedReply(waId: string, text: string): Promise<void> {
  const error = await sendWhatsAppEffect(waId, { kind: SendType.TEXT, text }).then(graphNetworkError, (thrown: unknown) => thrown);
  if (error) logger.error("webhook.fixed_reply_failed", { waId: tail(waId), error });
}

export async function answerFailure(waId: string, error: unknown): Promise<void> {
  if (error instanceof TurnLockTimeoutError) {
    logger.warn("turn.lock_timeout", { waId: tail(waId), layer: error.layer });
  } else {
    logger.error("webhook.message_failed", { waId: tail(waId), error });
  }
  if (failureNoticeThrottle.shouldNotify(waId)) {
    await sendFixedReply(waId, TURN_FAILURE_TEXT);
  }
}
