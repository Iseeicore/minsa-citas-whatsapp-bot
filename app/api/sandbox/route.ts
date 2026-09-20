import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTurn, type TurnResult } from "@/lib/fsm/executor";
import { handleFirstContact } from "@/lib/fsm/first-contact";
import { isQueryEffect } from "@/lib/fsm/handlers-shared";
import { traceTurn } from "@/lib/observability/tracer";
import { TurnLockTimeoutError, withTurnLock } from "@/lib/fsm/turn-lock";
import { resetAllSandboxTestSessions, resetSession, saveSession, sessionRowExists } from "@/lib/fsm/session-store";
import type { SendEffect } from "@/lib/fsm/types";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { checkFirstMessagePayload } from "@/lib/security/payload-filter";

const sandboxEventSchema = z.object({
  from: z.string().min(1),
  type: z.enum(["text", "button", "list", "image"]),
  text: z.string().optional(),
  listId: z.string().optional(),
  mediaId: z.string().optional(),
  mediaDataUri: z.string().optional(),
  reset: z.boolean().optional(),
  // Wipes every sandbox-* session (never a real WhatsApp waId one) instead
  // of just this browser's — the operator console's "reset everything"
  // button, so repeated manual testing never gets stuck on stale state.
  resetAll: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // Gated off by default — this app has no auth of its own, so anyone who
  // finds the public URL would otherwise reach the sandbox (and, with the
  // real-integration flags on, real MINSA/RENIEC/quejas calls).
  if (process.env.SANDBOX_ENABLED !== "true") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = sandboxEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: parsed.error.message },
      { status: 400 },
    );
  }

  const { from, type, text, listId, mediaId, mediaDataUri, reset, resetAll } = parsed.data;

  if (resetAll) {
    await resetAllSandboxTestSessions();
  } else if (reset) {
    await resetSession(from);
  }

  // Checked AFTER any reset above, so it's "did THIS from already have a
  // row going into this exact turn" — true for an in-progress conversation,
  // false for a brand-new device or one a resetAll just wiped, regardless
  // of which device's request actually triggered that reset. A reset only
  // shows the welcome to whoever clicked the button; every other sandbox-*
  // session that was wiped along with it only finds out on its own next
  // message, same as this one.
  const hadExistingSession = await sessionRowExists(from);

  // Same first-message perimeter as the WhatsApp webhook (length, links, media
  // without a session): a fixed reply, and the FSM is never touched.
  if (!hadExistingSession && (type === "text" || type === "image")) {
    const payload = checkFirstMessagePayload({ type: type === "image" ? "image" : "text", text });
    if (payload.kind === "rejected") {
      return NextResponse.json({
        sent: [{ kind: "send_text", text: payload.reply }],
        session: { state: "main_menu", slots: {}, counters: {} },
      });
    }
  }

  // A brand-new conversation is answered like the real webhook answers it (see
  // lib/fsm/first-contact.ts): the welcome and its "Seguir aquí" button — or,
  // when the citizen already asked for a cita, straight into the Cita flow.
  // An abusive first message is left to the FSM, whose lexical guard answers it.
  const abusiveFirstMessage =
    type === "text" && !!text && evaluateLexicalGuard(text).action !== "ALLOW";

  let turn;
  try {
    turn =
      !hadExistingSession && !abusiveFirstMessage
        ? await startConversation(from, type === "text" ? text : undefined)
        : await runTurn(from, { from, type, text, listId, mediaId, mediaDataUri });
  } catch (error) {
    // Another turn of this same session is still running and did not finish in
    // time: tell the client to retry instead of answering from stale state.
    if (error instanceof TurnLockTimeoutError) {
      return NextResponse.json({ error: "BUSY", message: "Tu mensaje anterior sigue en proceso. Intenta de nuevo." }, { status: 503 });
    }
    throw error;
  }
  const { sent, session } = turn;

  return NextResponse.json({
    sent,
    session: { state: session.state, slots: session.slots, counters: session.counters },
  });
}

async function startConversation(from: string, text?: string): Promise<TurnResult> {
  return withTurnLock(from, async () => {
    const fresh = { state: "main_menu", slots: {}, counters: {} };

    return traceTurn(from, { type: text === undefined ? "other" : "text", text }, fresh, async (trace) => {
      const first = handleFirstContact(text);
      for (const note of first.notes ?? []) trace.note(note);
      await saveSession(from, first.session);

      const sent = first.effects.filter((effect): effect is SendEffect => !isQueryEffect(effect));
      trace.complete({ session: first.session, sentCount: sent.length });
      return { sent, session: first.session };
    });
  });
}
