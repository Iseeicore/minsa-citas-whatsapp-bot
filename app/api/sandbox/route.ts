import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTurn } from "@/lib/fsm/executor";
import { resetAllSandboxTestSessions, resetSession } from "@/lib/fsm/session-store";
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

  const { sent, session } = await runTurn(from, { from, type, text, listId, mediaId, mediaDataUri });

  // Mirrors what a real citizen's very first WhatsApp message gets (see
  // app/webhook/whatsapp/route.ts) — a reset should look like starting over
  // from scratch, not skip straight to the bare menu list.
  const sentWithWelcome = reset || resetAll ? [buildWelcomeEffect(), ...sent] : sent;

  return NextResponse.json({
    sent: sentWithWelcome,
    session: { state: session.state, slots: session.slots, counters: session.counters },
  });
}
