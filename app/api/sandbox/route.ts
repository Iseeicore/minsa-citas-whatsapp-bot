import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTurn } from "@/lib/fsm/executor";
import { TurnLockTimeoutError } from "@/lib/fsm/turn-lock";
import { resetAllSandboxTestSessions, resetSession, sessionRowExists } from "@/lib/fsm/session-store";
import { buildWelcomeEffect } from "@/lib/fsm/welcome";
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

  let turn;
  try {
    turn = await runTurn(from, { from, type, text, listId, mediaId, mediaDataUri });
  } catch (error) {
    // Another turn of this same session is still running and did not finish in
    // time: tell the client to retry instead of answering from stale state.
    if (error instanceof TurnLockTimeoutError) {
      return NextResponse.json({ error: "BUSY", message: "Tu mensaje anterior sigue en proceso. Intenta de nuevo." }, { status: 503 });
    }
    throw error;
  }
  const { sent, session } = turn;

  // Mirrors what a real citizen's very first WhatsApp message gets (see
  // app/webhook/whatsapp/route.ts) — starting over should look like
  // starting over, not skip straight to the bare menu list. An abusive first
  // message gets no welcome there (the lexical guard answers it instead), so
  // it gets none here either.
  const abusiveFirstMessage =
    type === "text" && !!text && evaluateLexicalGuard(text).action !== "ALLOW";
  const sentWithWelcome =
    hadExistingSession || abusiveFirstMessage ? sent : [buildWelcomeEffect(), ...sent];

  return NextResponse.json({
    sent: sentWithWelcome,
    session: { state: session.state, slots: session.slots, counters: session.counters },
  });
}
