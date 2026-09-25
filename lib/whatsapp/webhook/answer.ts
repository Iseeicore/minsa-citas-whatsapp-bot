import { prisma } from "@/lib/db/prisma";
import { runTurnUnlocked } from "@/lib/fsm/core/executor";
import { failureNoticeThrottle } from "@/lib/fsm/core/failure-notice";
import { TURN_FAILURE_TEXT, TurnLockTimeoutError } from "@/lib/fsm/session/turn-lock";
import { logger } from "@/lib/observability/logger";
import { tail } from "@/lib/observability/mask";
import { routeLexicalAction } from "@/lib/fsm/routing/lexical-guard-routing";
import { isQueryEffect, withNote } from "@/lib/fsm/core/handlers-shared";
import { traceTurn } from "@/lib/observability/tracer";
import { saveSession } from "@/lib/fsm/session/session-store";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { sendAndRecordEffect, sendTypingIndicator, sendWhatsAppEffect } from "@/lib/whatsapp/whatsapp-send";
import { handleFirstContact } from "@/lib/fsm/routing/first-contact";
import { isEmergency } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import type { SendEffect } from "@/lib/fsm/core/types";
import { type WhatsAppMessage, toInboundEvent } from "@/lib/whatsapp/webhook/payload";

// Gives the real "escribiendo…" indicator a moment to actually show before
// each message lands, instead of the bot's replies arriving all at once.
const TYPING_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A brand-new conversation. No FSM turn runs for it, but it is traced like one
// (same traceId a re-delivery of the message would get).
async function answerFirstContact(message: WhatsAppMessage, conversationId: string): Promise<void> {
  const waId = message.from_user_id;
  const firstContactText = message.type === "text" ? message.text?.body : undefined;
  const fresh = { state: "main_menu", slots: {}, counters: {} };

  await traceTurn(
    waId,
    { type: message.type, text: firstContactText, messageId: message.id },
    fresh,
    async (trace) => {
      // An abusive very first message never gets the branded welcome: the
      // lexical guard routes it exactly like the FSM would at the main menu
      // (warning + Continuar, straight into Cita, or straight into Reclamo),
      // with zero AI calls. The session is still created so the button works.
      // (A medical emergency skips the guard: it is answered first, see out-of-scope.ts.)
      const verdict = firstContactText && !isEmergency(firstContactText) ? evaluateLexicalGuard(firstContactText) : undefined;

      // Otherwise: a citizen who already asked for a cita goes straight into the
      // Cita flow (their words seed the specialty and district); a greeting gets
      // the welcome alone; the rest get the menu. See first-contact.ts.
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

// Everything a citizen's message triggers — the first-contact check, the FSM
// turn AND the outbound sends — runs under that citizen's turn lock (see
// lib/fsm/session/turn-lock.ts), so two messages sent in quick succession are answered
// one after the other, in order, and never read a stale session. Called from
// inside withTurnLock, hence runTurnUnlocked (runTurn would wait on its own lock).
export async function answerMessage(message: WhatsAppMessage, conversationId: string): Promise<void> {
  const waId = message.from_user_id;
  const existingSession = await prisma.sandboxSession.findUnique({ where: { id: waId } });

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

// A rejection is plain text straight to the Graph API: no conversation row, no
// outbound record, no session. If the send fails there is nothing to recover.
export async function sendFixedReply(waId: string, text: string): Promise<void> {
  try {
    await sendWhatsAppEffect(waId, { kind: "send_text", text });
  } catch (error) {
    console.error("Failed to send a perimeter reply", error);
  }
}

// The turn could not be processed. A lock that gave up is a warning (busy); anything
// else is an error worth reading. The turn's own failure was already logged by the
// executor as turn.failed; this one also covers what happens around it.
export async function answerFailure(waId: string, error: unknown): Promise<void> {
  if (error instanceof TurnLockTimeoutError) {
    logger.warn("turn.lock_timeout", { waId: tail(waId), layer: error.layer });
  } else {
    logger.error("webhook.message_failed", { waId: tail(waId), error });
  }
  // Every failure is logged above; the reply to the citizen is throttled to
  // one every 30 s so a burst that fails outright doesn't send one text per
  // message (C4.2 of the audit report).
  if (failureNoticeThrottle.shouldNotify(waId)) {
    await sendFixedReply(waId, TURN_FAILURE_TEXT);
  }
}
