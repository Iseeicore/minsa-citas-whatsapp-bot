import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTurn } from "@/lib/fsm/executor";
import { resetAllSandboxTestSessions, resetSession, sessionRowExists } from "@/lib/fsm/session-store";
import { buildWelcomeEffect } from "@/lib/fsm/welcome";

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

  const { sent, session } = await runTurn(from, { from, type, text, listId, mediaId, mediaDataUri });

  // Mirrors what a real citizen's very first WhatsApp message gets (see
  // app/webhook/whatsapp/route.ts) — starting over should look like
  // starting over, not skip straight to the bare menu list.
  const sentWithWelcome = hadExistingSession ? sent : [buildWelcomeEffect(), ...sent];

  return NextResponse.json({
    sent: sentWithWelcome,
    session: { state: session.state, slots: session.slots, counters: session.counters },
  });
}
