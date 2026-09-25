import { runTurnUnlocked } from "@/lib/fsm/core/executor";
import { failureNoticeThrottle } from "@/lib/fsm/core/failure-notice";
import { TURN_FAILURE_TEXT, TurnLockTimeoutError } from "@/lib/fsm/session/turn-lock";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { routeLexicalAction } from "@/lib/fsm/routing/lexical-guard-routing";
import { isQueryEffect, withNote } from "@/lib/fsm/core/handlers-shared";
import { traceTurn } from "@/lib/observability/tracer";
import { findSession, saveSession } from "@/lib/fsm/session/session-store";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { sendAndRecordEffect, sendTypingIndicator, sendWhatsAppEffect } from "@/lib/whatsapp/whatsapp-send";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { isEmergency } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import type { SendEffect } from "@/lib/fsm/core/types";
import { type WhatsAppMessage, toInboundEvent } from "@/lib/whatsapp/webhook/payload";

const TYPING_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function answerFirstContact(message: WhatsAppMessage, conversationId: string | null): Promise<void> {
  const waId = message.from_user_id;
  const firstContactText = message.type === "text" ? message.text?.body : undefined;
  const fresh = { state: "main_menu", slots: {}, counters: {} };

  await traceTurn(
    waId,
    { type: message.type, text: firstContactText, messageId: message.id },
    fresh,
    async (trace) => {
      const verdict = firstContactText && !isEmergency(firstContactText) ? evaluateLexicalGuard(firstContactText) : undefined;

      const first =
        verdict && verdict.action !== "ALLOW"
          ? withNote(routeLexicalAction(fresh, verdict.action, firstContactText), {
              kind: "lexical_guard",
              level: "warn",
              detail: { action: verdict.action, state: "first_contact" },
            })
          : handleFirstContact(firstContactText);

      for (const note of first.notes ?? []) trace.note(note);
      await saveSession(waId, first.session);

      const toSend = first.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
      trace.complete({ session: first.session, sentCount: toSend.length });

      for (const effect of toSend) {
        await sendTypingIndicator(message.id);
        await sleep(TYPING_DELAY_MS);
        await sendAndRecordEffect(conversationId, waId, effect);
      }
    },
  );
}

export async function answerMessage(message: WhatsAppMessage, conversationId: string | null): Promise<void> {
  const waId = message.from_user_id;
  const existingSession = await findSession(waId);

  if (!existingSession) {
    await answerFirstContact(message, conversationId);
    return;
  }

  const inboundEvent = await toInboundEvent(waId, message, existingSession.state);
  if (!inboundEvent) return;

  const { sent } = await runTurnUnlocked(waId, { ...inboundEvent, messageId: message.id });
  for (const effect of sent) {
    await sendTypingIndicator(message.id);
    await sleep(TYPING_DELAY_MS);
    await sendAndRecordEffect(conversationId, waId, effect);
  }
}

export async function sendFixedReply(waId: string, text: string): Promise<void> {
  try {
    await sendWhatsAppEffect(waId, { kind: "send_text", text });
  } catch (error) {
    console.error("Failed to send a perimeter reply", error);
  }
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
